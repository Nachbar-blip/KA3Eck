import { test, expect, Page } from '@playwright/test';

const CATEGORIES = [
  'all',
  'winkelmessen',
  'winkelpaare',
  'dreiecksarten',
  'konstruieren',
  'konstruierbarkeit',
  'kongruenz',
  'mittelsenkrechte',
  'winkelhalbierende',
];

const EXPECTED_COUNTS: Record<string, number> = {
  winkelmessen: 3,
  winkelpaare: 4,
  dreiecksarten: 3,
  konstruieren: 3,
  konstruierbarkeit: 3,
  kongruenz: 2,
  mittelsenkrechte: 3,
  winkelhalbierende: 3,
};

// Counter format from index.html: `Karte ${currentIndex + 1} von ${filteredCards.length}`
function parseTotal(counterText: string): number {
  const match = counterText.match(/von\s+(\d+)/);
  if (!match) throw new Error(`Counter text did not match expected format: "${counterText}"`);
  return parseInt(match[1], 10);
}

function parseCurrent(counterText: string): number {
  const match = counterText.match(/Karte\s+(\d+)\s+von/);
  if (!match) throw new Error(`Counter text did not match expected format: "${counterText}"`);
  return parseInt(match[1], 10);
}

async function gotoIndex(page: Page) {
  // Use a unique localStorage namespace per test by clearing it after navigation
  await page.goto('index.html');
  await page.evaluate(() => localStorage.clear());
  // Reload so the trainer initializes with a clean state
  await page.reload();
  // Wait for the counter to be populated by displayCard()
  await expect(page.locator('#cardCounter')).toContainText(/Karte\s+\d+\s+von\s+\d+/);
}

test.describe('KA3Eck Dreieck-6 Trainer', () => {
  test('A — Page lädt mit korrektem Title', async ({ page }) => {
    await gotoIndex(page);
    await expect(page).toHaveTitle(/KA3Eck/);
    await expect(page.locator('h1')).toContainText('KA3Eck');
  });

  test('B — 9 Tabs sichtbar mit korrekten data-category-Werten', async ({ page }) => {
    await gotoIndex(page);
    const tabs = page.locator('.category-tab');
    await expect(tabs).toHaveCount(9);

    for (const cat of CATEGORIES) {
      await expect(page.locator(`.category-tab[data-category="${cat}"]`)).toBeVisible();
    }
  });

  test('C — "Alle"-Tab zeigt 24 Karten', async ({ page }) => {
    await gotoIndex(page);
    // Alle-Tab is active by default. Click it to be explicit.
    await page.locator('.category-tab[data-category="all"]').click();
    const counterText = (await page.locator('#cardCounter').textContent()) ?? '';
    expect(parseTotal(counterText)).toBe(24);
  });

  test.describe('D — Jede Kategorie hat richtige Anzahl Karten', () => {
    for (const [cat, expected] of Object.entries(EXPECTED_COUNTS)) {
      test(`Kategorie "${cat}" hat ${expected} Karten`, async ({ page }) => {
        await gotoIndex(page);
        await page.locator(`.category-tab[data-category="${cat}"]`).click();
        const counterText = (await page.locator('#cardCounter').textContent()) ?? '';
        expect(parseTotal(counterText)).toBe(expected);
      });
    }
  });

  test('E — Aufdecken/Weiter funktioniert', async ({ page }) => {
    await gotoIndex(page);
    await page.locator('.category-tab[data-category="all"]').click();

    // Karte 1: Frage prüfen (nicht leer)
    const question = page.locator('#cardQuestion');
    await expect(question).not.toHaveText('');
    const questionText = (await question.textContent()) ?? '';
    expect(questionText.trim().length).toBeGreaterThan(0);

    // Counter sollte "Karte 1 von 24" sein
    const counter = page.locator('#cardCounter');
    let counterText = (await counter.textContent()) ?? '';
    expect(parseCurrent(counterText)).toBe(1);
    expect(parseTotal(counterText)).toBe(24);

    // "Aufdecken" klicken → Klasse `.flipped` auf `#flashcard`
    await page.locator('#flipBtn').click();
    await expect(page.locator('#flashcard')).toHaveClass(/flipped/);

    // "Weiter →" klicken → Counter geht von 1 auf 2
    await page.locator('#nextBtn').click();
    await expect(counter).toContainText('Karte 2 von 24');
    counterText = (await counter.textContent()) ?? '';
    expect(parseCurrent(counterText)).toBe(2);
    expect(parseTotal(counterText)).toBe(24);
  });

  test('G — Buttons überlappen nicht mit Antworttext (alle 24 Karten, Desktop+Mobile)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load')) {
        consoleErrors.push(msg.text());
      }
    });

    await gotoIndex(page);
    await page.locator('.category-tab[data-category="all"]').click();

    const counterText = (await page.locator('#cardCounter').textContent()) ?? '';
    const total = parseTotal(counterText);

    for (let i = 0; i < total; i++) {
      // Aufdecken
      const klass = await page.locator('#flashcard').getAttribute('class');
      await page.locator('#flipBtn').click();
      await expect(
        page.locator('#flashcard'),
        `Karte ${i + 1}/${total}: flip schlug fehl. Klasse vorher: "${klass}". Console-Errors: ${consoleErrors.join(' | ')}`,
      ).toHaveClass(/flipped/);

      // Bounding-Boxes der Antwort und der Buttons holen
      const back = await page.locator('.card-back').boundingBox();
      const controls = await page.locator('.controls').boundingBox();
      const rating = await page.locator('#ratingButtons').boundingBox();

      if (!back || !controls) {
        throw new Error(`Karte ${i + 1}: Bounding-Box fehlt (back=${!!back}, controls=${!!controls})`);
      }

      // Controls müssen UNTERHALB der Antwort beginnen — kein Überlappen
      expect(
        controls.y,
        `Karte ${i + 1}: .controls (y=${controls.y}) startet vor Ende der .card-back (y+h=${back.y + back.height})`,
      ).toBeGreaterThanOrEqual(back.y + back.height);

      if (rating) {
        expect(
          rating.y,
          `Karte ${i + 1}: .rating-buttons (y=${rating.y}) überlappt .card-back (y+h=${back.y + back.height})`,
        ).toBeGreaterThanOrEqual(back.y + back.height);
      }

      // Weiter zur nächsten Karte (außer bei der letzten).
      // nextCard() hat ein 400ms isNavigating-Debounce, das einen schnellen
      // Klick verschluckt. 450ms warten, bis das Debounce-Fenster zu ist.
      if (i < total - 1) {
        await page.waitForTimeout(450);
        await page.locator('#nextBtn').click();
        await expect(page.locator('#cardCounter')).toContainText(`Karte ${i + 2} von`);
      }
    }
  });

  test('F — Keine Console-Errors beim Durchklicken', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // KaTeX-Fonts können beim ersten Lauf 'Failed to load resource' werfen — ignorieren
        if (!text.includes('Failed to load')) {
          errors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await gotoIndex(page);

    // Alle 9 Tabs durchklicken, je einmal aufdecken
    for (const cat of CATEGORIES) {
      await page.locator(`.category-tab[data-category="${cat}"]`).click();
      // Warten bis Counter aktualisiert ist
      await expect(page.locator('#cardCounter')).toContainText(/Karte\s+\d+\s+von\s+\d+/);
      // Aufdecken (nur wenn überhaupt Karten in der Kategorie)
      const flipBtn = page.locator('#flipBtn');
      if (await flipBtn.isVisible()) {
        await flipBtn.click();
      }
    }

    expect(errors, `Unexpected console errors: ${errors.join('\n')}`).toEqual([]);
  });
});

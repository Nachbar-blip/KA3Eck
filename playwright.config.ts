import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'file:///C:/DevProjects/schule/zzz_TOP/Dreieck-6/',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    // Use a Chromium-based mobile device (Pixel 5) to honor the "only Chromium" requirement.
    // iPhone SE would pull in WebKit and require an extra browser install.
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
  ],
});

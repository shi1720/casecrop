import { defineConfig, devices } from '@playwright/test';
const production = process.env.CASECROP_TEST_PRODUCTION === '1';
const localURL = production ? 'http://localhost:3001' : 'http://localhost:3000';
export default defineConfig({
  testDir: './tests-web',
  fullyParallel: false,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.TEST_URL || localURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: process.env.TEST_URL
    ? undefined
    : {
        command: production ? 'npm run start -- --port 3001' : 'npm run dev',
        url: localURL,
        reuseExistingServer: !process.env.CI && !production,
        timeout: 120_000,
      },
});

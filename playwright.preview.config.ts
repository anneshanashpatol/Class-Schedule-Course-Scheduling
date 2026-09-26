import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /(calendar-preview|core)\.spec\.ts/,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

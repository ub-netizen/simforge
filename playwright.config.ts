import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the production build (`npm run test:e2e` builds first).
 * They drive the locally installed Google Chrome (`channel: 'chrome'`), which is
 * also preinstalled on GitHub's Ubuntu runners, so no browser download is needed.
 */
export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/screenshots.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/simforge/',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/simforge/',
    reuseExistingServer: !process.env.CI,
  },
});

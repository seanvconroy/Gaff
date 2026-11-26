import { defineConfig, devices } from '@playwright/test';
import { e2eEnv } from './playwright.config';

/**
 * The user-journey deck (docs/decks): the journeys in `tests/deck` walk Gaff end to end through
 * the real screens and photograph every one at desktop and phone width. It uses the same
 * production build and test environment as the end-to-end journeys, with the test copy's
 * made-up homes seeded so search looks as it will when Gaff is live:
 *
 *   pnpm build && pnpm deck
 *
 * Each run has a database and a port of its own (E2E_DATABASE_URL, E2E_PORT), so two can run
 * side by side. Nothing here is a test of Gaff: `pnpm test:e2e` doesn't run it.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/deck',
  outputDir: `test-results/deck-${port}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 1_800_000,
  reporter: 'list',
  globalSetup: './tests/deck/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
    trace: 'off',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv,
  },
});

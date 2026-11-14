import { defineConfig, devices } from '@playwright/test';
import { e2eEnv } from './playwright.config';

/**
 * M136: the real-map run. The same production build and test environment as the end-to-end
 * journeys, with Google's map (the Maps JavaScript API) where they have the stand-in:
 *
 *   pnpm build:map && pnpm test:map
 *
 * - `tests/google/failures.spec.ts` needs no key. It shows that nothing leaves for another site
 *   before the map is wanted, and that every way Google's map can fail ends in Gaff's own
 *   sentence. Two of its tests ask Google for its real script.
 * - `tests/google/map.spec.ts` needs a real key in GOOGLE_MAPS_TEST_KEY (docs/deploy.md: the
 *   test run's own project, restricted to this server's address, with a small daily cap). It's
 *   skipped without one.
 *
 * `.github/workflows/map.yml` runs both every night on the quarterly and the weekly channel, on
 * demand, and when the map's code changes. `pnpm build` afterwards puts the usual build back.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

/** The test run's own key. Without it, Google refuses the stand-in below, as the tests expect. */
export const MAP_TEST_KEY = process.env.GOOGLE_MAPS_TEST_KEY ?? '';

export const mapEnv = {
  ...e2eEnv,
  MAP_PROVIDER: 'google',
  GOOGLE_MAPS_API_KEY: MAP_TEST_KEY || 'no-key-in-this-run',
  // Google's own Map ID for trying things out: advanced markers need one. The test run's
  // project can have its own (GOOGLE_MAPS_TEST_MAP_ID), styled like production's.
  GOOGLE_MAPS_MAP_ID: process.env.GOOGLE_MAPS_TEST_MAP_ID || 'DEMO_MAP_ID',
  ...(process.env.GOOGLE_MAPS_TEST_MAP_ID_DARK
    ? { GOOGLE_MAPS_MAP_ID_DARK: process.env.GOOGLE_MAPS_TEST_MAP_ID_DARK }
    : {}),
  GOOGLE_MAPS_VERSION: process.env.GOOGLE_MAPS_VERSION || 'quarterly',
};

/** Where Chromium reaches Google, when this machine reaches the internet through a proxy. */
const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
  : undefined;

export default defineConfig({
  testDir: 'tests/google',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  // Google's servers are part of this run: one retry tells a slow night from a broken map.
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/google/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
    trace: 'retain-on-failure',
    ...(proxy ? { proxy } : {}),
  },
  projects: [{ name: 'google', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: mapEnv,
  },
});

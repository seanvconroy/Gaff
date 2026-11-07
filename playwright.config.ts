import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://gaff:gaff@localhost:5432/gaff_e2e';

/**
 * E2E_JOBS=vercel runs the journeys the way Vercel runs jobs (ADR-0014): no worker; jobs run
 * straight after the request that queued them, and a frequent call to the tick stands in for
 * the minute tick. Otherwise the real worker runs, as locally.
 */
export const vercelJobs = process.env.E2E_JOBS === 'vercel';
export const E2E_CRON_SECRET = 'e2e-cron-secret-at-least-16-characters';

/** Environment for the web server and the worker in end-to-end runs (GAFF_ENV=test). */
export const e2eEnv = {
  GAFF_ENV: 'test',
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: `http://localhost:${port}`,
  AUTH_SECRET: 'e2e-secret-that-is-at-least-32-characters',
  EMAIL_PROVIDER: 'dev',
  SMS_PROVIDER: 'fake',
  AI_PROVIDER: 'fake',
  INBOUND_DOMAIN: 'in.gaff.test',
  MAIL_FROM_DOMAIN: 'mail.gaff.test',
  DEV_TOOLS: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  CRON_SECRET: E2E_CRON_SECRET,
  RUN_JOBS_AFTER_REQUESTS: vercelJobs ? '1' : '0',
  // The journeys run as at launch, with the marketplace's public side open (ADR-0015).
  MARKETPLACE_PUBLIC: '1',
  // M87: alerts are grouped for 2 minutes in production; a few seconds keeps the journeys quick.
  ALERT_GROUP_SECONDS: '3',
};

/**
 * End-to-end tests run against a production build (`pnpm build` first). Global setup gives
 * each run a fresh database and starts the real worker; the web server is `next start`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv,
  },
});

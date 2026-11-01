import { spawn } from 'node:child_process';
import pg from 'pg';
import { E2E_CRON_SECRET, E2E_DATABASE_URL, e2eEnv, vercelJobs } from '../../playwright.config';
import { runMigrations } from '../../src/db/migrate';

/**
 * A fresh, migrated database for each run, and the real background worker; or, with
 * E2E_JOBS=vercel, no worker and a tick every few seconds, as on Vercel (ADR-0014).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const url = new URL(E2E_DATABASE_URL);
  const name = url.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
  });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  await runMigrations(url.toString());

  if (vercelJobs) {
    const tick = () =>
      fetch(`${e2eEnv.APP_URL}/api/cron/tick`, {
        headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
      }).catch(() => undefined);
    const timer = setInterval(() => void tick(), 5_000);
    return async () => clearInterval(timer);
  }

  const worker = spawn('pnpm', ['worker'], {
    env: { ...process.env, ...e2eEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker.stderr.on('data', (chunk: Buffer) => process.stderr.write(`[worker] ${chunk}`));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The worker did not start')), 30_000);
    worker.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Gaff worker started')) {
        clearTimeout(timer);
        resolve();
      }
    });
    worker.on('exit', (code) => reject(new Error(`The worker exited early (${code})`)));
  });

  return async () => {
    worker.kill('SIGTERM');
  };
}

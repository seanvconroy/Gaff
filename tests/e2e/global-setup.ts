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
  // M56 (ADR-0018): the whole place index, loaded as a production deployment loads it.
  await loadThePlaceIndex();

  // UX-AG-1: the weekly job loads Gaff's copy of the PSRA register (the made-up sample here). It
  // is run now, on the empty database, so every journey finds the same register from the start.
  await loadTheRegister(url.toString());

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

/** `pnpm places:load` against this run's database: every place in Ireland the index knows. */
async function loadThePlaceIndex(): Promise<void> {
  const loader = spawn('pnpm', ['places:load'], {
    env: { ...process.env, ...e2eEnv },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    loader.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`The place index didn't load (${code})`)),
    );
  });
}

/**
 * Asks the app to run its daily jobs, as the daily cron does: that queues the refresh of the
 * register, which has never run on this database, and runs it. Then waits for the copy.
 */
async function loadTheRegister(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (let tries = 0; tries < 60; tries++) {
      const daily = await fetch(`${e2eEnv.APP_URL}/api/cron/daily`, {
        headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
      }).catch(() => null);
      const { rows } = await client.query<{ n: number }>(
        'select count(*)::int as n from psra_register',
      );
      if (daily?.ok && rows[0]!.n > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await client.end();
  }
  throw new Error('The PSRA register was not loaded');
}

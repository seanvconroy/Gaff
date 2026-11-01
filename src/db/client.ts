import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '@/lib/env';
import { poolConfig } from './connection';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// One pool per process, kept across hot reloads in development.
const cache = globalThis as unknown as { gaffPool?: pg.Pool; gaffDb?: Db };

// On Vercel each function instance has its own pool, so keep it small and let idle
// connections go quickly: the database's pooler has a limited number to share (ADR-0014).
const onVercel = process.env.VERCEL === '1';

export function pool(): pg.Pool {
  if (!cache.gaffPool) {
    const config = env();
    cache.gaffPool = new pg.Pool({
      ...poolConfig(config.DATABASE_URL, config.DATABASE_CA_CERT),
      max: onVercel ? 5 : 10,
      idleTimeoutMillis: onVercel ? 5_000 : 10_000,
    });
    // An idle client can lose its connection; log it rather than crash the process.
    cache.gaffPool.on('error', (error) => console.error('Postgres pool error', error));
    cache.gaffPool.on('connect', (client) =>
      client.on('error', (error) => console.error('Postgres client error', error)),
    );
  }
  return cache.gaffPool;
}

export function db(): Db {
  cache.gaffDb ??= drizzle(pool(), { schema, casing: 'snake_case' });
  return cache.gaffDb;
}

/**
 * Runs fn in a transaction scoped to one organisation. Row-level security hides every
 * other organisation's rows (ADR-0004). All tenant data access goes through here.
 */
export function withOrg<T>(organisationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organisationId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs fn in a transaction that may see every organisation. Only for jobs that must work
 * across organisations (the outbox dispatcher, retention). Keep its use rare and obvious.
 */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.rls_bypass', 'on', true)`);
    return fn(tx);
  });
}

/** Switches an open transaction to an organisation, e.g. straight after creating it. */
export async function scopeToOrg(tx: Tx, organisationId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.org_id', ${organisationId}, true)`);
}

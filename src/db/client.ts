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

// On Vercel each function instance has its own pool. Connections go through Supabase's
// transaction pooler (ADR-0014), which shares a few database connections among many clients;
// idle ones are still let go quickly.
const onVercel = process.env.VERCEL === '1';

export function pool(): pg.Pool {
  if (!cache.gaffPool) {
    const config = env();
    cache.gaffPool = new pg.Pool({
      ...poolConfig(config.DATABASE_URL, config.DATABASE_CA_CERT),
      max: onVercel ? 8 : 10,
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

/**
 * Runs fn in a transaction scoped to one renter's own rows (the renter zone, ADR-0017).
 * Organisation data stays invisible, except the renter's own applications where a policy
 * allows it. Callers pass the id of a signed-in renter, never one taken from a request.
 */
export function withRenter<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs fn in a read-only transaction with no organisation or renter: only public tables
 * (ADR-0017) return rows. For public pages: search, listings, areas, agencies.
 */
export function withPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    return fn(tx);
  });
}

/**
 * Runs fn as Gaff staff (ADR-0017): staff policies let them review rows across organisations,
 * such as letter checks (M105). Pass the id from a signed-in Staff (src/server/auth/staff).
 */
export function withStaff<T>(staffUserId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.role', 'staff', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${staffUserId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs fn as both one organisation and one renter, so an enquiry's application (organisation
 * zone) and the record of what the renter shared (renter zone) commit together (ADR-0017).
 * Only the enquiry use cases may use it.
 */
export function withEnquiry<T>(
  organisationId: string,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organisationId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { loadFixturePlaces } from '../fixtures/places';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://gaff:gaff@localhost:5432/gaff_test';

/** Recreates the test database and applies every migration once per run. */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
  });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(TEST_DATABASE_URL);
  await loadFixturePlaces(TEST_DATABASE_URL);
}

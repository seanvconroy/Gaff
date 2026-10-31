import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';

/** Gives each end-to-end run a fresh, migrated database. */
const url = new URL(process.env.DATABASE_URL ?? 'postgres://gaff:gaff@localhost:5432/gaff_e2e');
const name = url.pathname.slice(1);
const admin = new pg.Client({
  connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
});
await admin.connect();
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
await admin.end();
await runMigrations(url.toString());
console.log(`E2E database ${name} is ready.`);

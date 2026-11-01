import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations as runWorkerMigrations } from 'graphile-worker';
import pg from 'pg';
import { poolConfig } from './connection';

/**
 * Forces row-level security on every table that has it enabled, so the table owner
 * (the role the app connects as) is bound by the tenant policies too (ADR-0004).
 */
const FORCE_RLS = `
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and not c.relforcerowsecurity
  loop
    execute format('alter table public.%I force row level security', t.relname);
  end loop;
end $$;`;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    ...poolConfig(databaseUrl, process.env.DATABASE_CA_CERT),
    max: 2,
  });
  pool.on('error', (error) => console.error('Postgres pool error during migrations', error));
  pool.on('connect', (client) =>
    client.on('error', (error) => console.error('Postgres client error', error)),
  );
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
    await pool.query(FORCE_RLS);
    await runWorkerMigrations({ pgPool: pool });
  } finally {
    await pool.end();
  }
}

/**
 * `--deploy` (the Vercel build, ADR-0014): migrate for production deployments only. Preview
 * deployments of other branches share the database, so they never change it.
 */
function skipForThisDeployment(): boolean {
  return (
    process.argv.includes('--deploy') &&
    process.env.VERCEL === '1' &&
    process.env.VERCEL_ENV !== 'production'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (skipForThisDeployment()) {
    console.log('Preview deployment: migrations skipped.');
    process.exit(0);
  }
  if (!url) throw new Error('DATABASE_URL is not set');
  runMigrations(url).then(
    () => console.log('Migrations applied.'),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

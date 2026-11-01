import type { PoolConfig } from 'pg';

/** Supabase's shared pooler: port 6543 is transaction mode, 5432 is session mode. */
const SUPABASE_POOLER = /\.pooler\.supabase\.com$/;

/**
 * ADR-0014: the app connects through Supabase's transaction pooler (port 6543), which serverless
 * functions need. Migrations create schemas and take a session's worth of statements, so they
 * use session mode on the same host (port 5432), for one short connection per deploy.
 */
export function migrationUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (SUPABASE_POOLER.test(url.hostname) && url.port === '6543') url.port = '5432';
  return url.toString();
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const TLS_PARAMS = ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

/**
 * ADR-0014: node-postgres settings from DATABASE_URL.
 *
 * - A local database connects without TLS, unless the URL asks for it.
 * - Any other database (Supabase) always uses TLS. With `caCert` (Supabase's CA certificate),
 *   the server's certificate is checked against it, which production should do. Without it the
 *   connection is still encrypted, but the certificate isn't checked.
 *
 * TLS settings in the URL are replaced by these, because node-postgres reads `sslmode=require`
 * as "verify against the system's CAs", which fails for Supabase's own CA.
 */
export function poolConfig(databaseUrl: string, caCert?: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get('sslmode');
  for (const param of TLS_PARAMS) url.searchParams.delete(param);
  const local = LOCAL_HOSTS.has(url.hostname);

  let ssl: PoolConfig['ssl'] = false;
  if (sslmode !== 'disable' && (!local || sslmode)) {
    ssl = caCert
      ? { ca: caCert.replace(/\\n/g, '\n'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }
  return { connectionString: url.toString(), ssl };
}

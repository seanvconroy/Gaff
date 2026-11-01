import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { environmentProblems } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Plain hints for the database problems a new deployment usually has (docs/deploy.md). */
const hints: Record<string, string> = {
  '28P01': 'The database password in DATABASE_URL is wrong.',
  '3D000': 'The database name in DATABASE_URL is wrong (on Supabase it is "postgres").',
  '42P01': "The tables aren't there yet: the migrations haven't run.",
  '42501': "The gaff role can't read the tables: rerun the set-up SQL.",
  XX000: 'The pooler did not recognise the user: it should be gaff.<your project ref>.',
  ENOTFOUND: 'The database address in DATABASE_URL is wrong.',
  ECONNREFUSED: 'The database refused the connection: check the host and port.',
  SELF_SIGNED_CERT_IN_CHAIN: "DATABASE_CA_CERT doesn't match the database's certificate.",
};

/**
 * Is this deployment working? The end-to-end tests wait for it, and it's the first check after
 * a deploy. It names settings that are missing or wrong, never their values, and gives database
 * errors as codes only (the full error goes to the server log).
 */
export async function GET() {
  const settings = environmentProblems(process.env);
  if (settings.length > 0) {
    return NextResponse.json({ ok: false, settings }, { status: 503 });
  }
  try {
    await db().execute(sql`select 1 from organisations limit 1`);
    await db().execute(sql`select 1 from graphile_worker.jobs limit 1`);
  } catch (error) {
    console.error('Health check: database problem', error);
    const cause = (error as { cause?: { code?: string } }).cause ?? error;
    const code = (cause as { code?: string }).code ?? 'unknown';
    return NextResponse.json(
      { ok: false, database: code, hint: hints[code] ?? 'See the server log.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}

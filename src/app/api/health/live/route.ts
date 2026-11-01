import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * The server is up, nothing more (no database). The end-to-end tests wait for this before their
 * set-up creates the database. /api/health checks the whole deployment.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { stopAlerts } from '@/server/saved/searches';

export const dynamic = 'force-dynamic';

/**
 * UX-SR-10: "Stop these", in every alert. One tap, no sign-in. A search held by an email alone
 * is deleted at once; a profile's alerts are switched off. A link already used (the search is
 * gone) says the same: the emails have stopped.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const result = await stopAlerts(token);
  const held = result.state === 'stopped' ? result.held : 'email';
  return NextResponse.redirect(new URL(`/alerts/stopped?held=${held}`, request.url));
}

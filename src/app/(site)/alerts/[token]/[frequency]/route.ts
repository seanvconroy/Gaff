import { NextResponse } from 'next/server';
import { setFrequencyByToken } from '@/server/saved/searches';

export const dynamic = 'force-dynamic';

/**
 * M86: the switch at the foot of every alert: "Once a day instead", or "As soon as one is listed
 * instead". One tap, no sign-in, the same token as "Stop these". A link that no longer finds its
 * search goes where an expired one does.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; frequency: string }> },
): Promise<Response> {
  const { token, frequency } = await params;
  const result = await setFrequencyByToken(token, frequency);
  if (result.state !== 'changed') {
    return NextResponse.redirect(new URL('/alerts/expired', request.url));
  }
  return NextResponse.redirect(new URL(`/alerts/frequency?to=${result.to}`, request.url));
}

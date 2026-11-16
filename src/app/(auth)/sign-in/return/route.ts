import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { signInMethodFrom } from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { passkeyMemoryFrom, shouldOfferPasskey } from '@/domain/auth/passkey-offer';
import { cookieLifetimes, cookieNames, cookieOptions } from '@/server/auth/cookies';
import { currentUser } from '@/server/auth/member';
import {
  noteSignInMethodChosen,
  noteSignedIn,
  readSignInAttempt,
} from '@/server/auth/sign-in-steps';

export const dynamic = 'force-dynamic';

/**
 * Where every way of signing in lands once the person is signed in: a code, the email's button,
 * Google, Apple or a passkey. It records the last step of the sign-in funnel for that try
 * (UX-ME-1), remembers the method on this device (UX-SI-6), and goes on: to the passkey offer
 * if this device should see it (UX-SI-4), else to `next` if it's a path on this site, else to
 * `/` (UX-SI-8). `/` sends a person who hasn't set up yet to first run.
 */
export async function GET(request: NextRequest): Promise<never> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const query = request.nextUrl.searchParams;
  const next = safeNextPath(query.get('next'));
  const method = signInMethodFrom(query.get('method'));
  const jar = await cookies();
  if (method) {
    const attempt = readSignInAttempt(query.get('attempt'));
    // A passkey is chosen and used in one step, on the email field.
    if (method === 'passkey') await noteSignInMethodChosen(attempt, method);
    await noteSignedIn(attempt, user, method);
    jar.set(cookieNames.lastMethod, method, cookieOptions(cookieLifetimes.lastMethod));
  }
  const offer = shouldOfferPasskey({
    method,
    deviceCan: jar.get(cookieNames.passkeyDevice)?.value === '1',
    remembered: passkeyMemoryFrom(jar.get(cookieNames.passkey)?.value),
  });
  if (offer)
    redirect(next ? `/sign-in/passkey?next=${encodeURIComponent(next)}` : '/sign-in/passkey');
  redirect(next ?? '/');
}

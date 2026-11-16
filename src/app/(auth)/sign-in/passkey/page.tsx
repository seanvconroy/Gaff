import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { passkeyCopy } from '@/copy/sign-in';
import { safeNextPath } from '@/domain/auth/next-path';
import { deviceKind, passkeyMemoryFrom } from '@/domain/auth/passkey-offer';
import { cookieNames } from '@/server/auth/cookies';
import { currentUser } from '@/server/auth/member';
import { PasskeyOffer } from './PasskeyOffer';

export const metadata: Metadata = { title: passkeyCopy.title };
export const dynamic = 'force-dynamic';

/**
 * UX-SI-4: after a first sign-in on a device that can keep a passkey, one sheet offers one:
 * "Sign in faster next time". /sign-in/return sends people here only when the offer is due; the
 * person is already signed in, and goes on to where they were headed either way.
 */
export default async function PasskeyOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next) ?? '/';
  if (!(await currentUser())) redirect('/sign-in');
  // Asked already, on this device: straight on.
  if (passkeyMemoryFrom((await cookies()).get(cookieNames.passkey)?.value)) redirect(next);
  const device = deviceKind((await headers()).get('user-agent') ?? '');
  return <PasskeyOffer device={device} next={next} />;
}

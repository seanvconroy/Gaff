import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { providerProblemWords, signInCopy } from '@/copy/sign-in';
import {
  isProviderCancel,
  signInMethodFrom,
  signInProviderSchema,
  signInProviders,
} from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { signInProviderModes } from '@/server/auth/auth';
import { cookieNames } from '@/server/auth/cookies';
import { currentUser } from '@/server/auth/member';
import { newSignInAttempt } from '@/server/auth/sign-in-steps';
import { inviteTokenIn, openInvite } from '@/server/team/invite-links';
import { SignInScreen } from './SignInScreen';

export const metadata: Metadata = { title: signInCopy.title };
export const dynamic = 'force-dynamic';

/**
 * UX-SI-1: one screen for new and returning people. Google, Apple, or an email address for a
 * six-digit code. `?next=` is where to go afterwards, if it's a path on this site (UX-SI-8).
 *
 * UX-AG-11: on the way to an invite (`next` is its `/join/{token}`), the screen is titled "Join
 * {agency}" and the invited address is filled in.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; from?: string; error?: string; wait?: string }>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query.next);
  if (await currentUser()) redirect(next ?? '/');

  const token = inviteTokenIn(next);
  const invite = token ? await openInvite(token) : null;
  const modes = signInProviderModes();
  // Back from Google or Apple without signing in. Cancelling isn't an error (states table).
  const from = signInProviderSchema.safeParse(query.from);
  // AU4, AU12: why it didn't, in plain words: the address it can't vouch for, or wait a minute.
  const providerProblem =
    from.success && query.error && !isProviderCancel(query.error)
      ? {
          provider: from.data,
          words: providerProblemWords(query.error, from.data, Number(query.wait) || 60),
        }
      : null;

  return (
    <SignInScreen
      // UX-ME-1: one try at signing in, for the funnel. A random ID the server signs, carried
      // in this page's forms: no cookie, and nothing about the person or their device.
      attempt={newSignInAttempt()}
      next={next}
      providers={signInProviders.filter((provider) => modes[provider] !== 'off')}
      // UX-SI-6: the method used last on this device. Only its code is kept, on the device.
      lastMethod={signInMethodFrom((await cookies()).get(cookieNames.lastMethod)?.value)}
      providerProblem={providerProblem}
      invite={invite ? { agencyName: invite.organisationName, email: invite.email } : null}
    />
  );
}

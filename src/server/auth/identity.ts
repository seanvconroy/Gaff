import { getSessionFromCtx } from 'better-auth/api';
import {
  type EmailClaims,
  hostsThisEmail,
  saysVerified,
  type SocialProvider,
} from '@/domain/auth/email-authority';
import { recordAccountEvent } from './account-events';
import type { HookContext } from './hook-context';
import { dropPendingSignUp } from './pending-sign-up';

/**
 * AU4 (ADR-0028): one person, one account, whichever way they sign in, without ever joining
 * accounts on a guess. These are the rules for a Google or Apple sign-in.
 *
 * | Who's signing in                              | The provider hosts the address | It doesn't            |
 * | --------------------------------------------- | ------------------------------ | --------------------- |
 * | Someone already connected to this account     | Signed in                      | Signed in             |
 * | Someone signed in to the account, connecting  | Connected                      | Connected             |
 * | An address with a confirmed account           | Joined to it, and signed in    | Asked to sign in first |
 * | An address with no account                    | A new account                  | Asked for a code first |
 *
 * "Hosts" is src/domain/auth/email-authority: Gmail and Google Workspace for Google; iCloud
 * and Hide My Email for Apple. For any other address, the provider only knows the person once
 * controlled it, so the inbox itself has to say yes, with a code.
 */

/** The claims in a provider's profile: Google's and Apple's ID tokens, or the stand-in's. */
export function claimsOf(profile: Record<string, unknown> | undefined): EmailClaims {
  return {
    email: profile?.email,
    emailVerified: profile?.email_verified ?? profile?.emailVerified,
    hostedDomain: profile?.hd,
  };
}

const isProvider = (id: unknown): id is SocialProvider => id === 'google' || id === 'apple';

/**
 * Runs as Better Auth reads the provider's profile, before it looks for an account. A sign-up
 * nobody confirmed is only pending (./pending-sign-up): a provider that hosts the address has
 * now proved whose it is, so the pending sign-up makes way. Gaff keeps no photo.
 */
export async function prepareForProvider(
  provider: SocialProvider,
  profile: object,
): Promise<{ image: undefined }> {
  const claims = claimsOf(profile as Record<string, unknown>);
  if (hostsThisEmail(provider, claims) && typeof claims.email === 'string') {
    await dropPendingSignUp(claims.email);
  }
  return { image: undefined };
}

interface IdentityCheck {
  user: { id?: unknown };
  source: {
    action: 'create-user' | 'link-account' | 'sign-in';
    method: string;
    oauth?: { providerId: string; profile?: Record<string, unknown> };
  };
}

/**
 * AU16: a provider sign-in that couldn't be joined to an account is counted, with the provider
 * and nothing about the person, so the founders can see how often the rule gets in the way.
 */
async function notJoined(provider: SocialProvider, error: string): Promise<{ error: string }> {
  await recordAccountEvent('account.sign_in_failed', null, {
    method: provider,
    reason: 'not_joined',
  });
  return { error };
}

/**
 * Better Auth asks this before it makes an account, joins a provider to one, or signs a
 * connected person in. The answer is a code for the sign-in page to put into words
 * (src/domain/auth/sign-in-problems).
 */
export async function checkProviderIdentity(
  { user, source }: IdentityCheck,
  ctx: HookContext,
): Promise<void | { error: string }> {
  if (source.method !== 'oauth') return;
  const provider = source.oauth?.providerId;
  if (!isProvider(provider)) return { error: 'provider_not_offered' };
  // Already connected to this account: it's found by the provider's own ID, not by email.
  if (source.action === 'sign-in') return;

  const claims = claimsOf(source.oauth?.profile);
  if (!saysVerified(claims)) return notJoined(provider, 'email_not_verified');
  if (hostsThisEmail(provider, claims)) return;

  if (source.action === 'create-user') return notJoined(provider, 'confirm_email_first');
  // Joining an account the provider can't vouch for: only for the person signed in to it.
  const session = await getSessionFromCtx(ctx).catch(() => null);
  if (session?.user.id && session.user.id === user.id) return;
  return notJoined(provider, 'account_not_linked');
}

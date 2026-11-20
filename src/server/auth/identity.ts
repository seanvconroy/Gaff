import { randomUUID } from 'node:crypto';
import { getSessionFromCtx } from 'better-auth/api';
import { db } from '@/db/client';
import { joinRefusal, type EmailClaims, type NotJoinedReason } from '@/domain/auth/email-authority';
import { signInProviderSchema, type SignInProvider } from '@/domain/auth/methods';
import { noteFunnelStep } from '@/server/funnels/steps';
import { enqueue } from '@/server/jobs/enqueue';
import type { HookContext } from './limits';

/**
 * AU4 (ADR-0019): one person, however they sign in, and never joined on a guess. These are the
 * rules for a Google or Apple sign-in that Gaff hasn't seen before, as Better Auth's
 * `validateUserInfo` gate, which it asks before it makes a person, joins a provider to one, or
 * signs a connected person in.
 *
 * | Who's signing in                              | The provider hosts the address | It doesn't              |
 * | --------------------------------------------- | ------------------------------ | ----------------------- |
 * | Someone already connected by this provider    | Signed in                      | Signed in               |
 * | Someone signed in, connecting it on Profile   | Connected                      | Connected               |
 * | An address someone already has                | Joined to them, and signed in  | Asked to use a code     |
 * | An address nobody has                         | A new person                   | Asked to use a code     |
 *
 * "Hosts" is src/domain/auth/email-authority: Gmail and Google Workspace for Google; iCloud and
 * Hide My Email for Apple. For any other address the provider only knows the person once had
 * it, so the mailbox itself has to say yes, with a code (ADR-0015's "take back by code").
 */

/** The claims in a provider's profile: Google's and Apple's ID tokens, or the stand-in's. */
export function claimsOf(profile: Record<string, unknown> | undefined): EmailClaims {
  return {
    email: profile?.email,
    emailVerified: profile?.email_verified ?? profile?.emailVerified,
    hostedDomain: profile?.hd,
  };
}

interface IdentityCheck {
  user: { id?: unknown };
  source: {
    action?: 'create-user' | 'link-account' | 'sign-in';
    method: string;
    oauth?: { providerId: string; profile?: Record<string, unknown> };
  };
}

/**
 * AU4: a refused join is counted, with the provider and the reason `not_joined`, and nothing
 * about the person (`account.sign_in_failed`), so the founders can see how often the rule gets
 * in people's way (Q66). Someone who already has the address is told, by email to it.
 */
async function notJoined(
  provider: SignInProvider,
  reason: NotJoinedReason,
  ownerId: string | null,
): Promise<{ error: NotJoinedReason }> {
  await noteFunnelStep({
    step: 'account.sign_in_failed',
    subjectId: randomUUID(),
    variant: provider,
    data: { notJoined: true },
  });
  if (reason === 'account_not_linked' && ownerId) {
    try {
      await db().transaction((tx) =>
        enqueue(tx, 'send_account_email', {
          kind: 'sign_in_refused',
          userId: ownerId,
          provider,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      console.error('The email about a refused sign-in was not queued.');
    }
  }
  return { error: reason };
}

/**
 * Better Auth's gate for every Google or Apple sign-in, sign-up and connection. The answer is a
 * code the sign-in screen puts into words (src/copy/sign-in.ts).
 */
export async function checkProviderIdentity(
  { user, source }: IdentityCheck,
  ctx: HookContext,
): Promise<void | { error: string }> {
  if (source.method !== 'oauth') return;
  const provider = signInProviderSchema.safeParse(source.oauth?.providerId);
  if (!provider.success) return { error: 'provider_not_offered' };
  // Already one of this person's ways in: found by the provider's own ID for them, not by email.
  if (source.action === 'sign-in') return;

  const newPerson = source.action === 'create-user';
  const userId = typeof user.id === 'string' ? user.id : null;
  // Connecting it from "How you sign in": only for the person signed in to that account.
  const session = newPerson ? null : await getSessionFromCtx(ctx).catch(() => null);
  const connecting = Boolean(userId && session?.user.id === userId);
  const refused = joinRefusal({
    provider: provider.data,
    claims: claimsOf(source.oauth?.profile),
    newPerson,
    connectingWhileSignedIn: connecting,
  });
  if (!refused) return;
  return notJoined(provider.data, refused, newPerson ? null : userId);
}

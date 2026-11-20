import { randomUUID } from 'node:crypto';
import { getSessionFromCtx } from 'better-auth/api';
import { signInCodeEmail } from '@/copy/sign-in';
import { db } from '@/db/client';
import { joinRefusal, type EmailClaims, type NotJoinedReason } from '@/domain/auth/email-authority';
import { signInProviderSchema, type SignInProvider } from '@/domain/auth/methods';
import { noteFunnelStep } from '@/server/funnels/steps';
import { enqueue } from '@/server/jobs/enqueue';
import { browserKeyFrom, sendCode, SIGN_IN_LINK_PATH, waitingCode } from './codes';
import { cookieNames } from './cookies';
import { limitFromAddress, type HookContext } from './limits';

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
 * | An address someone already has                | Joined to them, and signed in  | Sent a code (below)     |
 * | An address nobody has                         | A new person                   | Sent a code (below)     |
 *
 * "Hosts" is src/domain/auth/email-authority: Gmail and Google Workspace for Google; iCloud and
 * Hide My Email for Apple. For any other address the provider only knows the person once had
 * it, so the mailbox itself has to say yes, with a code (ADR-0015's "take back by code").
 *
 * UX-SI-15 (ADR-0033): that code goes out here, as the provider comes back, to the address the
 * provider named, and the person lands on the code screen. The code carries the provider's
 * account: entering it signs in whoever has the address (or makes them) and connects the
 * provider, in one step. Nothing is joined before the mailbox says yes. Where no code can go
 * (too many already, or a browser that never opened the sign-in screen), the sign-in screen says
 * to use an email code, as before.
 */

/** The answer that sends the person to the code screen: the mailbox is being asked. */
export const CONFIRM_BY_CODE = 'confirm_by_code';

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
 * UX-SI-15: sends the sign-in code to the address the provider named, tied to this browser and
 * carrying the provider's account. True if a code is on its way (or went a moment ago).
 */
async function askTheMailbox(
  ctx: HookContext,
  provider: SignInProvider,
  claims: EmailClaims,
  profile: Record<string, unknown> | undefined,
  name: unknown,
): Promise<boolean> {
  const browserKey = browserKeyFrom(ctx.getCookie(cookieNames.signInCode));
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  // The provider's own ID for the person: `sub` in Google's and Apple's tokens.
  const subject = profile?.sub ?? profile?.id;
  const accountId = typeof subject === 'string' || typeof subject === 'number' ? `${subject}` : '';
  if (!browserKey || !email || !accountId) return false;
  // AU12: a code asked for, counted by network address like any other.
  if (await limitFromAddress('send_code', ctx.headers ?? ctx.request?.headers)) return false;
  const joining = {
    provider: {
      id: provider,
      accountId,
      ...(typeof name === 'string' && name.trim() ? { name: name.trim().slice(0, 200) } : {}),
    },
  };
  const result = await sendCode({
    purpose: 'sign_in',
    subject: email,
    to: email,
    browserKey,
    compose: (code, link) => signInCodeEmail(code, link, { provider }),
    linkPath: SIGN_IN_LINK_PATH,
    joining,
  });
  if (result.sent) return true;
  if (result.reason !== 'wait') return false;
  // One went to this browser a moment ago: it stands if it carries this same account.
  const waiting = await waitingCode('sign_in', browserKey);
  return (
    waiting?.subject === email &&
    waiting.joining?.provider?.id === provider &&
    waiting.joining.provider.accountId === accountId
  );
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
  const claims = claimsOf(source.oauth?.profile);
  const refused = joinRefusal({
    provider: provider.data,
    claims,
    newPerson,
    connectingWhileSignedIn: connecting,
  });
  if (!refused) return;
  // UX-SI-15: the provider checked the address once, and can't say whose it is today. Ask the
  // mailbox, here and now, instead of sending the person back to start again.
  if (refused !== 'email_not_verified') {
    const name = (user as { name?: unknown }).name;
    // If asking fails for any reason, the answer is the one this rule always gave: nobody is
    // joined, and the sign-in screen says to use a code. Nothing about the person is logged.
    const asked = await askTheMailbox(
      ctx,
      provider.data,
      claims,
      source.oauth?.profile,
      name,
    ).catch(() => {
      console.error('The code for a Google or Apple sign-in could not be sent.');
      return false;
    });
    if (asked) return { error: CONFIRM_BY_CODE };
  }
  return notJoined(provider.data, refused, newPerson ? null : userId);
}

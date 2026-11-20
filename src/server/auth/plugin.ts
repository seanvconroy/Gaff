import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth';
import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { revokeUnprovenAccountAccess } from 'better-auth/db';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { accounts } from '@/db/schema';
import { sensitiveActionSchema } from '@/domain/auth/confirm';
import { foundAccount, methodChosen, type Joined, type Joining } from '@/domain/auth/joining';
import type { SignInMethod } from '@/domain/auth/methods';
import { openCodeLink, tryCode, type UsedCode } from './codes';
import { grantConfirmation } from './confirm';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';
import { rememberMadeByProvider } from './made-by-provider';
import { joinMobile, mobileProvedAgain, personSignedInBy } from './mobile';

type User = NonNullable<
  Awaited<ReturnType<GenericEndpointContext['context']['internalAdapter']['findUserById']>>
>;

const couldNotSignIn = () =>
  new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not sign in' });

/**
 * UX-SI-8: the person whose email has just been proven, by a code typed or by the email's
 * button. New and returning people take the same path: if nobody has that email, a person is
 * created. Nobody is told "no account found".
 *
 * An existing row whose email was never proven (a provider said "not verified") carries no
 * proof that anything attached to it belongs to this mailbox's owner, so its other sign-in
 * methods and sessions are dropped before the owner is let in. `existed` is whether there was an
 * account here already that was really theirs.
 */
async function personWithEmail(
  ctx: GenericEndpointContext,
  email: string,
  name: string,
): Promise<{ user: User; existed: boolean }> {
  const adapter = ctx.context.internalAdapter;
  const found = (await adapter.findUserByEmail(email))?.user ?? null;
  if (!found) {
    const made = await adapter.createUser(
      { email, emailVerified: true, name },
      { method: 'email-otp' },
    );
    if (!made) throw couldNotSignIn();
    return { user: made, existed: false };
  }
  if (found.emailVerified) return { user: found, existed: true };
  const taken = await revokeUnprovenAccountAccess(ctx, found.id);
  if (!taken) throw couldNotSignIn();
  return { user: taken, existed: false };
}

/** Starts the session, and notes on it the proof that made it: a code by email, or by text. */
async function startSession(
  ctx: GenericEndpointContext,
  user: User,
  method: 'email_code' | 'sms_code',
): Promise<void> {
  // The session's hook believes `signInMethod` only from this endpoint (src/domain/auth/methods).
  const session = await ctx.context.internalAdapter.createSession(user.id, false, {
    signInMethod: method,
  });
  if (!session) throw couldNotSignIn();
  await setSessionCookie(ctx, { session, user });
}

/**
 * UX-SI-15: connects the Google or Apple account that couldn't vouch for this address, now that
 * the mailbox has said yes. Never one that is someone else's way in already, and never a second
 * account of a provider the person already has: those are left as they are.
 */
async function joinProvider(
  ctx: GenericEndpointContext,
  user: User,
  provider: NonNullable<Joining['provider']>,
  existed: boolean,
): Promise<boolean> {
  const held = await db()
    .select({ userId: accounts.userId, accountId: accounts.accountId })
    .from(accounts)
    .where(
      and(
        eq(accounts.providerId, provider.id),
        or(eq(accounts.accountId, provider.accountId), eq(accounts.userId, user.id)),
      ),
    );
  if (held.length > 0) {
    return held.some((row) => row.userId === user.id && row.accountId === provider.accountId);
  }
  // Someone made in this sign-in: the provider was there from the start, which is no change.
  if (!existed) rememberMadeByProvider(user.id);
  const linked = await ctx.context.internalAdapter.linkAccount({
    providerId: provider.id,
    accountId: provider.accountId,
    userId: user.id,
  });
  return Boolean(linked);
}

/** What the right code came to. */
type CodeSignIn =
  /**
   * UX-SI-14: a mobile number nobody has, or one that no longer vouches for its owner by
   * itself. The number is proven; the email that goes with it is asked for next.
   */
  | { signedIn: false }
  | {
      signedIn: true;
      userId: string;
      /** The method the person chose, for the funnel and "You used … last time". */
      method: SignInMethod;
      /** What was joined to an account that was already there: "We've found your account". */
      found: Joined | null;
      attemptId: string | null;
      nextPath: string | null;
    };

/**
 * One person, however they sign in (ADR-0033). The right code, in the browser that asked for it:
 *
 * - by text, to a number that vouches for its owner: its owner is signed in;
 * - by text, to any other number: nobody is signed in yet (the email is asked for);
 * - by email: whoever has the address is signed in, or a person is made. If the code carries a
 *   mobile number this browser proved, or a Google or Apple account, that is joined to them.
 */
async function signInWith(ctx: GenericEndpointContext, used: UsedCode): Promise<CodeSignIn> {
  const where = { attemptId: used.attemptId, nextPath: used.nextPath };
  if (used.channel === 'sms') {
    const ownerId = await personSignedInBy(used.subject);
    const owner = ownerId ? await ctx.context.internalAdapter.findUserById(ownerId) : null;
    if (!owner) return { signedIn: false };
    await startSession(ctx, owner, 'sms_code');
    await mobileProvedAgain(owner.id);
    return { signedIn: true, userId: owner.id, method: 'sms_code', found: null, ...where };
  }

  const joining = used.joining;
  const { user, existed } = await personWithEmail(ctx, used.subject, joining?.provider?.name ?? '');
  let joined: Joined | null = null;
  if (joining?.mobile) {
    await joinMobile(user.id, joining.mobile, { quiet: !existed });
    joined = 'mobile';
  } else if (joining?.provider && (await joinProvider(ctx, user, joining.provider, existed))) {
    joined = joining.provider.id;
  }
  await startSession(ctx, user, 'email_code');
  return {
    signedIn: true,
    userId: user.id,
    method: methodChosen('email_code', joined),
    found: foundAccount({ existed, joined }),
    ...where,
  };
}

/**
 * Gaff's own sign-in endpoints, on Better Auth (ADR-0015). Each proves the email or the mobile
 * itself before it creates a session: it reads the code or the button's token, and the key in
 * the asking browser's cookie. The screens call them from the server
 * (`auth().api.signInWithCode`, `auth().api.signInWithCodeLink`); over HTTP they answer "not
 * found" (AU12, ADR-0019), and every call is counted against the limits by network address
 * (src/server/auth/limits.ts).
 */
export const gaffSignIn = () =>
  ({
    id: 'gaff-sign-in',
    endpoints: {
      /** UX-SI-2, UX-SI-13: one try at the six-digit code, in the browser that asked for it. */
      signInWithCode: createAuthEndpoint(
        '/gaff/sign-in/code',
        { method: 'POST', body: z.object({ code: z.string().max(32) }), requireHeaders: true },
        async (ctx) => {
          const tried = await tryCode({
            purpose: 'sign_in',
            browserKey: ctx.getCookie(cookieNames.signInCode),
            code: ctx.body.code,
          });
          if (tried.result !== 'correct') return ctx.json({ result: tried.result });
          const outcome = await signInWith(ctx, tried);
          if (!outcome.signedIn) return ctx.json({ result: 'email_needed' as const });
          const { signedIn: _signedIn, ...signedIn } = outcome;
          return ctx.json({ result: 'correct' as const, ...signedIn });
        },
      ),
      /**
       * UX-SI-3: the email's button. In the browser that asked, it signs the person in. Anywhere
       * else it gives back the code to show, and nobody is signed in there.
       */
      signInWithCodeLink: createAuthEndpoint(
        '/gaff/sign-in/link',
        { method: 'POST', body: z.object({ token: z.string().max(64) }), requireHeaders: true },
        async (ctx) => {
          const opened = await openCodeLink({
            purpose: 'sign_in',
            token: ctx.body.token,
            browserKey: ctx.getCookie(cookieNames.signInCode),
          });
          if (opened.where !== 'here') return ctx.json(opened);
          const outcome = await signInWith(ctx, opened);
          // Only an email carries a button, and an email's code always signs someone in.
          if (!outcome.signedIn) return ctx.json({ where: 'nowhere' as const });
          const { signedIn: _signedIn, ...signedIn } = outcome;
          return ctx.json({ where: 'here' as const, ...signedIn });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

/** The header the "Confirm it's you" sheet sends with a passkey, naming the action. */
export const CONFIRM_HEADER = 'x-gaff-confirm';

/**
 * UX-SI-10: a passkey used to confirm it's you, not to sign in. The passkey plugin has checked
 * the passkey; this runs before it starts a session. It only counts if the passkey belongs to
 * the person already signed in: then a confirmation is written for the named action and its
 * grant goes in this browser's cookie. Anyone else's passkey is refused, so confirming can
 * never switch who is signed in.
 */
export async function confirmWithPasskey(
  ctx: GenericEndpointContext,
  credentialId: string,
): Promise<void> {
  const header = ctx.headers?.get(CONFIRM_HEADER);
  if (!header) return;
  const action = sensitiveActionSchema.safeParse(header);
  const session = await getSessionFromCtx(ctx);
  const passkey = await ctx.context.adapter.findOne<{ userId: string }>({
    model: 'passkey',
    where: [{ field: 'credentialID', value: credentialId }],
  });
  if (!action.success || !session || !passkey || passkey.userId !== session.user.id) {
    throw new APIError('UNAUTHORIZED', { message: 'Not confirmed' });
  }
  const grant = await grantConfirmation(session.user.id, action.data, 'passkey');
  ctx.setCookie(cookieNames.confirmed, grant, cookieOptions(cookieLifetimes.confirmed));
  // The passkey plugin now starts a fresh session for the same person; the old one is ended.
  await ctx.context.internalAdapter.deleteSession(session.session.token);
}

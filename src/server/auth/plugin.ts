import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth';
import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { revokeUnprovenAccountAccess } from 'better-auth/db';
import { z } from 'zod';
import { sensitiveActionSchema } from '@/domain/auth/confirm';
import { openCodeLink, tryCode } from './codes';
import { grantConfirmation } from './confirm';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';

/**
 * UX-SI-8: signs in the person whose email has just been proven, by a code typed or by the
 * email's button. New and returning people take the same path: if nobody has that email, a
 * person is created. Nobody is told "no account found".
 *
 * An existing row whose email was never proven (a provider said "not verified") carries no
 * proof that anything attached to it belongs to this mailbox's owner, so its other sign-in
 * methods and sessions are dropped before the owner is let in.
 */
async function signInVerifiedEmail(ctx: GenericEndpointContext, email: string): Promise<string> {
  const adapter = ctx.context.internalAdapter;
  let user = (await adapter.findUserByEmail(email))?.user ?? null;
  if (!user) {
    user = await adapter.createUser(
      { email, emailVerified: true, name: '' },
      { method: 'email-otp' },
    );
  } else if (!user.emailVerified) {
    user = await revokeUnprovenAccountAccess(ctx, user.id);
  }
  if (!user) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not sign in' });
  const session = await adapter.createSession(user.id);
  if (!session) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not sign in' });
  await setSessionCookie(ctx, { session, user });
  return user.id;
}

/**
 * Gaff's own sign-in endpoints, on Better Auth (ADR-0015). Each proves the email itself before
 * it creates a session: it reads the code or the button's token, and the key in the asking
 * browser's cookie. So they are safe to reach over HTTP, though the screens call them from the
 * server (`auth().api.signInWithCode`, `auth().api.signInWithCodeLink`).
 */
export const gaffSignIn = () =>
  ({
    id: 'gaff-sign-in',
    endpoints: {
      /** UX-SI-2: one try at the six-digit code, in the browser that asked for it. */
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
          const userId = await signInVerifiedEmail(ctx, tried.subject);
          return ctx.json({
            result: 'correct' as const,
            userId,
            attemptId: tried.attemptId,
            nextPath: tried.nextPath,
          });
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
          const userId = await signInVerifiedEmail(ctx, opened.subject);
          return ctx.json({
            where: 'here' as const,
            userId,
            attemptId: opened.attemptId,
            nextPath: opened.nextPath,
          });
        },
      ),
    },
    // A second line of defence behind the limits on the codes themselves.
    rateLimit: [{ pathMatcher: (path) => path.startsWith('/gaff/sign-in/'), window: 60, max: 20 }],
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

import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { standInProviders } from '@/adapters/sign-in/stand-in';
import { db } from '@/db/client';
import { accounts, passkeys, sessions, users, verifications } from '@/db/schema';
import { openToBrowsers } from '@/domain/auth/browser-routes';
import {
  methodForPath,
  providerMode,
  signInProviderSchema,
  signInProviders,
  type ProviderMode,
  type SignInProvider,
} from '@/domain/auth/methods';
import { passkeyName } from '@/domain/auth/passkeys';
import { SESSION_LASTS_DAYS, SESSION_RENEWED_EVERY_DAYS } from '@/domain/auth/session';
import { env, type Env } from '@/lib/env';
import { appleConfigured, appleSecretFrom } from './apple-client-secret';
import { checkProviderIdentity } from './identity';
import { limitTries, type HookContext } from './limits';
import { rememberMadeByProvider, wasMadeByProvider } from './made-by-provider';
import { guardPasskeyAdd } from './passkey-guard';
import { confirmWithPasskey, gaffSignIn } from './plugin';
import { noteSignInChangeAfter } from './security';

const DAY = 60 * 60 * 24;

/**
 * UX-SI-1: how Google and Apple are switched on here. Real when the provider's credentials are
 * set (for Apple, a static secret or what Gaff makes one from: BA-8); a local stand-in when they
 * aren't and the development tools are on in development or tests (never on the test copy:
 * BA-1); otherwise off, and the sign-in screen shows no button.
 */
export function signInProviderModes(config: Env = env()): Record<SignInProvider, ProviderMode> {
  return {
    google: providerMode({
      credentialsSet: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
      devTools: config.DEV_TOOLS,
      gaffEnv: config.GAFF_ENV,
    }),
    apple: providerMode({
      credentialsSet: appleConfigured(config),
      devTools: config.DEV_TOOLS,
      gaffEnv: config.GAFF_ENV,
    }),
  };
}

/** Google and Apple are for sign-in only (Q30): nothing they hand over beyond who it is is kept. */
const noTokens = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  scope: null,
};

/**
 * AU12 (ADR-0019): only a few of the library's routes are for browsers
 * (src/domain/auth/browser-routes). A call that arrives over HTTP for any other is answered as
 * if the route weren't there. Gaff's own server code calls the library without a request, and
 * isn't stopped.
 */
function closedToBrowsers(ctx: HookContext): void {
  if (!ctx.request) return;
  if (openToBrowsers(ctx.path ?? '')) return;
  throw new APIError('NOT_FOUND', { code: 'NOT_FOUND', message: 'Not found' });
}

/** The way in a session is beginning with, from the sign-in call that's making it. */
function methodOf(ctx: HookContext | null | undefined) {
  if (!ctx) return null;
  const provider = (ctx.params as { id?: string } | undefined)?.id;
  return methodForPath(ctx.path ?? '', provider);
}

/**
 * AU11: Google or Apple was joined to someone who already had an account, by the address it
 * hosts or connected from "How you sign in". Their record says so, and they're emailed, in case
 * it wasn't them.
 */
async function providerJoined(account: { providerId: string; userId: string }): Promise<void> {
  const provider = signInProviderSchema.safeParse(account.providerId);
  if (!provider.success || wasMadeByProvider(account.userId)) return;
  await noteSignInChangeAfter(account.userId, 'added', provider.data);
}

/**
 * AU8: a browser holds one session. Signing in again from a browser that's already signed in,
 * as someone else or with a passkey, ends the session it had, so "Signed-in devices" doesn't
 * fill with copies of the same one.
 */
async function endPreviousSession(
  newToken: string,
  ctx: HookContext | null | undefined,
): Promise<void> {
  if (!ctx) return;
  const previous = await getSessionFromCtx(ctx).catch(() => null);
  const token = previous?.session.token;
  if (token && token !== newToken) await ctx.context.internalAdapter.deleteSession(token);
}

/** AU11: a passkey was added: the person's record says so, and they're emailed. */
async function passkeyAdded(ctx: HookContext): Promise<void> {
  if (ctx.path !== '/passkey/verify-registration') return;
  const returned = ctx.context.returned;
  if (!returned || returned instanceof APIError || returned instanceof Error) return;
  const userId = (returned as { userId?: unknown }).userId;
  if (typeof userId === 'string') await noteSignInChangeAfter(userId, 'added', 'passkey');
}

/**
 * Sign-in for people with accounts (ADR-0015, hardened by ADR-0019, joined up by ADR-0033):
 * Google, Apple, or a six-digit code by email, and a passkey afterwards. No passwords. Built on Better Auth, so
 * accounts and sessions live in our own Postgres. Built on first use, not at import.
 */
function createAuth() {
  const config = env();
  const modes = signInProviderModes(config);
  const standIns = signInProviders.filter((provider) => modes[provider] === 'stand_in');
  const appUrl = new URL(config.APP_URL);
  const appleSecret = modes.apple === 'real' ? appleSecretFrom(config) : null;
  return betterAuth({
    appName: 'Gaff',
    baseURL: config.APP_URL,
    secret: config.AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications, passkeys },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: config.APP_URL.startsWith('https://'),
    },
    // UX-SI-9: 30 days from last use on that device.
    session: {
      expiresIn: SESSION_LASTS_DAYS * DAY,
      updateAge: SESSION_RENEWED_EVERY_DAYS * DAY,
      // BA-8: no "signed in within the last day" of the library's own. A change to how someone
      // signs in asks "Confirm it's you" instead (UX-SI-10: ./passkey-guard, ./security).
      freshAge: 0,
      // BA-8 (M5, AU8): each session keeps the way in it began with. A browser can't set it.
      additionalFields: { signInMethod: { type: 'string', required: false, input: false } },
    },
    emailAndPassword: { enabled: false },
    account: {
      // Q30: nothing of the provider's is refreshed or kept at each sign-in.
      updateAccountOnSignIn: false,
      // UX-AC-1, UX-SI-8, AU4: a second method joins the same person only by the rule in
      // ./identity. No provider is trusted by name.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        // AU7: someone signed in can connect a Google or Apple account under another address.
        allowDifferentEmails: true,
        // A code by email always works, so any other way in can go (src/domain/auth).
        allowUnlinkingAll: true,
      },
    },
    // AU4: the rule for joining a Google or Apple sign-in to someone.
    user: { validateUserInfo: checkProviderIdentity },
    socialProviders: {
      ...(modes.google === 'real'
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID!,
              clientSecret: config.GOOGLE_CLIENT_SECRET!,
              prompt: 'select_account' as const,
            },
          }
        : {}),
      ...(modes.apple === 'real' && appleSecret
        ? { apple: { clientId: config.APPLE_CLIENT_ID!, clientSecret: appleSecret } }
        : {}),
    },
    // Apple posts its answer back from its own site.
    trustedOrigins: modes.apple === 'real' ? ['https://appleid.apple.com'] : [],
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
            const method = methodOf(ctx);
            if (method === 'google' || method === 'apple') rememberMadeByProvider(user.id);
          },
        },
      },
      account: {
        create: {
          before: async (account) => ({ data: { ...account, ...noTokens } }),
          after: async (account) => {
            await providerJoined(account);
          },
        },
        update: { before: async (account) => ({ data: { ...account, ...noTokens } }) },
      },
      session: {
        create: {
          before: async (session, ctx) => ({
            data: { ...session, signInMethod: methodOf(ctx) },
          }),
          after: async (session, ctx) => {
            await endPreviousSession(session.token, ctx);
          },
        },
      },
    },
    telemetry: { enabled: false },
    // AU12: the library's own limiter only sees requests that arrive over HTTP, and Gaff's
    // screens call it in-process. Gaff's limiter (./limits) runs as a hook, which sees both.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        closedToBrowsers(ctx);
        await limitTries(ctx);
        await guardPasskeyAdd(ctx);
      }),
      after: createAuthMiddleware(async (ctx) => {
        await passkeyAdded(ctx);
      }),
    },
    plugins: [
      gaffSignIn(),
      // UX-SI-4, UX-SI-5: passkeys, for this site only.
      passkey({
        rpID: appUrl.hostname,
        rpName: 'Gaff',
        origin: appUrl.origin,
        registration: {
          // AU6: named after what made it, when the browser says, so the list can tell them apart.
          afterVerification: async ({ verification }) => ({
            name: passkeyName(getAuthenticatorName(verification.registrationInfo?.aaguid)),
          }),
        },
        authentication: {
          // UX-SI-10: the same passkey confirms it's you before a sensitive action.
          afterVerification: async ({ ctx, clientData }) => {
            await confirmWithPasskey(ctx, String(clientData.id));
          },
        },
      }),
      ...(standIns.length > 0
        ? [genericOAuth({ config: standInProviders(standIns, config.APP_URL) })]
        : []),
      nextCookies(),
    ],
  });
}

let built: { auth: ReturnType<typeof createAuth>; at: number } | undefined;

/** BA-8: the client secret made for Apple lasts 150 days; a set-up this old is built again. */
const REBUILD_AFTER_MS = 30 * DAY * 1000;

export function auth() {
  if (!built || Date.now() - built.at > REBUILD_AFTER_MS) {
    built = { auth: createAuth(), at: Date.now() };
  }
  return built.auth;
}

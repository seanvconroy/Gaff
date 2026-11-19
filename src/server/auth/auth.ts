import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { standInProviders } from '@/adapters/sign-in/stand-in';
import { db } from '@/db/client';
import { accounts, passkeys, sessions, users, verifications } from '@/db/schema';
import {
  providerMode,
  signInProviders,
  type ProviderMode,
  type SignInProvider,
} from '@/domain/auth/methods';
import { SESSION_LASTS_DAYS, SESSION_RENEWED_EVERY_DAYS } from '@/domain/auth/session';
import { env, type Env } from '@/lib/env';
import { confirmWithPasskey, gaffSignIn } from './plugin';

const DAY = 60 * 60 * 24;

/**
 * UX-SI-1: how Google and Apple are switched on here. Real when the provider's credentials are
 * set; a local stand-in when they aren't and the development tools are on in development or
 * tests (never on the test copy: BA-1); otherwise off, and the sign-in screen shows no button.
 */
export function signInProviderModes(config: Env = env()): Record<SignInProvider, ProviderMode> {
  return {
    google: providerMode({
      credentialsSet: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
      devTools: config.DEV_TOOLS,
      gaffEnv: config.GAFF_ENV,
    }),
    apple: providerMode({
      credentialsSet: Boolean(config.APPLE_CLIENT_ID && config.APPLE_CLIENT_SECRET),
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
 * Sign-in for people with accounts (ADR-0015): Google, Apple, or a six-digit code by email, and
 * a passkey afterwards. No passwords. Built on Better Auth, so accounts and sessions live in our
 * own Postgres. Built on first use, not at import.
 */
function createAuth() {
  const config = env();
  const modes = signInProviderModes(config);
  const standIns = signInProviders.filter((provider) => modes[provider] === 'stand_in');
  const appUrl = new URL(config.APP_URL);
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
    },
    emailAndPassword: { enabled: false },
    // UX-AC-1, UX-SI-8: a second method with the same verified email joins the same person.
    // No provider is trusted by name: the provider must say the address is verified, and ours
    // must be verified too. Anything else is refused, never joined.
    account: { accountLinking: { enabled: true } },
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
      ...(modes.apple === 'real'
        ? {
            apple: { clientId: config.APPLE_CLIENT_ID!, clientSecret: config.APPLE_CLIENT_SECRET! },
          }
        : {}),
    },
    // Apple posts its answer back from its own site.
    trustedOrigins: modes.apple === 'real' ? ['https://appleid.apple.com'] : [],
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: { ...account, ...noTokens } }) },
        update: { before: async (account) => ({ data: { ...account, ...noTokens } }) },
      },
    },
    telemetry: { enabled: false },
    // Requests to Better Auth's own endpoints are rate limited per IP, except in end-to-end
    // tests, which sign in many times a minute from one address. Codes have their own limits.
    rateLimit: { enabled: config.GAFF_ENV !== 'test' },
    plugins: [
      gaffSignIn(),
      // UX-SI-4, UX-SI-5: passkeys, for this site only.
      passkey({
        rpID: appUrl.hostname,
        rpName: 'Gaff',
        origin: appUrl.origin,
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

let instance: ReturnType<typeof createAuth> | undefined;

export function auth() {
  instance ??= createAuth();
  return instance;
}

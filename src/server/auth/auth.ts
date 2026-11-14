import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/db/client';
import { accounts, sessions, users, verifications } from '@/db/schema';
import { CODE_MINUTES, CODE_TRIES } from '@/domain/auth/codes';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/auth/password-rules';
import { RECENT_SIGN_IN_SECONDS } from '@/domain/auth/recent-sign-in';
import { methodForPath } from '@/domain/auth/sign-in-methods';
import { redactForLog } from '@/domain/record/log-redaction';
import { env } from '@/lib/env';
import { makeListedTesterStaff } from '@/server/staff/testers';
import { recordAccountEvent } from './account-events';
import { appleClientSecret } from './apple-client-secret';
import { sendAccountExists, sendCode, sendMethodAdded, sendPasswordChanged } from './emails';
import type { HookContext } from './hook-context';
import { checkProviderIdentity, prepareForProvider } from './identity';
import { countPasswordFailures, limitTries } from './limits';
import { checkNewPassword } from './passwords';
import { providerModes } from './providers';
import { standInProviders } from './stand-in-provider';

const DAY = 60 * 60 * 24;

/**
 * Rule 8: the library's own log lines name email addresses in places, so they all pass through
 * the redaction first, and only warnings and errors are kept.
 */
function redactingLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  ...args: unknown[]
) {
  const line = [message, ...args].map(redactForLog).join(' ');
  if (level === 'error') console.error(`[sign-in] ${line}`);
  else console.warn(`[sign-in] ${line}`);
}

/**
 * Emails go out once the response has, so an answer takes the same time whether or not an
 * email was sent (AU12: nobody can tell from the timing whether an address has an account).
 * Not in tests, which read the outbox straight after.
 */
function afterResponse(work: Promise<unknown>): void {
  const quietly = work.catch((error: unknown) =>
    console.error('[sign-in] background work failed', (error as Error)?.name),
  );
  try {
    after(() => quietly);
  } catch {
    // Not inside a request: the work is already under way.
  }
}

/** The way in a session is beginning with, from the sign-in call that's making it. */
function methodOf(ctx: HookContext | null) {
  if (!ctx) return null;
  const provider = (ctx.params as { id?: string } | undefined)?.id;
  return methodForPath(ctx.path ?? '', provider);
}

/**
 * AU14: Gaff never calls Google or Apple once someone is signed in, so their tokens are
 * dropped before an account row is written. Only the provider's ID for the person is kept.
 */
function withoutTokens<T extends Record<string, unknown>>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scope: null,
  };
}

/** Accounts just made by signing in with Google or Apple, so that isn't also news of a change. */
const madeByProvider = new Map<string, number>();

function rememberMadeByProvider(userId: string): void {
  const now = Date.now();
  for (const [id, at] of madeByProvider) if (now - at > 10_000) madeByProvider.delete(id);
  madeByProvider.set(userId, now);
}

/**
 * AU11, AU16: Google or Apple was joined to an account that already existed: it's recorded,
 * and the owner is emailed, in case it wasn't them.
 */
async function providerJoined(account: { providerId: string; userId: string }): Promise<void> {
  const method = account.providerId;
  if (method !== 'google' && method !== 'apple') return;
  if (madeByProvider.has(account.userId)) return;
  await recordAccountEvent('account.method_added', account.userId, { method });
  const [user] = await db()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, account.userId));
  if (user) await sendMethodAdded(user.email, method);
}

/**
 * Accounts and sign-in, for renters, letters and Gaff's staff alike (M1, ADR-0016), with Better
 * Auth. How people sign in, and why, is ADR-0028. Accounts live in our own Postgres; no
 * third-party identity service holds them. Built on first use, not at import.
 */
function createAuth() {
  const config = env();
  const inARequest = Boolean(process.env.NEXT_RUNTIME) && config.GAFF_ENV !== 'test';
  const modes = providerModes(config);
  const standIns = (['google', 'apple'] as const).filter((p) => modes[p] === 'stand_in');
  return betterAuth({
    appName: 'Gaff',
    baseURL: config.APP_URL,
    secret: config.AUTH_SECRET,
    // Apple sends people back with a form post from its own pages.
    trustedOrigins: modes.apple === 'live' ? ['https://appleid.apple.com'] : [],
    database: drizzleAdapter(db(), {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: config.APP_URL.startsWith('https://'),
      ...(inARequest ? { backgroundTasks: { handler: afterResponse } } : {}),
    },
    logger: { level: 'warn', log: redactingLog },
    session: {
      expiresIn: 14 * DAY,
      updateAge: DAY,
      // AU7: the library's own "recent sign-in" checks agree with Gaff's.
      freshAge: RECENT_SIGN_IN_SECONDS,
      additionalFields: { signInMethod: { type: 'string', required: false, input: false } },
    },
    // AU1, AU3: Sign in with Google and with Apple, where they're set up (./providers).
    socialProviders: {
      ...(modes.google === 'live'
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID!,
              clientSecret: config.GOOGLE_CLIENT_SECRET!,
              // Someone with several Google accounts chooses which.
              prompt: 'select_account' as const,
              mapProfileToUser: (profile: object) => prepareForProvider('google', profile),
            },
          }
        : {}),
      ...(modes.apple === 'live'
        ? {
            apple: {
              clientId: config.APPLE_CLIENT_ID!,
              clientSecret: appleClientSecret({
                teamId: config.APPLE_TEAM_ID!,
                clientId: config.APPLE_CLIENT_ID!,
                keyId: config.APPLE_KEY_ID!,
                privateKey: config.APPLE_PRIVATE_KEY!,
              }),
              mapProfileToUser: (profile: object) => prepareForProvider('apple', profile),
            },
          }
        : {}),
    },
    account: {
      // AU14: nothing of the provider's is refreshed or kept at each sign-in.
      updateAccountOnSignIn: false,
      accountLinking: {
        enabled: true,
        // Trust comes from who hosts the email address (./identity), never a provider's name.
        trustedProviders: [],
        // AU7: someone signed in can connect a Google or Apple account under another address.
        allowDifferentEmails: true,
        // A code by email always works, so any other way in can be removed.
        allowUnlinkingAll: true,
      },
    },
    // AU4: the rules for joining a Google or Apple sign-in to an account.
    user: { validateUserInfo: checkProviderIdentity },
    databaseHooks: {
      user: {
        create: {
          // AU16: a new account, and the way it was made.
          after: async (user, ctx) => {
            const method = methodOf(ctx);
            if (method === 'google' || method === 'apple') rememberMadeByProvider(user.id);
            if (method) await recordAccountEvent('account.signed_up', user.id, { method });
          },
        },
      },
      account: {
        create: {
          before: async (account) => ({ data: withoutTokens(account) }),
          after: async (account) => {
            await providerJoined(account);
          },
        },
        update: { before: async (account) => ({ data: withoutTokens(account) }) },
      },
      session: {
        create: {
          // AU16, M5: each session remembers the way in it began with.
          before: async (session, ctx) => ({
            data: { ...session, signInMethod: methodOf(ctx) },
          }),
          after: async (session, ctx) => {
            // The test copy: the founders in TEST_STAFF_EMAILS are testers (staff) once they
            // sign in.
            await makeListedTesterStaff(session.userId);
            const method = methodOf(ctx);
            if (method) await recordAccountEvent('account.signed_in', session.userId, { method });
          },
        },
      },
    },
    // AU1, AU2: a password account can't be used until a code confirms its email. That also
    // makes a second sign-up for the same address answer exactly like a first one.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      // AU5: a reset signs every device out.
      revokeSessionsOnPasswordReset: true,
      onExistingUserSignUp: async ({ user }) => {
        await sendAccountExists(user.email);
      },
      onPasswordReset: async ({ user }) => {
        await sendPasswordChanged(user.email, 'reset');
        await recordAccountEvent('account.password_changed', user.id, { how: 'reset' });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // The right password for an account nobody confirmed: a new code goes out.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    telemetry: { enabled: false },
    // AU12: the library's own limiter only sees requests that arrive over HTTP, and Gaff's
    // forms call it in-process. Gaff's limiter (./limits) runs as a hook, which sees both.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // The password first: one that's refused shouldn't use up the step's tries.
        await checkNewPassword(ctx);
        await limitTries(ctx);
      }),
      after: createAuthMiddleware(async (ctx) => {
        await countPasswordFailures(ctx);
      }),
    },
    plugins: [
      // AU2, AU3, AU5, M76: 6-digit codes by email, to sign in, to confirm a new account's email
      // and to reset a password. Codes, not links: an email scanner can't use one up, and it
      // works when the email is read on another device. Stored hashed; 10 minutes; 5 tries.
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_MINUTES * 60,
        allowedAttempts: CODE_TRIES,
        storeOTP: 'hashed',
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: sendCode,
      }),
      // Local development and tests: a page of Gaff's own plays Google and Apple. Everywhere
      // else the list is empty, and this does nothing.
      genericOAuth({ config: standInProviders(standIns) }),
      nextCookies(),
    ],
  });
}

let built: { auth: ReturnType<typeof createAuth>; at: number } | undefined;

/** The client secret made for Apple lasts 150 days; a set-up this old is built again. */
const REBUILD_AFTER_MS = 30 * DAY * 1000;

export function auth() {
  if (!built || Date.now() - built.at > REBUILD_AFTER_MS) {
    built = { auth: createAuth(), at: Date.now() };
  }
  return built.auth;
}

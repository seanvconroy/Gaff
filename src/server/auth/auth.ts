import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins/email-otp';
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
import { sendAccountExists, sendCode, sendPasswordChanged } from './emails';
import type { HookContext } from './hook-context';
import { countPasswordFailures, limitTries } from './limits';
import { checkNewPassword } from './passwords';

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
 * Accounts and sign-in, for renters, letters and Gaff's staff alike (M1, ADR-0016), with Better
 * Auth. How people sign in, and why, is ADR-0028. Accounts live in our own Postgres; no
 * third-party identity service holds them. Built on first use, not at import.
 */
function createAuth() {
  const config = env();
  const inARequest = Boolean(process.env.NEXT_RUNTIME) && config.GAFF_ENV !== 'test';
  return betterAuth({
    appName: 'Gaff',
    baseURL: config.APP_URL,
    secret: config.AUTH_SECRET,
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
    databaseHooks: {
      user: {
        create: {
          // AU16: a new account, and the way it was made.
          after: async (user, ctx) => {
            const method = methodOf(ctx);
            if (method) await recordAccountEvent('account.signed_up', user.id, { method });
          },
        },
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
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function auth() {
  instance ??= createAuth();
  return instance;
}

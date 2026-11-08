import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { magicLink } from 'better-auth/plugins/magic-link';
import { emailSender, gaffSender } from '@/adapters/email';
import { signInEmail } from '@/copy/operator-emails';
import { signInCodeEmail } from '@/copy/renter-emails';
import { db } from '@/db/client';
import { accounts, sessions, users, verifications } from '@/db/schema';
import { env } from '@/lib/env';
import { makeListedTesterStaff } from '@/server/staff/testers';

/**
 * Operator sign-in with one-time email links (ADR-0013). Accounts live in our own
 * Postgres; no third-party identity service. Built on first use, not at import.
 */
function createAuth() {
  const config = env();
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
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    // The test copy: the founders in TEST_STAFF_EMAILS are testers (staff) once they sign in.
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await makeListedTesterStaff(session.userId);
          },
        },
      },
    },
    emailAndPassword: { enabled: false },
    telemetry: { enabled: false },
    // Sign-in attempts are rate limited per IP, except in end-to-end tests, which sign in
    // many times a minute from one address.
    rateLimit: { enabled: config.GAFF_ENV !== 'test' },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await emailSender().send({ to: email, from: gaffSender(), ...signInEmail(url) });
        },
      }),
      // M76: renters confirm their email with a 6-digit code without leaving the enquiry sheet.
      // Codes are stored hashed, work for 10 minutes and allow 5 tries (tech spec).
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp }) => {
          await emailSender().send({ to: email, from: gaffSender(), ...signInCodeEmail(otp) });
        },
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

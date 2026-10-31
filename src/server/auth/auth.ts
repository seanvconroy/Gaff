import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins/magic-link';
import { emailSender, gaffSender } from '@/adapters/email';
import { signInEmail } from '@/copy/operator-emails';
import { db } from '@/db/client';
import { accounts, sessions, users, verifications } from '@/db/schema';
import { env } from '@/lib/env';

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
    emailAndPassword: { enabled: false },
    telemetry: { enabled: false },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await emailSender().send({ to: email, from: gaffSender(), ...signInEmail(url) });
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

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';

// People with accounts, managed by Better Auth (ADR-0015, which replaces ADR-0013's sign-in).
// Renters, owners and referees need no account: they keep their private links.

export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    /**
     * BA-8 (M5, AU8): how this session began: `email_code`, `sms_code`, `google`, `apple` or
     * `passkey`. Set
     * as the session is made, and never by a browser. Gaff's team need `passkey` in production.
     */
    signInMethod: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/**
 * UX-SI-4, UX-SI-5: a person's passkeys, kept by Better Auth's passkey plugin. Only the public
 * key is here; the private key never leaves the person's device.
 */
export const passkeys = pgTable(
  'passkeys',
  {
    id: text().primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: timestamp({ withTimezone: true }),
    aaguid: text(),
  },
  (t) => [
    index('passkeys_user_id_idx').on(t.userId),
    index('passkeys_credential_id_idx').on(t.credentialID),
  ],
);

/**
 * UX-SI-13 (ADR-0033): the mobile number a person signs in with, if they have one. One number a
 * person, and one person a number. A code by text to it signs its owner in while `provenAt` is
 * within 180 days (src/domain/auth/mobile.ts); after that, or for a number nobody has, the
 * holder proves their email too and the number goes to whoever does.
 *
 * It is the person's own, like their passkeys: no operator can read it, and it has nothing to do
 * with the mobile a renter confirms to book a viewing, which belongs to that application.
 */
export const signInMobiles = pgTable('sign_in_mobiles', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** As +353871234567. */
  mobile: text().notNull().unique(),
  /** When a code by text to it last signed this person in, or joined it to them. */
  provenAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/**
 * UX-SI-2: one-time codes: to sign in, to confirm it's you again (UX-SI-10), and to open a
 * private link's sensitive page (UX-SI-12). The code itself is never stored: only a keyed hash.
 * A code works in the browser that asked for it and nowhere else, so that browser's key is
 * hashed here too. Rows are deleted a day after they're sent (the retention job).
 */
export const oneTimeCodes = pgTable(
  'one_time_codes',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** `sign_in`, `confirm`, `private_link` or `add_mobile`. */
    purpose: text().notNull(),
    /**
     * Who the code is for: the email address or, by text, the mobile number (sign-in), the
     * person and the action (confirm), the hash of the link's token (private link), or the
     * person and the number (adding a mobile).
     */
    subject: text().notNull(),
    /** UX-SI-13: how it was sent: `email`, or `sms` for a text to a mobile. */
    channel: text().notNull().default('email'),
    /**
     * UX-SI-14, UX-SI-15: what the right code also joins to the person it signs in: a mobile
     * this browser has just proved, or the Google or Apple account that couldn't vouch for the
     * address (src/server/auth/joining.ts). Written by the server as the code is sent.
     */
    joining: jsonb(),
    /** SHA-256 of the random key in the asking browser's cookie. */
    browserHash: text().notNull(),
    /** HMAC-SHA-256 of the code, keyed with a key made from AUTH_SECRET. */
    codeHash: text().notNull(),
    /** SHA-256 of the token in the email's button, when the email has one (UX-SI-3). */
    linkHash: text().unique(),
    /** Wrong tries so far. Five finish the code. */
    attempts: integer().notNull().default(0),
    /** UX-ME-1: the try at signing in this code belongs to, for the sign-in funnel. */
    attemptId: uuid(),
    /** Where to go after signing in: a path on this site, checked before it was stored. */
    nextPath: text(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('one_time_codes_subject_idx').on(t.purpose, t.subject, t.sentAt),
    index('one_time_codes_browser_idx').on(t.purpose, t.browserHash, t.sentAt),
  ],
);

/**
 * UX-SI-10: a person confirmed it's them, just now, for one sensitive action. The browser that
 * confirmed holds a random grant in a cookie; only its hash is here. A confirmation is spent in
 * the same transaction as the change it allows, and works once.
 */
export const confirmations = pgTable(
  'confirmations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The sensitive action, as a code: `change_payment_account`, for example. */
    action: text().notNull(),
    /** How they confirmed: `passkey` or `email_code`. */
    method: text().notNull(),
    grantHash: text().notNull().unique(),
    confirmedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('confirmations_user_idx').on(t.userId, t.action)],
);

/**
 * AU12: the counters behind the limits on signing in (src/domain/auth/limits.ts), kept in
 * Postgres so a limit holds across every serverless instance. The key is a SHA-256 of what's
 * limited and who by (a network address, or an organisation): neither is stored. Counters whose
 * window began over a day ago are deleted by the nightly job (AU14).
 */
export const authLimits = pgTable(
  'auth_limits',
  {
    keyHash: text().primaryKey(),
    hits: integer().notNull(),
    windowStartedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index('auth_limits_window_idx').on(t.windowStartedAt)],
);

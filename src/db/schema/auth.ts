import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';

// Accounts, managed by Better Auth: one per person, for renting, letting or both (M1, ADR-0016),
// and for Gaff's own staff. How people sign in is ADR-0028. These are identity tables, read
// before anyone's zone is known, so they carry no row-level security (ADR-0017).

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
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** AU16, M5: the way in this session began with, as a code (src/domain/auth/sign-in-methods). */
    signInMethod: text(),
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
 * AU6, M5, M6: passkeys (Face ID, Touch ID, Windows Hello, a security key), in the shape Better
 * Auth's passkey plugin keeps them. Only the public key is here; the private key never leaves
 * the person's device.
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
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    aaguid: text(),
  },
  (t) => [
    index('passkeys_user_id_idx').on(t.userId),
    index('passkeys_credential_id_idx').on(t.credentialID),
  ],
);

/**
 * AU12: counters for the limits on signing in (src/server/auth/limits.ts). The key is a hash of
 * what's being limited and who by, so no network address or email is stored. Rows are deleted a
 * day after their window began (the nightly job).
 */
export const authLimits = pgTable('auth_limits', {
  keyHash: text().primaryKey(),
  hits: integer().notNull(),
  windowStartedAt: timestamp({ withTimezone: true }).notNull(),
});

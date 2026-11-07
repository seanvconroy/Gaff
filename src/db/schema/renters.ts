import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, renterPolicy, updatedAt } from './columns';

/**
 * M8, M9 (Q25): a renter's own profile, in the renter zone (ADR-0017). It holds only what
 * Gaff asks before a viewing; letters get copies through their applications, at each stage.
 */
export const renterProfiles = pgTable(
  'renter_profiles',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    givenName: text().notNull(),
    familyName: text(),
    mobile: text(),
    mobileConfirmedAt: timestamp({ withTimezone: true }),
    /** "Keep my details for next time": unticked unless the renter ticks it (Q25). */
    keepDetails: boolean().notNull().default(false),
    keepConsentAt: timestamp({ withTimezone: true }),
    keepConsentVersion: text(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [renterPolicy()],
).enableRLS();

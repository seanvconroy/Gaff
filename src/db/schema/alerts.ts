import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { alertFrequencies } from '@/domain/alerts/alerts';
import { users } from './auth';
import { createdAt, renterPolicy, updatedAt } from './columns';
import { listings } from './listings';

/**
 * M10, M85 to M88: saved homes, saved searches and their alerts. They belong to the renter
 * (the renter zone, ADR-0017) and are never shared with letters.
 */

/** M85: a saved home, with a private note, and what it looked like when saved. */
export const savedHomes = pgTable(
  'saved_homes',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    note: text(),
    /** M51, M85: so a lower rent, or enquiries closing, can be shown. */
    rentCentsWhenSaved: integer().notNull(),
    statusWhenSaved: text().notNull(),
    savedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] }), renterPolicy()],
).enableRLS();

/** M86: a saved search: a place and filters, as in its web address, and how often to alert. */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** The search's address: "/to-rent/dublin/rathmines". */
    areaPath: text().notNull(),
    /** The filters' canonical query string (M58). */
    query: text().notNull().default(''),
    frequency: text({ enum: alertFrequencies }).notNull().default('instant'),
    lastSentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('saved_searches_user_idx').on(t.userId), renterPolicy()],
).enableRLS();

/** M86, M87: each home matched to a saved search, once, and when it was sent. Kept 90 days. */
export const alertDeliveries = pgTable(
  'alert_deliveries',
  {
    savedSearchId: uuid()
      .notNull()
      .references(() => savedSearches.id, { onDelete: 'cascade' }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    matchedAt: createdAt(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.savedSearchId, t.listingId] }),
    index('alert_deliveries_unsent_idx').on(t.userId, t.sentAt),
    renterPolicy(),
  ],
).enableRLS();

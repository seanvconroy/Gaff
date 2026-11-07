import { date, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { tenantPolicy } from './columns';
import { listings } from './listings';
import { organisations } from './organisations';

/**
 * Measurement (tech spec): first-party counts with no cookies. The view beacon counts each
 * listing page view against the listing and the day; letters see the totals (M92). No public
 * view counts (M72).
 */
export const listingDailyStats = pgTable(
  'listing_daily_stats',
  {
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    /** The Irish calendar day. */
    day: date({ mode: 'string' }).notNull(),
    views: integer().notNull().default(0),
    visitors: integer().notNull().default(0),
    /** M92: renters who saved the home that day. Who saved it stays in their own zone. */
    saves: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.day] }), tenantPolicy()],
).enableRLS();

/**
 * Who has already been counted today, so a visitor counts once a day. The hash is of the IP
 * address and browser with a key that changes every day and is never stored, so nobody can be
 * followed from one day to the next. The retention job deletes the rows the next day.
 */
export const listingVisitors = pgTable(
  'listing_visitors',
  {
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    visitorHash: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.day, t.visitorHash] }), tenantPolicy()],
).enableRLS();

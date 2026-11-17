import { sql } from 'drizzle-orm';
import { check, index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { reportOutcomes, reportReasons } from '@/domain/homes/report';
import { users } from './auth';
import { lettings } from './lettings';

const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

/**
 * UX-TS-3, UX-TS-4: "Report this listing". Gaff's own record, for Gaff's own team: not the
 * lister's. It has no organisation, and only withSystem() can reach it, so no operator's query
 * can read a report about their home, or anything in it.
 *
 * It holds the home (the letting and its public reference), the answer tapped, the short note
 * "Something else" asks for, when it was sent, and what Gaff's team did. Nothing about whoever
 * sent it: no account, name, address, IP address or device is ever stored. The retention job
 * deletes it at `deleteAfter`: six months after it was answered (`REPORT_KEPT_DAYS`).
 */
export const listingReports = pgTable(
  'listing_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    /** The home's public reference, as the page the report came from showed it. */
    homeRef: text().notNull(),
    reason: text({ enum: reportReasons }).notNull(),
    /** Only with "Something else": the visitor's own few words, at most 500 characters. */
    note: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Null while it waits for Gaff's team. */
    outcome: text({ enum: reportOutcomes }),
    answeredAt: timestamp({ withTimezone: true }),
    /** The one of Gaff's team who answered it. */
    answeredBy: text().references(() => users.id, { onDelete: 'set null' }),
    deleteAfter: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index('listing_reports_open_idx').on(t.outcome, t.receivedAt),
    index('listing_reports_letting_idx').on(t.lettingId),
    check(
      'listing_reports_note_only_for_something_else',
      sql`${t.note} is null or (${t.reason} = 'something_else' and char_length(${t.note}) <= 500)`,
    ),
    pgPolicy('listing_reports_system', {
      as: 'permissive',
      for: 'all',
      using: systemOnly,
      withCheck: systemOnly,
    }),
  ],
).enableRLS();

import { sql } from 'drizzle-orm';
import { date, integer, pgPolicy, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { mapEvents } from '@/domain/map/counts';

const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

/**
 * M133: how the search map is used, counted by Irish calendar day, event and kind, added to by
 * the page's own beacon (`/api/map/count`). Only the fixed codes in src/domain/map/counts.ts are
 * ever stored: nothing about the renter, their device, the area or what they searched for. No
 * cookies and no visitor hash: these are uses, not people. No organisation, no person.
 *
 * Only withSystem() reaches it, for Gaff's internal page; the nightly retention job deletes rows
 * after 13 months (MAP_COUNT_KEEP_DAYS).
 */
export const mapDailyCounts = pgTable(
  'map_daily_counts',
  {
    day: date({ mode: 'string' }).notNull(),
    event: text({ enum: mapEvents }).notNull(),
    kind: text().notNull().default(''),
    count: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.event, t.kind] }),
    pgPolicy('map_daily_counts_system', {
      as: 'permissive',
      for: 'all',
      using: systemOnly,
      withCheck: systemOnly,
    }),
  ],
).enableRLS();

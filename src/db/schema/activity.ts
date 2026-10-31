import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { tenantPolicy } from './columns';
import { lettings } from './lettings';
import { organisations } from './organisations';

/**
 * R28, Q15: one row per person per active minute in the workspace, with the letting they were
 * on, if any. Shown only as totals per letting, never per person. Operators are told.
 */
export const activityMinutes = pgTable(
  'activity_minutes',
  {
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lettingId: uuid().references(() => lettings.id, { onDelete: 'cascade' }),
    minute: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('activity_minutes_user_minute_idx').on(t.userId, t.minute),
    index('activity_minutes_letting_idx').on(t.organisationId, t.lettingId),
    tenantPolicy(),
  ],
).enableRLS();

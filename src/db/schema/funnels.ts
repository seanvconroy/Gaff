import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

/**
 * UX-ME-1: funnel steps the letting's record has no event for, and steps that belong to no
 * letting or organisation, such as opening the sign-in screen. One row per step per subject:
 * the unique index makes "once per subject" a rule of the database.
 *
 * It holds a step code, an ID, an optional split code, a time and numbers: no personal data
 * (rule 8, ADR-0006), and no organisation. Nothing about a renter's device, location or
 * behaviour is kept (UX-ME-4).
 *
 * Any use case may add a row. Only withSystem() can read them, for Gaff's internal page, so no
 * operator's query can reach them. Rows can't be changed; the retention job deletes old ones.
 */
export const funnelEvents = pgTable(
  'funnel_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** The step's full code from the funnel catalogue, such as "sign_in.signed_in". */
    step: text().notNull(),
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
    /** The funnel's split, as a code: the sign-in method, for example. */
    variant: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    data: jsonb().$type<Record<string, number | boolean>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('funnel_events_step_subject_idx').on(t.step, t.subjectId),
    index('funnel_events_occurred_idx').on(t.occurredAt),
    check('funnel_events_step_is_code', sql`${t.step} ~ '^[a-z][a-z_]*[.][a-z][a-z_]*$'`),
    check('funnel_events_subject_type_is_code', sql`${t.subjectType} ~ '^[a-z][a-z_]*$'`),
    check(
      'funnel_events_variant_is_code',
      sql`${t.variant} is null or ${t.variant} ~ '^[a-z][a-z_]*$'`,
    ),
    pgPolicy('funnel_events_add', { as: 'permissive', for: 'insert', withCheck: sql`true` }),
    pgPolicy('funnel_events_read', { as: 'permissive', for: 'select', using: systemOnly }),
    pgPolicy('funnel_events_purge', { as: 'permissive', for: 'delete', using: systemOnly }),
  ],
).enableRLS();

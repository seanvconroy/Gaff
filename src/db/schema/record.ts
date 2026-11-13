import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy } from './columns';
import { organisations } from './organisations';

export const actorType = pgEnum('actor_type', [
  'person',
  'ai',
  'system',
  'renter',
  'landlord',
  'staff',
]);

/**
 * The append-only log behind each letting's record (R27, ADR-0006). A trigger blocks
 * updates and deletes. Payloads never hold personal data: only IDs, codes, counts and dates.
 */
export const events = pgTable(
  'events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorType: actorType().notNull(),
    actorId: text(),
    type: text().notNull(),
    subjectType: text(),
    subjectId: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('events_letting_idx').on(t.organisationId, t.lettingId, t.occurredAt),
    tenantPolicy(),
  ],
).enableRLS();

/** Who decided what, when, and on what basis (ADR-0007). Only a signed-in person decides. */
export const decisions = pgTable(
  'decisions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid(),
    kind: text().notNull(),
    decidedBy: text()
      .notNull()
      .references(() => users.id),
    decidedAt: createdAt(),
    /** Snapshot of what the person saw: criteria, ranking positions and reason codes (IDs only). */
    basis: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('decisions_letting_idx').on(t.organisationId, t.lettingId), tenantPolicy()],
).enableRLS();

/**
 * Events outside any organisation (ADR-0017): a renter's own account, Gaff staff's decisions on
 * platform matters. The same rule as events: IDs, codes, numbers and dates only (ADR-0006), and
 * append-only. Anyone may add one; only staff and system jobs may read them.
 */
export const platformEvents = pgTable(
  'platform_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorType: actorType().notNull(),
    actorId: text(),
    type: text().notNull(),
    subjectType: text(),
    subjectId: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('platform_events_subject_idx').on(t.subjectType, t.subjectId, t.occurredAt),
    pgPolicy('platform_append', { as: 'permissive', for: 'insert', withCheck: sql`true` }),
    pgPolicy('staff_read', {
      as: 'permissive',
      for: 'select',
      using: sql`current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on'`,
    }),
  ],
).enableRLS();

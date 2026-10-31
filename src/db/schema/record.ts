import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy } from './columns';
import { organisations } from './organisations';

export const actorType = pgEnum('actor_type', ['person', 'ai', 'system', 'renter', 'landlord']);

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

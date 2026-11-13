import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aiOutcomes, aiTasks } from '@/domain/ai/tasks';
import { organisations } from './organisations';

const staffOrSystem = sql`current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on'`;

/**
 * P3 (ADR-0025): one row per AI call, in the platform zone: the task, model, prompt version,
 * tokens, estimated cost, time taken and outcome. Never the text sent or received. Any use case
 * may add one; only Gaff staff and system jobs read them. Deleted after 12 months.
 */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    task: text({ enum: aiTasks }).notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    promptVersion: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    /** Estimated, in millionths of a US dollar (src/domain/ai/prices.ts). */
    costMicros: bigint({ mode: 'number' }).notNull().default(0),
    latencyMs: integer().notNull().default(0),
    outcome: text({ enum: aiOutcomes }).notNull(),
    /** For the cost per letter; null for platform tasks. */
    organisationId: uuid().references(() => organisations.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('ai_calls_month_idx').on(t.occurredAt),
    pgPolicy('platform_append', { as: 'permissive', for: 'insert', withCheck: sql`true` }),
    pgPolicy('staff_read', { as: 'permissive', for: 'select', using: staffOrSystem }),
    pgPolicy('system_delete', {
      as: 'permissive',
      for: 'delete',
      using: sql`current_setting('app.rls_bypass', true) = 'on'`,
    }),
  ],
).enableRLS();

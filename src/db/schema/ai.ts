import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
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

const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

/**
 * P3 (ADR-0017): one row per AI call: the task, provider, model, prompt version, tokens,
 * estimated cost, time taken and outcome. Never the text sent or received, and nothing about
 * any person (rule 8). The organisation is kept only to see the cost per operator.
 *
 * Gaff's own record, like the funnel events: any use case may add a row, and only withSystem()
 * can read or delete them (the budget, the retention job), so no operator's query can reach
 * them. The retention job deletes a row after 12 months (rule 9).
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
    /** For the cost per operator; null for a call that belongs to no organisation. */
    organisationId: uuid().references(() => organisations.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('ai_calls_occurred_idx').on(t.occurredAt),
    pgPolicy('ai_calls_add', { as: 'permissive', for: 'insert', withCheck: sql`true` }),
    pgPolicy('ai_calls_read', { as: 'permissive', for: 'select', using: systemOnly }),
    pgPolicy('ai_calls_purge', { as: 'permissive', for: 'delete', using: systemOnly }),
  ],
).enableRLS();

/**
 * P4: the months Gaff's team has been told the AI has used 80% of its budget, so the email goes
 * once a month however many servers see the line crossed. A month and a time; nothing else.
 */
export const aiBudgetWarnings = pgTable(
  'ai_budget_warnings',
  {
    /** The first day of the month, "2026-11-01". */
    month: date({ mode: 'string' }).primaryKey(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('ai_budget_warnings_system', {
      as: 'permissive',
      for: 'all',
      using: systemOnly,
      withCheck: systemOnly,
    }),
  ],
).enableRLS();

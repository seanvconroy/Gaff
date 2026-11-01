import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { checkKinds, checkStatuses } from '@/domain/checks/checks';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { applications } from './enquiries';
import { lettings } from './lettings';
import { organisations } from './organisations';

/**
 * R18, stage 6: identity, income and reference checks, for the preferred applicant and the
 * backup only. No document images, ever: only the result, encrypted in the application
 * (ADR-0005), and the referee's name and email for references. Cleared by the retention job.
 */
export const checks = pgTable(
  'checks',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    kind: text({ enum: checkKinds }).notNull(),
    status: text({ enum: checkStatuses }).notNull().default('to_do'),
    provider: text(),
    providerRef: text(),
    refereeName: text(),
    refereeEmail: text(),
    /** The result, sealed with AES-256-GCM (src/lib/crypto.ts). */
    resultSealed: text(),
    /** Why it didn't pass, as a code, e.g. "face_mismatch" or "no_regular_income". */
    reason: text(),
    remindersSent: integer().notNull().default(0),
    requestedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('checks_application_kind_idx').on(t.applicationId, t.kind),
    index('checks_letting_idx').on(t.organisationId, t.lettingId),
    tenantPolicy(),
  ],
).enableRLS();

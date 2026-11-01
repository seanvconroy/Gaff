import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy } from './columns';
import { applications } from './enquiries';
import { lettings } from './lettings';
import { organisations } from './organisations';

const answer = ['approved', 'declined'] as const;

/**
 * R19: the landlord's approval of the preferred applicant and the backup, asked by private
 * link (or confirmed by the operator when there's no landlord email, Q22). Withdrawn if the
 * operator changes their choice.
 */
export const landlordApprovals = pgTable(
  'landlord_approvals',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    preferredId: uuid()
      .notNull()
      .references(() => applications.id),
    backupId: uuid().references(() => applications.id),
    status: text({ enum: ['requested', 'answered', 'withdrawn'] })
      .notNull()
      .default('requested'),
    preferredAnswer: text({ enum: answer }),
    backupAnswer: text({ enum: answer }),
    requestedBy: text()
      .notNull()
      .references(() => users.id),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('landlord_approvals_letting_idx').on(t.organisationId, t.lettingId),
    tenantPolicy(),
  ],
).enableRLS();

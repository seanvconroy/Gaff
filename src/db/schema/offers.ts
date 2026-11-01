import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

/**
 * R20: an offer of the home to one renter, with a deadline. The terms are the rent, a deposit of
 * no more than one month's rent and a move-in date; nothing else is ever asked (rule 4). If the
 * operator pre-approved it (Q20), an offer that isn't accepted goes to the backup.
 */
export const offers = pgTable(
  'offers',
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
    role: text({ enum: ['preferred', 'backup'] }).notNull(),
    status: text({ enum: ['open', 'accepted', 'declined', 'expired'] })
      .notNull()
      .default('open'),
    rentCents: integer().notNull(),
    depositCents: integer().notNull(),
    startDate: date({ mode: 'string' }).notNull(),
    deadlineHours: integer().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** The person's make_offer decision this offer follows (for a backup, the same one). */
    decisionId: uuid().notNull(),
    /** Q20: the backup to offer it to if this one isn't accepted in time. */
    thenOfferToId: uuid().references(() => applications.id),
    respondedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('offers_letting_idx').on(t.organisationId, t.lettingId), tenantPolicy()],
).enableRLS();

import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { checkMethods, checkStatuses } from '@/domain/verification/readiness';
import { users } from './auth';
import { createdAt, renterPolicy, staffReviewPolicy, tenantPolicy, updatedAt } from './columns';
import { organisations } from './organisations';

/**
 * M22 to M27: what Gaff has checked about a letter. One row per subject and method: the
 * organisation's licence (no user), and each member's licence or identity. Gaff keeps the result,
 * the verified name and the date only: never document images or a date of birth (Q19).
 */
export const letterChecks = pgTable(
  'letter_checks',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** Null for the organisation's own licence. */
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    method: text({ enum: checkMethods }).notNull(),
    status: text({ enum: checkStatuses }).notNull().default('pending'),
    licenceNumber: text(),
    verifiedName: text(),
    /** The provider's reference, e.g. a Stripe Identity verification session. */
    providerRef: text(),
    reason: text({
      enum: ['name_differs', 'not_current', 'not_found', 'document', 'face_mismatch', 'gave_up'],
    }),
    checkedAt: timestamp({ withTimezone: true }),
    /** The Gaff staff member who decided, when a person did. */
    checkedBy: text().references(() => users.id),
    /** M24: when the provider was asked to delete its copy of the documents. */
    providerRedactedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('letter_checks_subject_method').on(
      t.organisationId,
      sql`coalesce(${t.userId}, '')`,
      t.method,
    ),
    index('letter_checks_queue_idx').on(t.status, t.createdAt),
    index('letter_checks_provider_ref_idx').on(t.providerRef),
    tenantPolicy(),
    staffReviewPolicy(),
  ],
).enableRLS();

/**
 * M3: a person's mobile number and the code sent to confirm it. It belongs to the person, not
 * to an organisation, so it's in the renter zone (one row per person).
 */
export const phoneConfirmations = pgTable(
  'phone_confirmations',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    phone: text().notNull(),
    codeHash: text(),
    codeExpiresAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    sendsToday: integer().notNull().default(0),
    lastSentAt: timestamp({ withTimezone: true }),
    confirmedPhone: text(),
    confirmedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [renterPolicy()],
).enableRLS();

/** M16: an admin invites a colleague by email. The token is hashed; the email goes once used. */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    email: text(),
    role: text({ enum: ['admin', 'negotiator'] }).notNull(),
    tokenHash: text().notNull().unique(),
    invitedBy: text()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_organisation_idx').on(t.organisationId), tenantPolicy()],
).enableRLS();

/** Gaff staff: who may review checks and listings (M105). An identity table, like memberships. */
export const staffMembers = pgTable('staff_members', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text({ enum: ['reviewer', 'admin'] }).notNull(),
  createdAt: createdAt(),
});

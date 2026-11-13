import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identityStatuses } from '@/domain/identity/access';
import { users } from './auth';
import { createdAt, renterPolicy, updatedAt } from './columns';

/**
 * P15 to P29 (Q48, ADR-0026): one identity check per person, renter or letter, in the person's
 * own zone (ADR-0017). Gaff keeps the result, the verified name (sealed), whether a selfie was
 * checked and the date; never the document, the selfie, a date of birth or a document number.
 * Workspaces get a copy for their badges (letter_checks), and an application gets one only when
 * the renter is chosen (checks). Deleted with the account.
 */
export const identityChecks = pgTable(
  'identity_checks',
  {
    /** Opaque: the only ID Stripe and the stand-in page see, with the user's. */
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text({ enum: identityStatuses }).notNull().default('pending'),
    /** P19: whether the selfie was checked against the document. */
    selfie: boolean().notNull().default(true),
    /** First and last name from the ID, sealed (src/lib/crypto.ts). */
    verifiedNameSealed: text(),
    /** Who checked it: Stripe, the stand-in, or a person at Gaff who saw the original (Q55). */
    provider: text({ enum: ['stand_in', 'stripe', 'staff'] }).notNull(),
    providerRef: text(),
    attempts: integer().notNull().default(0),
    reason: text({ enum: ['document', 'face_mismatch', 'gave_up'] }),
    /** P18: the selfie consent the person agreed to, and when. */
    consentVersion: text(),
    consentedAt: timestamp({ withTimezone: true }),
    checkedAt: timestamp({ withTimezone: true }),
    /** Q55: the person at Gaff who saw the original, when Stripe couldn't check it. */
    checkedBy: text().references(() => users.id),
    /** P26: when Stripe was asked to delete its copy of the document and selfie. */
    providerRedactedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('identity_checks_provider_ref_idx').on(t.providerRef), renterPolicy()],
).enableRLS();

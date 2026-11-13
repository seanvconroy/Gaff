import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { RenterAnswers } from '@/domain/criteria/answers';
import type { DataGroup } from '@/domain/profiles/sharing';
import { users } from './auth';
import { createdAt, renterPolicy, updatedAt } from './columns';
import { organisations } from './organisations';

/**
 * M8, M9 (Q25): a renter's own profile, in the renter zone (ADR-0017). It holds only what
 * Gaff asks before a viewing; letters get copies through their applications, at each stage.
 */
export const renterProfiles = pgTable(
  'renter_profiles',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    givenName: text().notNull(),
    familyName: text(),
    mobile: text(),
    mobileConfirmedAt: timestamp({ withTimezone: true }),
    /** "Keep my details for next time": unticked unless the renter ticks it (Q25). */
    keepDetails: boolean().notNull().default(false),
    keepConsentAt: timestamp({ withTimezone: true }),
    keepConsentVersion: text(),
    /** M8: answers to the pre-viewing questions, kept only with "Keep my details" (M9). */
    answers: jsonb().$type<RenterAnswers>(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [renterPolicy()],
).enableRLS();

/**
 * M79: "My homes": the homes a renter enquired about on Gaff, in their own zone, with what the
 * listing showed when they enquired, so the list stays readable after the listing goes.
 */
export const renterEnquiries = pgTable(
  'renter_enquiries',
  {
    applicationId: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid().notNull(),
    listingId: uuid(),
    title: text().notNull(),
    addressShown: text().notNull(),
    slug: text(),
    letterName: text().notNull(),
    enquiredAt: timestamp({ withTimezone: true }).notNull(),
    withdrawnAt: timestamp({ withTimezone: true }),
  },
  () => [renterPolicy()],
).enableRLS();

/**
 * M11, M12: each time a group of a renter's details is copied to a letter, at its stage
 * (rule 2). Behind "Who has my details". IDs and the group only.
 */
export const profileShares = pgTable(
  'profile_shares',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    applicationId: uuid().notNull(),
    dataGroup: text().$type<DataGroup>().notNull(),
    sharedAt: createdAt(),
  },
  (t) => [
    unique('profile_shares_application_group').on(t.applicationId, t.dataGroup),
    renterPolicy(),
  ],
).enableRLS();

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { KeptAnswers } from '@/domain/profile/kept';
import { users } from './auth';
import { createdAt, personPolicy, updatedAt } from './columns';
import { applications } from './enquiries';
import { lettings } from './lettings';
import { organisations } from './organisations';
import { psraRegister } from './register';

/**
 * A person's own profile (UX-AC-1, UX-AC-5, ADR-0016): what Gaff keeps about a person as a
 * person, whatever they do on Gaff. It belongs to them and to no organisation: it has no
 * `organisation_id`, and its row-level security lets only the person's own path read it
 * (`withPerson`). No operator query can reach it.
 *
 * The person's name, email and sign-in methods stay in Better Auth's tables (`users`,
 * `accounts`, `passkeys`). What a renter keeps (WP-14) and a verified identity (WP-24) get their
 * own tables beside this one, with the same policy.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UX-AC-2: when they said they're looking for a home. Null: "Renting" isn't one of theirs. */
    rentingSince: timestamp({ withTimezone: true }),
    /** UX-AC-11: the side they used last, `letting` or `renting`. Gaff reopens it. */
    lastSide: text({ enum: ['letting', 'renting'] }),
    /** UX-AC-11: the organisation they let for last, when they belong to more than one. */
    lastOrganisationId: uuid().references(() => organisations.id, { onDelete: 'set null' }),
    /**
     * UX-AC-10: where they are in first run, so they can leave and come back. `agency` once
     * they've said they work at one; the entry they picked, until they answer "Is this yours?".
     */
    firstRunPurpose: text({ enum: ['agency'] }),
    firstRunRegisterEntryId: uuid().references(() => psraRegister.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [personPolicy()],
).enableRLS();

/**
 * What a renter keeps for next time (UX-PF-1 to UX-PF-5, Q25): the details they chose to keep,
 * and nothing else. Gaff is its controller, not any operator. Like `profiles`, it belongs to the
 * person: no `organisation_id`, and only their own path (`withPerson`) can read or write it.
 *
 * It may hold exactly what `src/domain/profile/kept.ts` lists: a mobile number they gave, the
 * four fixed answers, and how they earn with their household's take-home income and the date they
 * said so. No photo, no free text, no document, nothing about a protected ground, and nothing
 * that says whether they receive housing support (rule 3). A verified identity is WP-24's, in a
 * table of its own.
 *
 * `last_used_at` is the clock for rule 9: unused for two years, the retention job deletes it,
 * 30 days after `deletion_notice_sent_at` (UX-PF-7).
 */
export const renterProfiles = pgTable(
  'renter_profiles',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UX-PF-2: what they enter in an enquiry or an application is kept, until they switch it off. */
    keepsDetails: boolean().notNull().default(true),
    /** A mobile number they gave themselves, for text reminders. Never one from an enquiry (Q12). */
    mobile: text(),
    answers: jsonb().$type<KeptAnswers>().notNull().default({}),
    answersAt: timestamp({ withTimezone: true }),
    earning: text({ enum: ['employed', 'self_employed', 'other'] }),
    /** Household take-home income each month, in cents. Housing support is inside it, unnamed. */
    monthlyIncomeCents: integer(),
    /** UX-PF-5: when they said what they earn. Income is offered back with this date. */
    incomeAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletionNoticeSentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [personPolicy()],
).enableRLS();

/**
 * A renter's own list of the homes they've asked about (UX-RH-1, UX-RH-4): one row per enquiry
 * that a signed-in person has shown to be theirs. It is the person's pointer to an application,
 * and it belongs to them: the operator's rows say nothing about who has a profile, and no
 * operator's path can read this (UX-AC-5).
 *
 * `lister_organisation_id` and `letting_id` say where the application lives, so the person's own
 * path can open it. They scope nothing here: the policy is the person's alone. The application
 * itself stays the operator's copy; when it is deleted on schedule this row goes with it.
 */
export const renterEnquiries = pgTable(
  'renter_enquiries',
  {
    /** One enquiry is one person's. */
    applicationId: uuid()
      .primaryKey()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listerOrganisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('renter_enquiries_user_idx').on(t.userId, t.lettingId), personPolicy()],
).enableRLS();

/**
 * The record of what happened to a person's own profile (rule 8): kept, changed, offered back,
 * downloaded, deleted. It holds a type, IDs, codes, yes/no values and dates, and never a detail
 * itself (src/server/accounts/profile-events.ts). It belongs to no organisation, so it can't go
 * in a letting's record.
 *
 * `user_id` is not a foreign key: the line that says a profile was deleted outlives the profile,
 * as an ID that leads nowhere. Rows are deleted with the rest of the anonymous record.
 */
export const profileEvents = pgTable(
  'profile_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    type: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('profile_events_user_idx').on(t.userId, t.occurredAt), personPolicy()],
).enableRLS();

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { KeptAnswers } from '@/domain/profile/kept';
import type { SearchFilters } from '@/domain/search/filters';
import { alertFrequencies } from '@/domain/saved/saved';
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
    /** UX-SR-10: whether their saved searches email them when a new home fits. */
    searchAlerts: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [personPolicy()],
).enableRLS();

/**
 * Saved (UX-RH, UX-SR-6): the homes a renter saved with the heart. It belongs to the person and
 * to no organisation: only their own path (`withPerson`) can read or write it, and no operator
 * can see who saved their home (UX-AC-5, UX-MT-14).
 *
 * A home is held by its public reference (`lettings.public_ref`): it never changes when the
 * letting is edited, and it is not the letting's internal ID, so nothing new is exposed in any
 * address. It is deliberately not a foreign key: a home that leaves Gaff stays on the list,
 * marked, until the renter removes it. It goes with the profile (UX-PF-6, UX-PF-7).
 */
export const savedHomes = pgTable(
  'saved_homes',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    homeRef: text().notNull(),
    /**
     * M85 (BA-13): the rent when it was saved, so Saved can say it has come down. Null for a
     * home saved before this was kept.
     */
    rentCentsWhenSaved: integer(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.homeRef] }), personPolicy()],
).enableRLS();

/**
 * Saved searches (UX-SR-10, UX-MT-13 to UX-MT-16): a search a renter asked to hear about. It
 * holds the chips' values (`src/domain/saved/saved.ts`, `filtersToKeep`) and never the sentence,
 * and never step-free access or a lift (UX-MT-12).
 *
 * It is held either on a person's profile (`user_id`), or by an email address alone for someone
 * who isn't signed in (`email`), never both. Like everything a person keeps it has
 * `personPolicy()`: a profile's searches are read only through `withPerson()`, and one held by an
 * email alone has no person, so only the system path reaches it, from the links in its own
 * emails. No operator's path can read either (UX-MT-14), and operators don't choose who is told
 * (UX-MT-16).
 *
 * Its links carry a random token: only its hash is used to find the search, and the token is
 * kept sealed (ADR-0005) so a later email can carry "Stop these". Rule 9: one held by an email
 * alone is deleted when stopped, if it isn't confirmed within a day, and two years after it was
 * confirmed; one on a profile goes with the profile.
 */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    /** Only for a search held without a profile: where its email goes. Lower case. */
    email: text(),
    filters: jsonb().$type<SearchFilters>().notNull(),
    /** The filters in their fixed order: the same search saved twice is one. */
    searchKey: text().notNull(),
    /** A profile's search is confirmed when saved; an email's, when its link is opened. */
    confirmedAt: timestamp({ withTimezone: true }),
    tokenHash: text().notNull().unique(),
    tokenSealed: text().notNull(),
    /** UX-SR-10: the homes already told about, by public reference: each home once. */
    toldHomeRefs: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * M86 (Q51): as soon as a home that fits is listed (`instant`, the default), or once a day
     * at 8am Irish time (`daily`). Changed on Saved and from the foot of every alert.
     */
    frequency: text({ enum: alertFrequencies }).notNull().default('instant'),
    /** UX-SR-10, M86: when its last alert went; a daily search sends one a day at most. */
    lastAlertAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('saved_searches_person_key')
      .on(t.userId, t.searchKey)
      .where(sql`${t.userId} is not null`),
    uniqueIndex('saved_searches_email_key')
      .on(t.email, t.searchKey)
      .where(sql`${t.email} is not null`),
    check('saved_searches_one_holder', sql`(${t.userId} is null) <> (${t.email} is null)`),
    personPolicy(),
  ],
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
 * A verified identity (Q35, rule 2, UX-PF-8 to UX-PF-11): kept on a person's own profile only
 * because they chose to keep it, or because they let their own homes and confirmed it's them at
 * their first go-live (Q47). It belongs to the person: no `organisation_id`, and only their own
 * path (`withPerson`) can read or write it. No operator's path can see who has one (UX-PF-12).
 *
 * It holds exactly three things (UX-PF-10): that the check passed (the row exists), the verified
 * name, and the date. Never an image, a document number or type, an issuing country or a date of
 * birth: a compliance test holds the columns to `keptIdentityColumns`. One per person: a check
 * done again replaces it ("My name has changed"). No expiry (UX-PF-9): it goes with the profile.
 */
export const verifiedIdentities = pgTable(
  'verified_identities',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    verifiedName: text().notNull(),
    verifiedAt: timestamp({ withTimezone: true }).notNull(),
  },
  () => [personPolicy()],
).enableRLS();

/**
 * A person's own ID check while it runs, where no letting's checks asked for it: a private
 * landlord's go-live (Q47) or "My name has changed" (UX-PF-9). It holds codes, counts and dates
 * only; the result goes to `verified_identities` when it passes. Person-owned like the rest: an
 * operator never sees that one was started.
 *
 * It is also the provider's bookkeeping (P18, P25, P26; ADR-0020): one provider session reused
 * for every try, the tries, the version of the words shown before it started, and the deletion
 * date by which the provider must have deleted the document and selfie (`redact_after`). A
 * check that passed with a real provider stays, as `passed`, until the retention job has had
 * the provider redact it, and then goes. Never a name, an image or anything from the ID.
 */
export const identityChecks = pgTable(
  'identity_checks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text({ enum: ['go_live', 'name_changed'] }).notNull(),
    status: text({ enum: ['in_progress', 'not_passed', 'passed'] })
      .notNull()
      .default('in_progress'),
    /** A provider's reason code when it didn't pass. */
    reason: text({ enum: ['document', 'face_mismatch', 'gave_up'] }),
    provider: text(),
    providerRef: text(),
    /** P25: tries started with the provider. */
    attempts: integer().notNull().default(0),
    /** P18: the version of the words shown before the latest try (`ID_CHECK_NOTICE_VERSION`). */
    consentVersion: text(),
    /** P26, rule 9: by when the provider must have deleted what it holds for this check. */
    redactAfter: timestamp({ withTimezone: true }),
    providerRedactedAt: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('identity_checks_user_idx').on(t.userId), personPolicy()],
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

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Criteria } from '@/domain/criteria/criteria';
import { reportReasons } from '@/domain/homes/report';
import { hiddenStages } from '@/domain/trust/cases';
import { draftOrigins, flowSteps, type DraftAnswers } from '@/domain/lettings/add-letting';
import { pointSources } from '@/domain/map/pin';
import { photoKinds } from '@/domain/lettings/photo-files';
import type { DraftReading } from '@/domain/lettings/advert-reading';
import type { Portal } from '@/domain/lettings/setup';
import { stages } from '@/domain/lettings/stages';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { developments, unitTypes } from './developments';
import { inboundEmails } from './enquiries';
import { organisations } from './organisations';

export const lettingStage = pgEnum('letting_stage', stages);
export const lettingStatus = pgEnum('letting_status', ['draft', 'live', 'let', 'withdrawn']);
export const viewingKind = pgEnum('viewing_kind', ['slots', 'group']);

const organisationId = () =>
  uuid()
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' });

/** The owner, when an agent lets for them (PRD data model). */
export const landlords = pgTable(
  'landlords',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    createdAt: createdAt(),
  },
  () => [tenantPolicy()],
).enableRLS();

/** One home to let (R1). */
export const lettings = pgTable(
  'lettings',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    landlordId: uuid().references(() => landlords.id),
    addressLine1: text().notNull(),
    addressLine2: text(),
    area: text().notNull(),
    county: text().notNull(),
    eircode: text(),
    /**
     * M38, M125: where the home is, as the lister placed its pin. A private landlord's home is
     * personal data: renters see it within about 150 metres (`publicPoint`), it never goes into
     * an event or a log, and no address or geocoding service is asked for it. Null until the
     * pin is placed: the home is in the list, but not on the map.
     */
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    /** M125: where the point came from. Null: there is none. */
    pointSource: text({ enum: pointSources }),
    /** When the lister last placed or moved the pin. */
    pointSetAt: timestamp({ withTimezone: true }),
    monthlyRentCents: integer().notNull(),
    availableFrom: date({ mode: 'string' }).notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    /** UX-LT-14: bathrooms, furnishing and the BER are offered, not required. Null: not said. */
    bathrooms: integer(),
    furnished: text(),
    berRating: text(),
    parking: text(),
    /** UX-LS-6: the home in the lister's own words. Screened for protected grounds (rule 3). */
    description: text(),
    /** Before the redesign: a link to photos kept elsewhere. Photos are uploaded now (UX-LT-10). */
    photosUrl: text(),
    daftUrl: text(),
    myhomeUrl: text(),
    /** R2: the operator's criteria, from the fixed list only (null until set). */
    criteria: jsonb().$type<Criteria>(),
    criteriaSetAt: timestamp({ withTimezone: true }),
    /**
     * UX-MT-5 (Q36): the one house rule. A term of the tenancy, shown to renters. It is kept
     * apart from the criteria on purpose: ranking reads the criteria, and never this.
     */
    noSmokingIndoors: boolean().notNull().default(false),
    /**
     * UX-LT-21: "On gaff.ie". On unless the lister switches it off at go-live or later. The
     * public page that reads it is work package WP-20.
     */
    onGaff: boolean().notNull().default(true),
    /**
     * UX-LS-11: the home's public page is at `/homes/<publicRef>`: twelve random hex characters,
     * given when the letting is made and never changed. Not the letting's ID, and it names no
     * home and no person (`PUBLIC_REF` in src/domain/homes/home-page.ts).
     */
    publicRef: text()
      .notNull()
      .unique()
      .default(sql`substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`),
    /** UX-LS-10: when the home was let: at the accepted offer, or closed as let. */
    letAt: timestamp({ withTimezone: true }),
    /**
     * UX-LS-10: when the scheduled job took a let home's page down, 30 days after it was let
     * (`endLetHomePages`). Until then the page says "This home has been let".
     */
    pageRemovedAt: timestamp({ withTimezone: true }),
    /**
     * UX-TS-4, BA-9: when the listing was hidden after reports (src/server/trust): by a person
     * on Gaff's team, or by the rules on strong signs of a scam until a person looks. A hidden
     * home has no page and isn't in search, and its enquiries wait: no first reply and no
     * answer goes until it's back.
     */
    hiddenAt: timestamp({ withTimezone: true }),
    /** UX-TS-4: why, as the lister is told it: one of the four reasons a report can give. */
    hiddenReason: text({ enum: reportReasons }),
    /**
     * BA-9 (M97, M98): where a hidden listing stands, as its lister sees it: held by the rules,
     * decided by a person, appealed, or final. Null while it isn't hidden. Gaff's cases
     * themselves are Gaff's own record (`listing_cases`), which no operator can read.
     */
    hiddenStage: text({ enum: hiddenStages }),
    /**
     * BA-10 (M29): what took it off: a report (or null, as before), or the checks a home passes
     * as it goes public (`check`), which held it for a person on Gaff's team.
     */
    hiddenAfter: text({ enum: ['report', 'check'] }),
    /**
     * BA-10 (M48): when the checks last looked at the whole home while it was public, or as it
     * went public. Null: never; the next change to a public home looks at all of it.
     */
    screenedAt: timestamp({ withTimezone: true }),
    /** UX-TS-4, BA-9: when the lister asked Gaff's team to look again (appealed). */
    lookAgainAskedAt: timestamp({ withTimezone: true }),
    /**
     * M49 (BA-13): a live home stays fresh. When the lister last said "Still available" (from
     * Today, the letting, or the email's signed link). The clock is the latest of this, going
     * live and their last change (`src/server/lettings/freshness.ts`).
     */
    confirmedAvailableAt: timestamp({ withTimezone: true }),
    /** M49: when the lister was last asked to confirm. An ask before the clock restarted is answered. */
    freshnessAskedAt: timestamp({ withTimezone: true }),
    /**
     * M49: when an unanswered home stepped back from Gaff's public pages and search. Until the
     * lister confirms it has no page, isn't in search, and its enquiries wait, as a hidden home's
     * do. Null while it's fresh.
     */
    staleAt: timestamp({ withTimezone: true }),
    /**
     * "Is it advertised anywhere else?", asked once after go-live: the portals named, an empty
     * list for "No", null until it's answered. A home on Daft or MyHome asks for forwarding
     * until mail comes through (UX-LT-20).
     */
    advertisedOn: jsonb().$type<Portal[]>(),
    /** UX-FL-2: the furthest step of adding it that was reached, to come back to. */
    setupStep: text({ enum: flowSteps }),
    /**
     * BA-15 (M33, M35): a home of a development, made from one of its types. Null for a home
     * added on its own. The home takes the development's and the type's shared values, except
     * those the lister changed by hand on it (`ownValues`).
     */
    developmentId: uuid().references(() => developments.id),
    unitTypeId: uuid().references(() => unitTypes.id),
    /** Its number or door ("Apartment 12"), and its floor (0 is the ground floor). */
    unitLabel: text(),
    unitFloor: integer(),
    /**
     * The shared values (`sharedFields`) a lister changed by hand on this home. A change on the
     * development or the type never reaches them.
     */
    ownValues: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** UX-LT-23: the letting this one was started from by "Let it again". */
    previousLettingId: uuid().references((): AnyPgColumn => lettings.id),
    stage: lettingStage().notNull().default('setup'),
    status: lettingStatus().notNull().default('draft'),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    /**
     * UX-AG-9: the member responsible for the letting: whoever added it, until someone changes
     * it. A member who leaves or is removed hands each letting they lead to someone who stays
     * (UX-AG-15), so a letting always has one.
     */
    leadUserId: text()
      .notNull()
      .references(() => users.id),
    liveAt: timestamp({ withTimezone: true }),
    /**
     * UX-AG-4: a person decided to put the home live while their agency was being confirmed.
     * The decision is theirs and is recorded; the home goes live when the agency is confirmed.
     */
    goLiveHeldAt: timestamp({ withTimezone: true }),
    goLiveDecisionId: uuid(),
    /** R26: when a person closed it, as let or withdrawn. Deletion dates count from here. */
    closedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('lettings_organisation_idx').on(t.organisationId, t.status),
    index('lettings_unit_type_idx').on(t.unitTypeId),
    // M125: a point is whole or absent, and in Ireland.
    check(
      'lettings_point_whole',
      sql`(${t.latitude} is null) = (${t.longitude} is null) and (${t.latitude} is null) = (${t.pointSource} is null)`,
    ),
    check(
      'lettings_point_in_ireland',
      sql`${t.latitude} is null or (${t.latitude} between 51.3 and 55.5 and ${t.longitude} between -10.7 and -5.3)`,
    ),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * UX-AG-8 (section 2's permissions table): an agent who tapped "Help with this letting" on a
 * letting someone else leads, so they can act on it. The record shows who did what. Removed
 * when they leave the team.
 */
export const lettingHelpers = pgTable(
  'letting_helpers',
  {
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.lettingId, t.userId] }), tenantPolicy()],
).enableRLS();

/**
 * UX-FL-2, UX-LT-5: a home being added, before it has what a letting can't exist without (an
 * address, a rent, a date, a type and a bedroom count). It holds the answers so far, so the
 * person can leave and come back, and so a draft can arrive filled in: from an advert (WP-10),
 * an enquiry, or the letting before. When the last of those answers is in, the letting is made
 * WITH THE SAME ID and the draft row is deleted. Facts about a home only: nothing about a person.
 */
export const lettingDrafts = pgTable(
  'letting_drafts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    origin: text({ enum: draftOrigins }).notNull().default('manual'),
    answers: jsonb().$type<DraftAnswers>().notNull().default({}),
    /** Where to come back to: the review, or a step. Null: the first step. */
    step: text({ enum: ['review', ...flowSteps] }),
    /** UX-LT-23: the letting "Let it again" was pressed on. */
    previousLettingId: uuid().references(() => lettings.id),
    /**
     * UX-LT-3, UX-AI-4: for a home that was read from an advert or an enquiry, the words each
     * value came from, what to check and the lines left out. The lister's own words about a
     * home, with names and contact details taken out first. It goes with the draft.
     */
    reading: jsonb().$type<DraftReading>(),
    /**
     * UX-LT-16: the enquiry the home was started from. It is attached to the letting, as that
     * renter's enquiry, the moment the draft becomes one.
     */
    inboundEmailId: uuid().references((): AnyPgColumn => inboundEmails.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('letting_drafts_organisation_idx').on(t.organisationId),
    index('letting_drafts_inbound_email_idx').on(t.inboundEmailId),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * UX-LT-10: a home's photos, in the lister's order; the first is the cover. The picture itself
 * is in the photo store (src/ports/photo-store.ts) under `storageKey`: Gaff's own copy, with no
 * location or camera data. A photo belongs to a letting, or to a draft until it becomes one.
 */
export const lettingPhotos = pgTable(
  'letting_photos',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid().references(() => lettings.id, { onDelete: 'cascade' }),
    draftId: uuid().references(() => lettingDrafts.id, { onDelete: 'cascade' }),
    /**
     * BA-15: a development's shared photos, and a type's own photos and floor plan. A home of
     * the type shows a copy of each (`sharedFromId`) until its lister changes its photos by
     * hand. The copies share the picture in the store, which stays while any row uses it.
     */
    developmentId: uuid().references(() => developments.id, { onDelete: 'cascade' }),
    unitTypeId: uuid().references(() => unitTypes.id, { onDelete: 'cascade' }),
    sharedFromId: uuid().references((): AnyPgColumn => lettingPhotos.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    /**
     * M43: the folder of the photo's fixed sizes (`photoFolder`), or, for a photo kept before
     * the pipeline, its one file (`widths` is empty).
     */
    storageKey: text().notNull(),
    contentType: text().notNull(),
    bytes: integer().notNull(),
    /** M44: a photo, or a floor plan, shown after the photos and never the cover. */
    kind: text({ enum: photoKinds }).notNull().default('photo'),
    /** M43: upright, in pixels. */
    width: integer(),
    height: integer(),
    /** M43: the fixed widths kept (`PHOTO_WIDTHS`). Empty for a photo kept as one file. */
    widths: integer()
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    /** M29: a 64-bit difference hash, to spot the same picture on another home (a later check). */
    phash: bigint({ mode: 'bigint' }),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('letting_photos_letting_idx').on(t.lettingId, t.position),
    index('letting_photos_draft_idx').on(t.draftId, t.position),
    index('letting_photos_development_idx').on(t.developmentId, t.position),
    index('letting_photos_unit_type_idx').on(t.unitTypeId, t.position),
    check(
      'letting_photos_one_home',
      sql`num_nonnulls(${t.lettingId}, ${t.draftId}, ${t.developmentId}, ${t.unitTypeId}) = 1`,
    ),
    check('letting_photos_kind', sql`${t.kind} in ('photo', 'floor_plan')`),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * Facts the AI may answer from (R8), beyond the structured fields on the letting: lines
 * from set-up, and operator answers to renters' questions. Screened for protected grounds.
 */
export const lettingFacts = pgTable(
  'letting_facts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    question: text(),
    answer: text().notNull(),
    source: text({ enum: ['setup', 'operator_answer'] }).notNull(),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
    retiredAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('letting_facts_letting_idx').on(t.lettingId), tenantPolicy()],
).enableRLS();

/** A viewing session: back-to-back slots, or one capped group viewing (R1, R12). */
export const viewingSessions = pgTable(
  'viewing_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    kind: viewingKind().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    slotMinutes: integer(),
    capacity: integer(),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('viewing_sessions_letting_idx').on(t.lettingId, t.startsAt), tenantPolicy()],
).enableRLS();

export const viewingSlots = pgTable(
  'viewing_slots',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    sessionId: uuid()
      .notNull()
      .references(() => viewingSessions.id, { onDelete: 'cascade' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    capacity: integer().notNull(),
  },
  (t) => [index('viewing_slots_letting_idx').on(t.lettingId, t.startsAt), tenantPolicy()],
).enableRLS();

/** R3: the rent check for a letting (one per letting; re-checking replaces it). */
export const rentChecks = pgTable(
  'rent_checks',
  {
    lettingId: uuid()
      .primaryKey()
      .references(() => lettings.id),
    organisationId: organisationId(),
    lastLet: text({ enum: ['never', 'before_new_rules', 'under_new_rules'] }).notNull(),
    ending: text(),
    substantialChange: boolean().notNull().default(false),
    previousRentCents: integer(),
    previousRentSetOn: date({ mode: 'string' }),
    result: text({ enum: ['market', 'capped', 'get_advice'] }).notNull(),
    reason: text().notNull(),
    rulesVersion: text().notNull(),
    checkedBy: text()
      .notNull()
      .references(() => users.id),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantPolicy()],
).enableRLS();

/** R4: three comparable rents from the RTB Rent Register (area only, not addresses). */
export const rentComparables = pgTable(
  'rent_comparables',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    position: integer().notNull(),
    area: text().notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    monthlyRentCents: integer().notNull(),
    registeredOn: date({ mode: 'string' }),
    addedBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('rent_comparables_letting_idx').on(t.lettingId, t.position), tenantPolicy()],
).enableRLS();

/**
 * M92 (BA-13): a lister's numbers for one home, by Irish day: how many times its page on Gaff
 * was opened (from the page's own beacon) and how many times it was saved. Counts only: nothing
 * about who, no cookies and no visitor hash. Enquiries are counted from the letting's own
 * applications. Rule 9: the nightly job deletes a day after 13 months (`HOME_COUNT_KEEP_DAYS`).
 */
export const lettingDailyCounts = pgTable(
  'letting_daily_counts',
  {
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    opened: integer().notNull().default(0),
    saved: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.lettingId, t.day] }), tenantPolicy()],
).enableRLS();

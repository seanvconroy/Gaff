import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Criteria } from '@/domain/criteria/criteria';
import { stages } from '@/domain/lettings/stages';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { homes } from './homes';
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
    /** ADR-0018: the home this letting lets. The letting keeps its own copy of the facts below. */
    homeId: uuid()
      .notNull()
      .references(() => homes.id),
    landlordId: uuid().references(() => landlords.id),
    addressLine1: text().notNull(),
    addressLine2: text(),
    area: text().notNull(),
    county: text().notNull(),
    eircode: text(),
    monthlyRentCents: integer().notNull(),
    availableFrom: date({ mode: 'string' }).notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    bathrooms: integer().notNull(),
    furnished: text().notNull(),
    berRating: text().notNull(),
    parking: text(),
    photosUrl: text(),
    daftUrl: text(),
    myhomeUrl: text(),
    /** M39: the deposit asked for, capped at one month's rent (rule 4). Set when listing. */
    depositCents: integer(),
    /** M52: enquiries close at this count or time, set in advance and the same for everyone. */
    enquiryLimit: integer(),
    enquiriesCloseAt: timestamp({ withTimezone: true }),
    /** R2: the operator's criteria, from the fixed list only (null until set). */
    criteria: jsonb().$type<Criteria>(),
    criteriaSetAt: timestamp({ withTimezone: true }),
    stage: lettingStage().notNull().default('setup'),
    status: lettingStatus().notNull().default('draft'),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    liveAt: timestamp({ withTimezone: true }),
    /** R26: when a person closed it, as let or withdrawn. Deletion dates count from here. */
    closedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('lettings_organisation_idx').on(t.organisationId, t.status), tenantPolicy()],
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

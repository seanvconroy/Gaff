import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { listingStatuses, publicStatuses } from '@/domain/listings/lifecycle';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import type { PublicViewing } from '@/domain/listings/projection';
import { users } from './auth';
import { createdAt, publicReadPolicy, staffReviewPolicy, tenantPolicy, updatedAt } from './columns';
import { developments, homes } from './homes';
import { lettings } from './lettings';
import { organisations } from './organisations';

const organisationId = () =>
  uuid()
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' });

/** A letting's public advert: one per letting (ADR-0018, M48 to M50). */
export const listings = pgTable(
  'listings',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .unique()
      .references(() => lettings.id),
    homeId: uuid()
      .notNull()
      .references(() => homes.id),
    status: text({ enum: listingStatuses }).notNull().default('draft'),
    /** Given at first publish, from the address the letter chose to show. */
    slug: text().unique(),
    description: text(),
    descriptionSource: text({ enum: ['letter', 'ai_draft'] }),
    /** M44: a video or virtual tour, from an allow-listed host. */
    tourUrl: text(),
    /** M49: when the letter was last asked to confirm the home is still available. */
    reminderSentAt: timestamp({ withTimezone: true }),
    /** M16: the agent who handles it. */
    assignedTo: text().references(() => users.id),
    publishedAt: timestamp({ withTimezone: true }),
    /** M49: when the letter last confirmed it's still available. */
    confirmedAt: timestamp({ withTimezone: true }),
    pausedAt: timestamp({ withTimezone: true }),
    pauseReason: text({ enum: ['letter', 'freshness', 'review'] }),
    closedAt: timestamp({ withTimezone: true }),
    revision: integer().notNull().default(0),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('listings_organisation_idx').on(t.organisationId, t.status), tenantPolicy()],
).enableRLS();

/** What was published, and when: a snapshot at each publish or edit (M51, the DSA record). */
export const listingRevisions = pgTable(
  'listing_revisions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    revision: integer().notNull(),
    content: jsonb().$type<Record<string, unknown>>().notNull(),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('listing_revisions_listing_revision').on(t.listingId, t.revision), tenantPolicy()],
).enableRLS();

/**
 * The public zone (ADR-0017): exactly what renters see of a published listing, written in the
 * same transaction as the change it reflects. Every column is on the allow-list in
 * tests/integration/m1-zones.test.ts; personal data never belongs here.
 */
export const publicListings = pgTable(
  'public_listings',
  {
    listingId: uuid()
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    organisationId: organisationId(),
    slug: text().notNull().unique(),
    status: text({ enum: publicStatuses }).notNull(),
    title: text().notNull(),
    addressShown: text().notNull(),
    area: text().notNull(),
    county: text().notNull(),
    routingKey: text(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    /** M125: false while the point is only the centre of the home's area: off the map, in the list. */
    onMap: boolean().notNull().default(false),
    rentCents: integer().notNull(),
    depositCents: integer().notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    bathrooms: integer().notNull(),
    furnished: text().notNull(),
    availableFrom: date({ mode: 'string' }).notNull(),
    berLabel: text().notNull(),
    berBand: text(),
    petsConsidered: boolean().notNull(),
    /** Heating, parking, outdoor space, accessibility and the rest, as the card and page show them. */
    facts: jsonb().$type<Record<string, unknown>>().notNull(),
    /** M68: the letter's criteria in plain words. */
    criteria: jsonb().$type<string[]>().notNull(),
    /** M76: which of the fixed questions the enquiry sheet asks (codes only). */
    questions: jsonb().$type<CriterionQuestion[]>().notNull().default([]),
    photos: jsonb().$type<Array<Record<string, unknown>>>().notNull(),
    /** M70: the letter card: kind, the names the letter chose to show, badges, licence numbers. */
    letter: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Written by the letter and checked before it goes live (M45, M46). */
    description: text().notNull().default(''),
    tourUrl: text(),
    developmentId: uuid().references(() => developments.id),
    publishedAt: timestamp({ withTimezone: true }).notNull(),
    confirmedAt: timestamp({ withTimezone: true }).notNull(),
    enquiriesCloseAt: timestamp({ withTimezone: true }),
    completeness: smallint().notNull().default(0),
    /** M47, M69: the letting's viewing times, so the page can show the next ones. */
    viewings: jsonb().$type<PublicViewing[]>().notNull().default([]),
    /** M74: when the home was let or withdrawn. Its page says so for 90 days, then goes. */
    closedAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('public_listings_search_idx').on(t.status, t.county, t.rentCents),
    index('public_listings_live_idx')
      .on(t.county, t.rentCents)
      .where(sql`status = 'live'`),
    index('public_listings_location_idx').on(t.latitude, t.longitude),
    index('public_listings_routing_key_idx').on(t.routingKey),
    tenantPolicy(),
    publicReadPolicy(),
  ],
).enableRLS();

/** M25: what a letter declared about a home before it first went live, and when. */
export const declarations = pgTable(
  'declarations',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    homeId: uuid()
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    declaredBy: text()
      .notNull()
      .references(() => users.id),
    wordingVersion: text().notNull(),
    declaredAt: createdAt(),
  },
  (t) => [index('declarations_home_idx').on(t.homeId), tenantPolicy()],
).enableRLS();

/** M29, M48: a listing held for a person at Gaff, and why (reason codes only). */
export const listingHolds = pgTable(
  'listing_holds',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    reasons: text().array().notNull(),
    /**
     * ADR-0023, P13: for an unfair-wording hold, what the AI flagged: the phrase from the
     * letter's own words, the ground, why, and a fairer rewording. Shown to the letter and to staff.
     */
    wordingFindings:
      jsonb().$type<Array<{ phrase: string; ground: string; why: string; rewording: string }>>(),
    openedAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: text().references(() => users.id),
    outcome: text({ enum: ['released', 'removed'] }),
  },
  (t) => [
    index('listing_holds_open_idx').on(t.resolvedAt, t.openedAt),
    tenantPolicy(),
    staffReviewPolicy(),
  ],
).enableRLS();

/**
 * M75 (ADR-0017): what renters see of a published development. An allow-list of columns,
 * written in the same transaction as the change (tests/integration/m1-zones.test.ts).
 */
export const publicDevelopments = pgTable(
  'public_developments',
  {
    developmentId: uuid()
      .primaryKey()
      .references(() => developments.id, { onDelete: 'cascade' }),
    organisationId: organisationId(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    area: text().notNull(),
    county: text().notNull(),
    routingKey: text(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    description: text().notNull(),
    amenities: text().array().notNull(),
    photos: jsonb().$type<Array<Record<string, unknown>>>().notNull(),
    /** The operator: the agency's or landlord's public name and badges (M70). */
    operator: jsonb().$type<Record<string, unknown>>().notNull(),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy(), publicReadPolicy()],
).enableRLS();

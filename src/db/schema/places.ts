import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { landmarkKinds, placeKinds } from '@/domain/places/gazetteer';
import {
  createdAt,
  publicReadPolicy,
  renterPolicy,
  staffZonePolicy,
  systemWritePolicy,
} from './columns';
import { users } from './auth';

export const placeKind = pgEnum('place_kind', placeKinds);
export const landmarkKind = pgEnum('landmark_kind', landmarkKinds);

/**
 * M56 (ADR-0025): the place index, built from open data (OpenStreetMap, Tailte Éireann, the
 * CSO, the NTA) by `scripts/places`. Reference data: anyone may read it; only system jobs, such
 * as `pnpm places:load`, write it. `search_text` is already normalised (no fadas, lower case),
 * so the trigram index needs no unaccent().
 */
export const places = pgTable(
  'places',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    kind: placeKind().notNull(),
    landmarkKind: landmarkKind(),
    name: text().notNull(),
    irishName: text(),
    aliases: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Shown under the name: "Rathgar, Dublin 6". */
    context: text(),
    county: text().notNull(),
    routingKey: text(),
    centreLat: doublePrecision().notNull(),
    centreLng: doublePrecision().notNull(),
    minLat: doublePrecision(),
    minLng: doublePrecision(),
    maxLat: doublePrecision(),
    maxLng: doublePrecision(),
    /** Streets: runs of [lat, lng] points, simplified. */
    line: jsonb().$type<Array<Array<[number, number]>>>(),
    radiusMetres: integer().notNull(),
    population: integer(),
    /** M121: live homes in the place, refreshed by a job. */
    liveHomes: integer().notNull().default(0),
    /** Counties, cities, towns, villages, districts and areas have an area page (M62). */
    hasPage: boolean().notNull(),
    searchText: text().notNull(),
    source: text().notNull(),
    sourceId: text(),
    /** The index build that loaded the row. */
    version: integer().notNull(),
  },
  (t) => [
    index('places_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('places_search_prefix_idx').using('btree', t.searchText.op('text_pattern_ops')),
    index('places_page_idx').on(t.hasPage),
    publicReadPolicy(),
    systemWritePolicy(),
  ],
).enableRLS();

/**
 * M124: what renters typed that found no place, counted by day so the index can be improved.
 * Never anything with a digit (no house numbers or Eircodes), never over 40 characters, and no
 * user, device or address. Staff zone; deleted after 30 days.
 */
export const placeMisses = pgTable(
  'place_misses',
  {
    day: date({ mode: 'string' }).notNull(),
    text: text().notNull(),
    count: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.day, t.text] }), staffZonePolicy()],
).enableRLS();

/**
 * M114: a signed-in renter's last few searches, in their own zone, deleted with their account.
 * The same address a saved search holds: a place's path and the canonical query.
 */
export const recentSearches = pgTable(
  'recent_searches',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    areaPath: text().notNull(),
    query: text().notNull().default(''),
    label: text().notNull(),
    searchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.areaPath, t.query] }),
    index('recent_searches_user_idx').on(t.userId, t.searchedAt),
    renterPolicy(),
  ],
).enableRLS();

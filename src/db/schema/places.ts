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
  uuid,
} from 'drizzle-orm/pg-core';
import { landmarkKinds, placeKinds } from '@/domain/places/gazetteer';

export const placeKind = pgEnum('place_kind', placeKinds);
export const landmarkKind = pgEnum('landmark_kind', landmarkKinds);

/**
 * M56 (ADR-0017): Gaff's own place index, built from OpenStreetMap by `scripts/places` around
 * the curated base (src/domain/places/curated.ts), and loaded by `pnpm places:load`. Reference
 * data, the same for everyone, like the PSRA register: it has no organisation and no person,
 * and holds only places. `search_text` is already normalised (no fadas, lower case), so the
 * trigram index needs no unaccent().
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
    /** Counties, cities, towns, villages, districts and areas: a search can be "in" them. */
    isArea: boolean().notNull(),
    searchText: text().notNull(),
    /** `gaff` (the curated base), `osm` (OpenStreetMap) or `fixture` (tests). */
    source: text().notNull(),
    sourceId: text(),
    /** The index build that loaded the row. */
    version: integer().notNull(),
  },
  (t) => [
    index('places_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('places_search_prefix_idx').using('btree', t.searchText.op('text_pattern_ops')),
    index('places_area_idx').on(t.isArea),
  ],
);

/**
 * M124: what renters typed in the place search that found no place, counted by day so the index
 * can be improved. Never anything with a digit (no house numbers or Eircodes), never over 40
 * characters, and no person, device or address. The nightly retention job deletes a row after
 * 30 days.
 */
export const placeMisses = pgTable(
  'place_misses',
  {
    day: date({ mode: 'string' }).notNull(),
    text: text().notNull(),
    count: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.day, t.text] })],
);

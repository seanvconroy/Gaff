import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { pointSources } from '@/domain/map/pin';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { organisations } from './organisations';

const organisationId = () =>
  uuid()
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' });

/** Twelve random hex characters, like a home's public reference (UX-LS-11). */
const randomRef = () =>
  text()
    .notNull()
    .unique()
    .default(sql`substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`);

/**
 * BA-15 (M32, M75): a scheme of homes under one name, belonging to an agency or a landlord's
 * team (never a private landlord's own homes). Its homes are ordinary lettings that take its
 * shared values (src/domain/developments/development.ts). Facts about homes only.
 */
export const developments = pgTable(
  'developments',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    name: text().notNull(),
    /** The street address the homes share; each home adds its own number. Null until given. */
    addressLine1: text(),
    area: text(),
    county: text(),
    eircode: text(),
    /** M38: where the scheme is, as the lister placed its pin. Never looked up. */
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    pointSource: text({ enum: pointSources }),
    pointSetAt: timestamp({ withTimezone: true }),
    /** Shared facts, offered: as a home's, and passing the same checks. */
    parking: text(),
    description: text(),
    /**
     * M75: the development's public page is at `/developments/<publicRef>`: random, never its ID,
     * and it names no home and no person. It has a page while one of its homes has one.
     */
    publicRef: randomRef(),
    /** Where its set-up had got to, to come back to. */
    setupStep: text({ enum: ['address', 'pin', 'facts', 'photos', 'types'] }),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('developments_organisation_idx').on(t.organisationId),
    check(
      'developments_point_whole',
      sql`(${t.latitude} is null) = (${t.longitude} is null) and (${t.latitude} is null) = (${t.pointSource} is null)`,
    ),
    check(
      'developments_point_in_ireland',
      sql`${t.latitude} is null or (${t.latitude} between 51.3 and 55.5 and ${t.longitude} between -10.7 and -5.3)`,
    ),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * BA-15 (M33, M34): a kind of home in a development ("2-bed apartment, type B"): its rooms, floor
 * area, rent, its own photos and floor plan, and how many there are.
 */
export const unitTypes = pgTable(
  'unit_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    developmentId: uuid()
      .notNull()
      .references(() => developments.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    bathrooms: integer(),
    furnished: text(),
    berRating: text(),
    floorAreaSqm: integer(),
    /** The rent of each home of the type. Null until it's given. */
    monthlyRentCents: integer(),
    /** How many homes of the type there are: how many rows "Which homes are they?" asks for. */
    homeCount: integer(),
    /** M75: for the development's page, `#type-<publicRef>`. */
    publicRef: randomRef(),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('unit_types_development_idx').on(t.developmentId), tenantPolicy()],
).enableRLS();

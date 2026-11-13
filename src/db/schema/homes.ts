import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { organisations } from './organisations';

const organisationId = () =>
  uuid()
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' });

/** M32: a development groups homes under one name and operator (ADR-0018). */
export const developments = pgTable(
  'developments',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    addressLine1: text().notNull(),
    area: text().notNull(),
    county: text().notNull(),
    eircode: text(),
    routingKey: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    description: text(),
    amenities: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text({ enum: ['draft', 'live', 'archived'] })
      .notNull()
      .default('draft'),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('developments_organisation_idx').on(t.organisationId), tenantPolicy()],
).enableRLS();

/** M34, M36: a kind of home in a development: "2 bed apartment". */
export const unitTypes = pgTable(
  'unit_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    developmentId: uuid()
      .notNull()
      .references(() => developments.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    bathrooms: integer().notNull(),
    minFloorAreaSqm: integer(),
    maxFloorAreaSqm: integer(),
    createdAt: createdAt(),
  },
  (t) => [index('unit_types_development_idx').on(t.developmentId), tenantPolicy()],
).enableRLS();

/**
 * M31: a home is the lasting record, let many times (ADR-0018). Each letting keeps its own
 * copy of these facts as advertised. The Eircode is never public (M38).
 */
export const homes = pgTable(
  'homes',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    developmentId: uuid().references(() => developments.id),
    unitTypeId: uuid().references(() => unitTypes.id),
    addressLine1: text().notNull(),
    addressLine2: text(),
    area: text().notNull(),
    county: text().notNull(),
    eircode: text(),
    routingKey: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    /** M38: false shows renters only the street and area, and an approximate point. */
    showExactAddress: boolean().notNull().default(true),
    propertyType: text().notNull(),
    bedrooms: integer().notNull(),
    bathrooms: integer().notNull(),
    ensuites: integer(),
    floorAreaSqm: integer(),
    floor: integer(),
    hasLift: boolean(),
    /** M40: the rating, or "exempt"; the scale is null for an exempt home. */
    berScale: text({ enum: ['previous', 'new'] }),
    berRating: text().notNull(),
    berNumber: text(),
    berCertificateDate: date({ mode: 'string' }),
    berExemptReason: text({ enum: ['protected_structure', 'other'] }),
    heating: text(),
    parking: text(),
    outdoorSpace: text(),
    accessibility: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    appliances: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    broadband: text(),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('homes_organisation_idx').on(t.organisationId),
    index('homes_development_idx').on(t.developmentId),
    tenantPolicy(),
  ],
).enableRLS();

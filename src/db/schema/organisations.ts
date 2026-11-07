import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, updatedAt } from './columns';

export const organisationKind = pgEnum('organisation_kind', ['agency', 'landlord']);
export const memberRole = pgEnum('member_role', ['admin', 'negotiator']);

/** An agency or portfolio landlord: the operator that pays (PRD data model). */
export const organisations = pgTable('organisations', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: organisationKind().notNull(),
  psraLicenceNumber: text(),
  /** Local part of the organisation's Gaff address, e.g. "halcyon" → halcyon@in.gaff.ie (R5). */
  inboundSlug: text().notNull().unique(),
  /** R29: AI-written messages wait for a person's approval. On for every new organisation. */
  approveBeforeSend: boolean().notNull().default(true),
  sendingDomain: text(),
  sendingDomainVerifiedAt: timestamp({ withTimezone: true }),
  /** R16, R17: take-home income at least this many tenths of the rent (25 = 2.5 times). */
  incomeRuleTenths: integer().notNull().default(25),
  /** R23: where the deposit and first month's rent are paid: the operator's own account. */
  paymentAccountName: text(),
  paymentIban: text(),
  /** M17: the public profile. The legal name is the one on the PSRA register (agencies). */
  legalName: text(),
  /** M17: the agency's public page, /agencies/[slug]. */
  slug: text().unique(),
  officeAddress: text(),
  publicPhone: text(),
  website: text(),
  about: text(),
  logoMediaId: uuid(),
  /** Pilot baselines from the interviews, for time and days saved (R28). */
  baselineMinutesPerLetting: integer(),
  baselineDaysToLet: integer(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole().notNull(),
    /** M18: the agent's public details, shown on the listings they handle. */
    displayName: text(),
    photoMediaId: uuid(),
    psraLicenceNumber: text(),
    showPhone: boolean().notNull().default(false),
    publicPhone: text(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organisationId, t.userId] }),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

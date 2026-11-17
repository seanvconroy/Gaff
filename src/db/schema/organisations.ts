import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, ownRowPolicy, tenantPolicy, updatedAt } from './columns';
import { psraRegister } from './register';

/**
 * Who an organisation is (ADR-0016):
 * - `agency`: a business that lets homes for their owners, under a PSRA licence;
 * - `landlord`: a landlord's team, letting their own homes with help (UX-AG-10);
 * - `private_landlord`: one person letting their own homes. It is made silently, has no name of
 *   its own and no settings page, and its one member is its admin (UX-AC-4).
 */
export const organisationKind = pgEnum('organisation_kind', [
  'agency',
  'landlord',
  'private_landlord',
]);
export const memberRole = pgEnum('member_role', ['admin', 'negotiator']);

/** Whoever lets homes: an agency, a landlord's team, or one private landlord (ADR-0016). */
export const organisations = pgTable(
  'organisations',
  {
    id: uuid().primaryKey().defaultRandom(),
    /**
     * The name renters see. An agency's trading or registered name; for a private landlord,
     * their first name until they're asked what renters should call them (UX-AC-9).
     */
    name: text().notNull(),
    kind: organisationKind().notNull(),
    /** An agency's licence number, copied from its entry in the register (UX-AG-7). */
    psraLicenceNumber: text(),
    /** UX-AG-1: the agency's entry in Gaff's copy of the PSRA register. */
    psraRegisterEntryId: uuid().references(() => psraRegister.id),
    /**
     * UX-AG-4, Q32: when someone at Gaff confirmed that the agency's first admin works there, or
     * when a founder created the agency for a pilot (UX-AG-5). Null: "being confirmed".
     */
    confirmedAt: timestamp({ withTimezone: true }),
    /** Who at Gaff confirmed it. */
    confirmedBy: text().references(() => users.id),
    /** UX-AG-6: when the weekly check found the licence gone from the register. */
    licenceLapsedAt: timestamp({ withTimezone: true }),
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
    /**
     * Q43: a number renters can call, for anyone who'd rather ring. The lister's own: an
     * agency's office, or a private landlord's (so it is personal data: never in an event, a
     * log or a web address). Offered at the first go-live; "Talk to a person" shows it.
     */
    phone: text(),
    /**
     * UX-LT-19, UX-LT-20: when mail first came through the organisation's forwarding rule: the
     * test enquiry coming back, or an enquiry from Daft or MyHome. Null: forwarding is still to
     * do. One rule in the operator's mailbox covers every home, so it is kept here, not on each
     * letting. Known only from what arrived: Gaff never looks into anyone's mail settings.
     */
    forwardingWorksAt: timestamp({ withTimezone: true }),
    /**
     * UX-LT-19: the latest test enquiry Gaff emailed to the person's mailbox, by its reference
     * (random, no one's personal data), when it went, and when it came back through the rule.
     * The address it went to is not kept.
     */
    forwardingTestRef: text(),
    forwardingTestSentAt: timestamp({ withTimezone: true }),
    forwardingTestArrivedAt: timestamp({ withTimezone: true }),
    /** Pilot baselines from the interviews, for time and days saved (R28). */
    baselineMinutesPerLetting: integer(),
    baselineDaysToLet: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One confirmed agency per licence. A claim nobody has confirmed proves nothing (Q32), so
    // it holds nothing: the real agency can still claim its own entry.
    uniqueIndex('organisations_confirmed_register_entry_idx')
      .on(t.psraRegisterEntryId)
      .where(sql`${t.confirmedAt} is not null`),
  ],
);

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
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organisationId, t.userId] }),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

/**
 * UX-AG-5, UX-AG-11, UX-AG-12: an invitation to join an organisation, by email address: from a
 * founder to a pilot agency's first admin, or from an admin to a colleague. The person who signs
 * in with that address, verified, joins with no questions. The row is deleted when it's
 * accepted or cancelled, and by the retention job once it has expired (rule 9).
 *
 * The link in the email names the invite and carries a signature over its ID and `sentAt`
 * (src/server/team/invite-links.ts), so nothing secret is stored, and sending it again makes
 * the old link stop working.
 */
export const organisationInvites = pgTable(
  'organisation_invites',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** The invited address, in lower case. */
    email: text().notNull(),
    role: memberRole().notNull(),
    invitedBy: text().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** UX-AG-12: when it was last sent: "Invited · sent today". "Send again" moves it on. */
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** UX-AG-12: an invite lasts seven days from when it was last sent. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('organisation_invites_org_email_idx').on(t.organisationId, t.email),
    index('organisation_invites_email_idx').on(t.email),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * UX-AG-3: someone asked to join an agency that is already on Gaff. The request is the agency's
 * admins' to answer, on Team (src/server/team/join-requests.ts). Answered, the row is deleted:
 * the record keeps the answer, with IDs only, and the person is told by email. A person turned
 * down can ask again later.
 */
export const joinRequests = pgTable(
  'join_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('join_requests_org_user_idx').on(t.organisationId, t.userId),
    index('join_requests_user_idx').on(t.userId),
    tenantPolicy(),
    ownRowPolicy(),
  ],
).enableRLS();

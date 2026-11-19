import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { reportReasons } from '@/domain/homes/report';
import { caseDecisions, caseFacts, caseKinds } from '@/domain/trust/cases';
import { users } from './auth';
import { lettings } from './lettings';

const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

const systemPolicy = (name: string) =>
  pgPolicy(name, { as: 'permissive', for: 'all', using: systemOnly, withCheck: systemOnly });

/**
 * BA-9 (M97, M98, M106): a case about a listing, for Gaff's own team. Reports open or join one;
 * the lister asking Gaff to look again opens an appeal, which a different person decides. It
 * is about a listing, never about a person. Gaff's own record, not the lister's: it has no
 * organisation, and only withSystem() can reach it.
 *
 * It holds the listing, why it was opened, when it's due, whether the rules hid the listing at
 * once on strong signs of a scam, and a person's decision: no action, or hidden, with one of
 * the four reasons and the fixed facts it relies on (the statement of reasons the lister is
 * sent). The retention job deletes it, with its reports, at `deleteAfter`: six months after it
 * was decided (`REPORT_KEPT_DAYS`).
 */
export const listingCases = pgTable(
  'listing_cases',
  {
    id: uuid().primaryKey().defaultRandom(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    kind: text({ enum: caseKinds }).notNull(),
    /** The reasons its reports gave, each once. An appeal carries those of the case it appeals. */
    reasons: text({ enum: reportReasons }).array().notNull(),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** M97: 4 working hours for a suspected scam, 1 working day otherwise. */
    dueBy: timestamp({ withTimezone: true }).notNull(),
    /** M97: when the rules hid the listing on strong signs of a scam, before a person looked. */
    heldAt: timestamp({ withTimezone: true }),
    /** M98: the case an appeal is about. */
    appealOf: uuid().references((): AnyPgColumn => listingCases.id, { onDelete: 'cascade' }),
    /** Null while it's open. */
    decision: text({ enum: caseDecisions }),
    /** With a decision to hide: why, as the lister is told it. */
    decisionReason: text({ enum: reportReasons }),
    /** With a decision to hide: what it relies on, from the fixed list. */
    decisionFacts: text({ enum: caseFacts }).array(),
    decidedAt: timestamp({ withTimezone: true }),
    /** The one of Gaff's team who decided it. */
    decidedBy: text().references(() => users.id, { onDelete: 'set null' }),
    deleteAfter: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index('listing_cases_open_idx').on(t.decision, t.dueBy),
    index('listing_cases_letting_idx').on(t.lettingId),
    index('listing_cases_appeal_idx').on(t.appealOf),
    check(
      'listing_cases_reasons_with_hiding',
      sql`(${t.decision} = 'hide_listing' and ${t.decisionReason} is not null and cardinality(${t.decisionFacts}) > 0)
        or (${t.decision} is distinct from 'hide_listing' and ${t.decisionReason} is null and ${t.decisionFacts} is null)`,
    ),
    check('listing_cases_appeal_has_case', sql`(${t.kind} = 'appeal') = (${t.appealOf} is not null)`),
    systemPolicy('listing_cases_system'),
  ],
).enableRLS();

/**
 * UX-TS-3, BA-9 (M96): "Report this listing". Part of a case, and Gaff's own record, for Gaff's
 * own team: not the lister's. It has no organisation, and only withSystem() can reach it, so no
 * operator's query can read a report about their home, or anything in it.
 *
 * It holds the home (the letting and its public reference), its case, the answer tapped, the
 * short note "Something else" asks for, and when it was sent. An email address only if the
 * visitor asked to hear the outcome: it is cleared once that email is sent, and goes with the
 * case at the latest. Nothing else about whoever sent it: no account, name, IP address or
 * device is ever stored. It is deleted with its case.
 */
export const listingReports = pgTable(
  'listing_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => listingCases.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id, { onDelete: 'cascade' }),
    /** The home's public reference, as the page the report came from showed it. */
    homeRef: text().notNull(),
    reason: text({ enum: reportReasons }).notNull(),
    /** Only with "Something else": the visitor's own few words, at most 500 characters. */
    note: text(),
    /** M96: where to send the outcome, if the visitor asked. Cleared once it's sent. */
    outcomeEmail: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('listing_reports_case_idx').on(t.caseId),
    index('listing_reports_letting_idx').on(t.lettingId),
    check(
      'listing_reports_note_only_for_something_else',
      sql`${t.note} is null or (${t.reason} = 'something_else' and char_length(${t.note}) <= 500)`,
    ),
    check(
      'listing_reports_outcome_email_short',
      sql`${t.outcomeEmail} is null or char_length(${t.outcomeEmail}) <= 254`,
    ),
    systemPolicy('listing_reports_system'),
  ],
).enableRLS();

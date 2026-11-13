import { index, pgTable, text, timestamp, uuid, date } from 'drizzle-orm/pg-core';
import { caseDecisions, decisionReasons, reportReasons } from '@/domain/moderation/reports';
import { users } from './auth';
import { createdAt, staffZonePolicy } from './columns';
import { listings } from './listings';
import { organisations } from './organisations';

/**
 * The staff zone (ADR-0017, ADR-0023): reports, cases and every decision on them. Letters never
 * read these (they'd learn who reported them); staff read them inside withStaff(). A person
 * decides every removal (M98), and each action is recorded with who and why (M106, M107).
 */

/** M96: a report about a listing. The reporter's email is optional, and deleted with it. */
export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => moderationCases.id, { onDelete: 'cascade' }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    reason: text({ enum: reportReasons }).notNull(),
    details: text(),
    reporterEmail: text(),
    reporterUserId: text().references(() => users.id, { onDelete: 'set null' }),
    /** For fair use only: a hash of the IP address with a key that changes daily. */
    reporterHash: text().notNull(),
    /** Q36 (proposed): 6 months after the case closes. */
    deleteAfter: date({ mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_case_idx').on(t.caseId),
    index('reports_hash_idx').on(t.reporterHash, t.createdAt),
    staffZonePolicy(),
  ],
).enableRLS();

/** M97, M106: one case per listing under review, from reports or an appeal. */
export const moderationCases = pgTable(
  'moderation_cases',
  {
    id: uuid().primaryKey().defaultRandom(),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    /** The organisation the listing belongs to. Not tenant data: letters never read cases. */
    subjectOrganisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    source: text({ enum: ['report', 'appeal'] }).notNull(),
    reasons: text().array().notNull(),
    status: text({ enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    dueBy: timestamp({ withTimezone: true }).notNull(),
    /** M98: the case this appeals, decided by someone else. */
    appealOf: uuid(),
    appealText: text(),
    decision: text({ enum: caseDecisions }),
    decisionReason: text({ enum: decisionReasons }),
    decidedBy: text().references(() => users.id),
    openedAt: createdAt(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('moderation_cases_open_idx').on(t.status, t.dueBy),
    index('moderation_cases_listing_idx').on(t.listingId),
    staffZonePolicy(),
  ],
).enableRLS();

/**
 * M98, M106, M107: the audit trail. Every action, automatic or by a person, with its reason, its
 * ground (law or policy), and the statement of reasons sent.
 */
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid().references(() => moderationCases.id, { onDelete: 'cascade' }),
    listingId: uuid().references(() => listings.id, { onDelete: 'cascade' }),
    subjectOrganisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    action: text({
      enum: [
        'pause_listing',
        'restore_listing',
        'remove_listing',
        'pause_account',
        'suspend_account',
        'restore_account',
        'no_action',
      ],
    }).notNull(),
    reason: text().notNull(),
    ground: text({ enum: ['law', 'policy'] }),
    /** The statement-of-reasons template and its version, when one was sent. */
    statementTemplate: text(),
    automatic: text({ enum: ['yes', 'no'] })
      .notNull()
      .default('no'),
    decidedBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('moderation_actions_case_idx').on(t.caseId), staffZonePolicy()],
).enableRLS();

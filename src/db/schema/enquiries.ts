import { sql } from 'drizzle-orm';
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { RenterAnswers } from '@/domain/criteria/answers';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { lettingFacts, lettings } from './lettings';
import { organisations } from './organisations';

const organisationId = () =>
  uuid()
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' });

/**
 * R5: every email received at a Gaff address, stored before anything else happens, so an
 * enquiry is never lost (PRD non-functional requirements). Personal data: deleted on schedule.
 */
export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    provider: text().notNull(),
    providerMessageId: text().notNull(),
    recipient: text().notNull(),
    fromAddress: text().notNull(),
    replyTo: text(),
    subject: text().notNull(),
    text: text().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    status: text({ enum: ['received', 'processed', 'needs_attention', 'ignored'] })
      .notNull()
      .default('received'),
    /** Why it needs attention, as a code, e.g. "not_an_enquiry" or "no_matching_letting". */
    problem: text(),
    lettingId: uuid().references(() => lettings.id),
    applicationId: uuid().references((): AnyPgColumn => applications.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('inbound_emails_provider_message_idx').on(
      t.organisationId,
      t.provider,
      t.providerMessageId,
    ),
    index('inbound_emails_status_idx').on(t.organisationId, t.status),
    tenantPolicy(),
  ],
).enableRLS();

export const applicationStatus = pgEnum('application_status', [
  'enquired',
  'invited',
  'waitlisted',
  'not_invited',
  'booked',
  'attended',
  'no_show',
  'withdrawn',
]);

export type { RenterAnswers };

/**
 * A renter's application to one letting, from their first enquiry (PRD data model). The
 * operator controls this data; Gaff never links renters across operators (open question Q5).
 */
export const applications = pgTable(
  'applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    /** Short random reference for the reply address: <slug>+<ref>@INBOUND_DOMAIN. */
    ref: text().notNull().unique(),
    fullName: text().notNull(),
    email: text().notNull(),
    emailNormalised: text().notNull(),
    phone: text(),
    phoneE164: text(),
    sources: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    firstEnquiredAt: timestamp({ withTimezone: true }).notNull(),
    lastEnquiredAt: timestamp({ withTimezone: true }).notNull(),
    status: applicationStatus().notNull().default('enquired'),
    /** R11, R14: place on the waiting list, in ranked order (1 is next). */
    waitlistPosition: integer(),
    answers: jsonb().$type<RenterAnswers>(),
    answersAt: timestamp({ withTimezone: true }),
    deleteAfter: date({ mode: 'string' }),
    personalDataDeletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('applications_letting_email_idx').on(t.lettingId, t.emailNormalised),
    index('applications_letting_idx').on(t.organisationId, t.lettingId, t.firstEnquiredAt),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * Every inbound and outbound message, with its channel, who wrote it (renter, fixed
 * template, AI or a person) and where it is in the outbox (PRD data model, ADR-0010).
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    applicationId: uuid().references(() => applications.id),
    direction: text({ enum: ['inbound', 'outbound'] }).notNull(),
    channel: text({ enum: ['email', 'sms'] }).notNull(),
    kind: text().notNull(),
    templateKey: text(),
    author: text({ enum: ['renter', 'template', 'ai', 'person'] }).notNull(),
    authorUserId: text().references(() => users.id),
    /** The email address or phone number it was sent to or came from. */
    toAddress: text(),
    subject: text(),
    body: text().notNull(),
    status: text({
      enum: [
        'received',
        'awaiting_approval',
        'scheduled',
        'sending',
        'sent',
        'failed',
        'cancelled',
        'discarded',
      ],
    }).notNull(),
    sendAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    providerMessageId: text(),
    inReplyToId: uuid(),
    inboundEmailId: uuid().references(() => inboundEmails.id),
    approvedBy: text().references(() => users.id),
    approvedAt: timestamp({ withTimezone: true }),
    failure: text(),
    flaggedWrongFactAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('messages_letting_idx').on(t.organisationId, t.lettingId, t.createdAt),
    index('messages_outbox_idx').on(t.status, t.sendAt),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * Private links for renters and landlords, who never have accounts (ADR-0013). Only a hash of
 * the 256-bit token is stored. Each link is scoped to one application or one letting.
 */
export const accessLinks = pgTable(
  'access_links',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    purpose: text({ enum: ['renter', 'landlord'] }).notNull(),
    subjectId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('access_links_subject_idx').on(t.organisationId, t.subjectId), tenantPolicy()],
).enableRLS();

/**
 * R8: a renter's question the AI couldn't answer from the facts, or a request for a person.
 * The operator answers once; with "remember", the answer becomes a fact Gaff reuses.
 */
export const operatorQuestions = pgTable(
  'operator_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    sourceMessageId: uuid()
      .notNull()
      .references(() => messages.id),
    question: text().notNull(),
    reason: text().notNull(),
    status: text({ enum: ['open', 'answered', 'closed'] })
      .notNull()
      .default('open'),
    answerFactId: uuid().references(() => lettingFacts.id),
    answeredBy: text().references(() => users.id),
    answeredAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('operator_questions_status_idx').on(t.organisationId, t.status), tenantPolicy()],
).enableRLS();

/** R8: what the AI was given and gave back, for every draft (PRD: every message logged). */
export const aiDrafts = pgTable(
  'ai_drafts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: organisationId(),
    sourceMessageId: uuid()
      .notNull()
      .unique()
      .references(() => messages.id),
    draftMessageId: uuid().references(() => messages.id),
    model: text().notNull(),
    promptVersion: text().notNull(),
    factIds: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    answered: integer().notNull(),
    toOperator: integer().notNull(),
    refused: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  () => [tenantPolicy()],
).enableRLS();

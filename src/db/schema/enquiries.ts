import { sql } from 'drizzle-orm';
import {
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { lettings } from './lettings';
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

/** Answers to the pre-viewing questions (R9): only those the criteria need. */
export interface RenterAnswers {
  moveInDate?: string;
  stayMonths?: number;
  occupants?: number;
  hasPets?: boolean;
}

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

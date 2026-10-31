import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tenantPolicy } from './columns';
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
    applicationId: uuid(),
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

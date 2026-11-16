import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns';

/**
 * Development outbox (ADR-0010): where the dev email adapter "sends" mail, shown at
 * /dev/outbox. Never used in production, where EMAIL_PROVIDER is mailgun.
 */
export const devOutbox = pgTable('dev_outbox', {
  id: uuid().primaryKey().defaultRandom(),
  toAddress: text().notNull(),
  fromAddress: text().notNull(),
  replyTo: text(),
  subject: text().notNull(),
  text: text().notNull(),
  /** The message in the email layout (UX-PP-10), where it was sent with one. */
  html: text(),
  createdAt: createdAt(),
});

import { customType, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

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

/**
 * The local photo store (UX-LT-10): where the stand-in for photo hosting keeps homes' photos,
 * as the development outbox keeps mail. Never used in production, where PHOTO_STORE is
 * supabase. Photos of homes only: nothing personal is ever stored by this path.
 */
export const devPhotoStore = pgTable('dev_photo_store', {
  key: text().primaryKey(),
  contentType: text().notNull(),
  bytes: bytea().notNull(),
  size: integer().notNull(),
  createdAt: createdAt(),
});

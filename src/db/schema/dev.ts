import { customType, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
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
  /** M86: List-Unsubscribe headers, so tests can follow them. */
  headers: jsonb().$type<Record<string, string>>(),
  createdAt: createdAt(),
});

/**
 * The test copy's photos (STORAGE_PROVIDER=database): Vercel's functions have no disk, so the
 * stand-in for Supabase Storage keeps objects here. Never used in production, which refuses it.
 */
export const devObjects = pgTable(
  'dev_objects',
  {
    bucket: text({ enum: ['uploads', 'media'] }).notNull(),
    key: text().notNull(),
    contentType: text().notNull(),
    body: bytea().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.key] })],
);

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { documentFlags } from '@/domain/documents/flags';
import { documentKinds, letterKinds } from '@/domain/documents/kinds';
import { users } from './auth';
import { checks } from './checks';
import { applicantPolicy, createdAt, tenantPolicy } from './columns';
import { applications } from './enquiries';
import { lettings } from './lettings';
import { organisations } from './organisations';

/** How a reading came to be: read by Gaff, entered by the renter, or not read at all (P5). */
export const readBy = ['gaff', 'renter', 'nobody'] as const;

/**
 * BA-16 (P30 to P41; the live line's ADR-0026): a chosen renter's own copy of a work or income
 * document, before they share it, and while they keep it (P40, unticked by default). It has no
 * organisation: only the renter's private link (withApplicant()) or the person who keeps it
 * (withPerson()) can reach it, so a letter never can (rule 3).
 *
 * The file is in the document store (src/ports/document-store.ts), encrypted with Gaff's key;
 * `storage_key` is null once it's deleted. The reading is sealed (ADR-0005). A statement of
 * other income is deleted as soon as the renter confirms its reading (P33), and is never kept.
 * There is no column for a PPS number, an account number, a payer or what a payment is for, and
 * the reading can't hold one (`checkDocumentReading`). Every row has a deletion date, and the
 * nightly job keeps to it (rule 9).
 */
export const renterDocuments = pgTable(
  'renter_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The application it was added on: the private link that reaches it. */
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    /** Set only while the person keeps it on their own profile (P40). */
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    /** The kind the renter said it is. */
    kind: text({ enum: documentKinds }).notNull(),
    storageKey: text(),
    contentType: text().notNull(),
    bytes: integer().notNull(),
    pages: integer().notNull().default(1),
    readingSealed: text(),
    readBy: text({ enum: readBy }).notNull().default('nobody'),
    // Its flags (P38) are worked out afresh each time from the reading and the name to match.
    documentDate: date({ mode: 'string' }),
    correctedByRenter: boolean().notNull().default(false),
    confirmedAt: timestamp({ withTimezone: true }),
    sharedAt: timestamp({ withTimezone: true }),
    deleteAfter: timestamp({ withTimezone: true }).notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('renter_documents_application_idx').on(t.applicationId),
    index('renter_documents_user_idx').on(t.userId),
    index('renter_documents_delete_idx').on(t.deleteAfter),
    applicantPolicy(),
  ],
).enableRLS();

/**
 * BA-16 (P39, P41, P44 to P49): the letter's copy of what a chosen renter shared, for the
 * letting's team. A work document is a separate encrypted object of the letter's own, deleted
 * when the tenancy starts or the application closes, and 30 days after sharing at the latest.
 *
 * Other income travels as a reading alone, kind `regular_income`, unlabelled: the kinds here
 * can't name other income (`letterKinds`), and the constraint below means a regular income row
 * can never hold a file, so there is nothing for a letter to open (P33, P45, rule 3). The
 * reading stays with the application's personal data (R26) and goes with it.
 */
export const checkDocuments = pgTable(
  'check_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    checkId: uuid()
      .notNull()
      .references(() => checks.id),
    kind: text({ enum: letterKinds }).notNull(),
    storageKey: text(),
    contentType: text(),
    readingSealed: text(),
    readBy: text({ enum: readBy }).notNull(),
    flags: text({ enum: documentFlags })
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    documentDate: date({ mode: 'string' }),
    correctedByRenter: boolean().notNull().default(false),
    sharedAt: timestamp({ withTimezone: true }).notNull(),
    deleteAfter: timestamp({ withTimezone: true }).notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('check_documents_application_idx').on(t.organisationId, t.applicationId),
    index('check_documents_delete_idx').on(t.deleteAfter),
    check(
      'check_documents_regular_income_has_no_file',
      sql`${t.kind} <> 'regular_income' or (${t.storageKey} is null and ${t.contentType} is null)`,
    ),
    tenantPolicy(),
  ],
).enableRLS();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * The local document store (BA-16): where the stand-in for the private `documents` bucket keeps
 * renters' documents, already encrypted with Gaff's key, for local work and tests. Production
 * refuses it (DOCUMENT_STORE, src/lib/env.ts). Only withSystem() reaches it: the store's own
 * code, and nothing else.
 */
const systemOnly = sql`current_setting('app.rls_bypass', true) = 'on'`;

export const devDocumentStore = pgTable(
  'dev_document_store',
  {
    key: text().primaryKey(),
    contentType: text().notNull(),
    bytes: bytea().notNull(),
    size: integer().notNull(),
    createdAt: createdAt(),
  },
  () => [
    pgPolicy('dev_document_store_system', {
      as: 'permissive',
      for: 'all',
      using: systemOnly,
      withCheck: systemOnly,
    }),
  ],
).enableRLS();

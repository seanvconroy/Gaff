import { bigint, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * UX-AG-1, Q39: Gaff's copy of the PSRA's register of licensed property services providers. It
 * holds businesses licensed to let (category C) and nothing else: no employee's or principal
 * officer's own licence is ever stored (src/domain/register/parse.ts drops them). The register
 * is public, and the PSRA is credited as its re-use terms ask. Refreshed weekly by a job.
 *
 * This is reference data, the same for everyone: it has no organisation and no person.
 */
export const psraRegister = pgTable(
  'psra_register',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The business's licence number as the register prints it, such as 001234. */
    licenceNumber: text().notNull().unique(),
    registeredName: text().notNull(),
    tradingName: text(),
    /** `company`, `partnership` or `sole_trader` (src/domain/register/parse.ts). */
    licenceType: text().notNull(),
    county: text().notNull(),
    /** The names in lower case with no accents or punctuation, for the search (UX-AG-1). */
    searchText: text().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /**
     * UX-AG-6: when a refresh first found the entry gone from the register. The row stays, so an
     * agency that holds it can be told its licence has lapsed; the search never offers it.
     */
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('psra_register_search_idx').on(t.searchText)],
);

/** Each weekly refresh of the copy: when, from where, and counts. No names. */
export const psraRegisterRefreshes = pgTable('psra_register_refreshes', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  /** `sample` (a made-up file, never in production) or `url` (the PSRA's download). */
  source: text().notNull(),
  finishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  entries: integer().notNull(),
  added: integer().notNull(),
  removed: integer().notNull(),
  /** UX-AG-6: agencies on Gaff whose licence was found lapsed, and found renewed. */
  lapsed: integer().notNull(),
  renewed: integer().notNull(),
});

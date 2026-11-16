import { sql } from 'drizzle-orm';
import { pgPolicy, timestamp } from 'drizzle-orm/pg-core';

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * Row-level security for tenant tables (ADR-0004). A row is visible only inside
 * withOrg() for its organisation, or inside withSystem() for cross-organisation jobs.
 * src/db/migrate.ts also forces RLS, so the table owner is bound by it too.
 */
const tenantCheck = sql`organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on'`;

export const tenantPolicy = () =>
  pgPolicy('tenant_isolation', {
    as: 'permissive',
    for: 'all',
    using: tenantCheck,
    withCheck: tenantCheck,
  });

/**
 * Row-level security for what belongs to a person and to no organisation (UX-AC-5, ADR-0016):
 * their profile now, and later what a renter keeps and a verified identity (Q25, Q35). A row is
 * visible only inside withPerson() for that person. An operator's path, withOrg(), sets no
 * person, so it sees no rows here whatever it asks for. withSystem() sees them, for retention.
 */
const personCheck = sql`user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on'`;

export const personPolicy = () =>
  pgPolicy('person_only', {
    as: 'permissive',
    for: 'all',
    using: personCheck,
    withCheck: personCheck,
  });

/**
 * Beside tenantPolicy(), on a table an organisation owns but one person started a row in: a
 * request to join an agency. The person sees their own row from withPerson(); the agency sees
 * every row that is its own from withOrg().
 */
export const ownRowPolicy = () =>
  pgPolicy('own_row', {
    as: 'permissive',
    for: 'select',
    using: sql`user_id = nullif(current_setting('app.person_id', true), '')`,
  });

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
 * The renter zone (ADR-0017): a renter's own rows, visible only inside withRenter() or
 * withEnquiry() for that renter, or to cross-organisation jobs.
 */
const renterCheck = sql`user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on'`;

export const renterPolicy = () =>
  pgPolicy('renter_isolation', {
    as: 'permissive',
    for: 'all',
    using: renterCheck,
    withCheck: renterCheck,
  });

/**
 * The public zone (ADR-0017): anyone may read. Writes still need the owning organisation,
 * so public tables also carry tenantPolicy(). Columns are an allow-list (tests/integration).
 */
export const publicReadPolicy = () =>
  pgPolicy('public_read', { as: 'permissive', for: 'select', using: sql`true` });

/**
 * Gaff staff (ADR-0017) may read and decide some organisation rows, such as letter checks
 * (M105), but only inside withStaff(), which needs a signed-in staff member.
 */
const staffCheck = sql`current_setting('app.role', true) = 'staff'`;

export const staffReviewPolicy = () =>
  pgPolicy('staff_review', {
    as: 'permissive',
    for: 'all',
    using: staffCheck,
    withCheck: staffCheck,
  });

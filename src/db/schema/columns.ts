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

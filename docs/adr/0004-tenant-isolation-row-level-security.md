# ADR-0004: Tenant isolation with organisation_id and row-level security

- Status: Proposed
- Date: 2026-10-31

## Context

Many agencies and landlords share one database. A bug that shows one agency's applicants to another would be a serious data breach. The PRD requires role-based access per organisation.

## Decision

- Every tenant-owned table has an `organisation_id` column.
- Application code reaches tenant data only through `withOrg(orgId, tx => …)`, which opens a transaction and sets `app.org_id` for it.
- **Postgres row-level security** policies on every tenant table allow only rows where `organisation_id` matches `app.org_id`. The application's database role cannot bypass RLS.
- Jobs that must work across organisations (the outbox dispatcher, the retention job) use a separate maintenance role. They process one organisation at a time through `withOrg` wherever they can.
- Roles within an organisation: **admin** (settings, users, approve-before-send) and **negotiator** (runs lettings). Both see their organisation's lettings.
- Gaff staff have no standing access to renter data. Support access, when it's added, will be explicit, time-limited and logged.

## Consequences

- A missed `WHERE organisation_id = …` returns no rows rather than another tenant's data. This is defence in depth, and it strengthens the DPIA.
- A little extra ceremony in data access, and migrations must add a policy for every new tenant table. A test fails if a tenant table has no policy.
- Integration tests prove that organisation A can't read organisation B's rows on every tenant table.

## Alternatives considered

- **Application-level filtering only.** Simpler, but one forgotten filter leaks data.
- **A schema or database per tenant.** Strong isolation, but migrations and operations multiply with every customer.

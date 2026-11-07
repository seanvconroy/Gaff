# ADR-0017: Data zones: organisation, renter, public and staff

- Status: Accepted
- Date: 2026-11-07

## Context

Until now every row belonged to an organisation (ADR-0004). The marketplace adds data that doesn't: a renter's own profile, saved searches and alerts (Q25, M8 to M13), public copies of listings that anyone can read, and Gaff staff's review queues. Each needs its own rule for who can read and write it, enforced by the database, not by remembering a filter.

## Decision

Every table belongs to one zone, and each zone has a row-level security policy and a helper that sets the session variables the policy reads:

| Zone | Policy | Helper |
| --- | --- | --- |
| Organisation | `organisation_id = app.org_id` (`tenantPolicy()`, as now) | `withOrg()` |
| Renter | `user_id = app.user_id` (`renterPolicy()`) | `withRenter()` |
| Public | Anyone reads; only the owning organisation writes (`publicPolicy()`) | `withPublic()` for reads |
| Staff | `app.role = 'staff'` (`staffPolicy()`) | `withStaff()` |

- **Cross-organisation jobs** still use `withSystem()` (ADR-0004), kept rare and obvious.
- **One combined helper, `withEnquiry(orgId, userId)`,** sets both the organisation and the renter, so an enquiry's application (organisation zone) and the record of what the renter shared (renter zone) are written in one transaction.
- **Events outside an organisation** go to `platform_events`, with the same rule as `events`: IDs, codes, numbers and dates only (ADR-0006).
- **Public tables are an allow-list of columns.** A test fails if a column that isn't on the list appears, so personal data can't reach a public page by accident.

## Consequences

- A forgotten filter still returns nothing rather than someone else's data, in every zone.
- Each new table must pick a zone and its policy; a test checks that every table with row-level security has one of the four policies.
- Staff see an organisation's data only through a case, and each look is logged (milestone 7).

## Alternatives considered

- **Application-level filters for the new data.** One missed filter would leak a renter's profile.
- **Separate databases for public and renter data.** Stronger walls, but no single transaction across them, and more to run.

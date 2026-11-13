# ADR-0015: The marketplace lives in the modular monolith

- Status: Accepted
- Date: 2026-11-07

## Context

Sean approved the marketplace for build on 7 November 2026 ([marketplace PRD](../marketplace/prd.md)): free listings, renter search and accounts, and enquiries that start the existing letting workflow. Two part-time founders run Gaff. The marketplace and the workflow share homes, lettings and applications, and every enquiry from a listing starts stage 2 of the workflow.

## Decision

- The marketplace is part of the same Next.js app, the same Postgres database and the same job queue (ADR-0001, ADR-0003, ADR-0014). No new service.
- New code follows the same layers: `domain/` rules first, `server/` use cases that write their change and event in one transaction, thin `app/` routes and `jobs/` tasks.
- Public pages (search, listings, areas, developments, agencies) are server-rendered. Pages that don't depend on who's looking are static and regenerated when their data changes, so they're fast and cheap to serve from Vercel's CDN.
- The public pages and renter sign-up stay dark behind `MARKETPLACE_PUBLIC` until launch.

## Consequences

- One deploy, one set of tests and one place to enforce the product rules, for both sides of the marketplace.
- A heavy load on public pages could compete with the workspace for database connections. Static pages and caching keep most public traffic off the database; the pooler handles the rest.
- If search ever outgrows Postgres, it can move behind a port without touching the rules.

## Alternatives considered

- **A separate marketplace app.** Cleaner boundaries, but two deployables and a sync between them, for two part-time founders.
- **A hosted search or listings service.** A new vendor holding listing data and renters' queries, for a scale Postgres handles easily.

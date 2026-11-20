# Architecture decision records

Short records of the decisions that shape Gaff's code: the context, what we chose, and what it costs us. Each starts as **Proposed** and becomes **Accepted** once the CTO decides. Sean has delegated technical decisions to the CTO role. When a decision changes, add a new ADR that supersedes the old one rather than rewriting history.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith-typescript-nextjs.md) | A TypeScript modular monolith on Next.js, with a separate worker process | Accepted; worker part changed by 0014 |
| [0002](0002-eu-hosting-render-frankfurt.md) | EU hosting on Render, Frankfurt | Superseded by 0014 |
| [0003](0003-postgres-only-data-store.md) | Postgres is the only data store: Drizzle, jobs and the outbox in Postgres | Accepted |
| [0004](0004-tenant-isolation-row-level-security.md) | Tenant isolation with `organisation_id` and row-level security | Accepted |
| [0005](0005-staged-data-and-retention.md) | Staged data and retention, built into the schema and jobs | Accepted |
| [0006](0006-event-log-without-personal-data.md) | The event log holds no personal data | Accepted |
| [0007](0007-people-decide.md) | People decide: renter-affecting changes need a decision record | Accepted |
| [0008](0008-deterministic-ranking.md) | Ranking is deterministic code, not AI | Accepted |
| [0009](0009-ai-drafting-with-claude-in-the-eu.md) | AI drafts answers only, from letting facts, processed in the EU | Accepted |
| [0010](0010-messaging-adapters-and-outbox.md) | Email and SMS through adapters and an outbox | Accepted; email provider changed by 0014 |
| [0011](0011-design-tokens-drive-styling.md) | Design tokens drive all styling | Accepted; amended by the UX redesign (one family, role names) |
| [0012](0012-testing-and-ci.md) | Testing and CI | Accepted |
| [0013](0013-sign-in-operators-links-for-renters.md) | Operators sign in by email link; renters and landlords use private links | Accepted; operators' sign-in superseded by 0015 |
| [0014](0014-vercel-supabase-approved-vendors.md) | Vercel and Supabase, with approved vendors instead of EU-only | Accepted |
| [0015](0015-sign-in-google-apple-codes-passkeys.md) | People with accounts sign in with Google, Apple, an email code or a passkey; private links unchanged | Accepted |
| [0016](0016-one-person-several-roles.md) | One person, several roles; a silent organisation for a private landlord; profiles outside every organisation | Accepted; extends 0004 |
| [0017](0017-one-ai-provider-with-usage-budget-and-switches.md) | One AI provider (the Claude API on the test copy, Bedrock in Dublin in production) for three tasks, with a usage log, a monthly budget and switches | Proposed; amends 0009 |
| [0018](0018-own-place-index-from-openstreetmap.md) | Search uses Gaff's own place index, built from OpenStreetMap and kept in Postgres | Accepted (Q51) |
| [0019](0019-sign-in-hardened.md) | Sign-in, hardened: limits in Postgres, closed library routes, joining by the address's host, How you sign in, devices | Accepted; extends 0015 |
| [0020](0020-id-check-on-stripe-identity-and-booking-mobile.md) | The ID check on Stripe Identity (a verified webhook re-read from Stripe, one session across three tries, redaction after 30 days), and a mobile confirmed by text code to book a viewing | Accepted |
| [0021](0021-search-map-on-google-maps.md) | The search map and the lister's pin are on Google Maps, with homes' own points | Accepted (Q51) |
| [0022](0022-google-script-only-on-map-pages.md) | Google's script runs only in documents loaded for the map's pages | Accepted |
| [0023](0023-photo-pipeline.md) | The photo pipeline: every photo made again upright, clean, at fixed WebP sizes with a hash; floor plans; straight to Supabase Storage | Accepted (M43, M44) |
| [0024](0024-reports-handled-as-cases.md) | Reports handled as cases: due times in working hours, an automatic hide on strong scam signals, a person's decision with a fixed statement of reasons, one appeal decided by someone else | Accepted |
| [0025](0025-place-pages-and-search-engines.md) | A page for each place at one address (`/to-rent/<county>/<place>`), the search for a place alone as its canonical address, and a sitemap and structured data only where `SEARCH_INDEXING=on` | Accepted |
| [0026](0026-fresh-listings-and-instant-alerts.md) | Fresh listings (asked after 14 days, stepping back 3 days after an unanswered ask), alerts as soon as a home is listed or daily at 8am, what changed on a saved home, a home's numbers, and a limit on asking to view | Accepted (M49, M82, M85, M86, M87, M92) |
| [0027](0027-checks-at-going-public.md) | Checks as a home goes public: contact details refused at the field, risk signals and the AI's wording check hold it for a person as a case; pausing a lister | Accepted (M29, M45, M48, M107, P12 to P14) |
| [0028](0028-drafted-descriptions.md) | A home's description drafted from its facts and the lister's statements only (the `description` AI task), shown only if it keeps to them and passes the wording check, and marked "Drafted by AI" for the lister until its words change | Accepted |
| [0029](0029-work-and-income-documents.md) | Chosen renters show work and income with the documents letters already ask for, read by the `document` AI task and checked at once; their own copy in a zone no operator's path reaches, other income shared only as a reading of "regular income", every copy deleted on its date | Accepted |

## Template

```markdown
# ADR-NNNN: Title

- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
## Alternatives considered
```

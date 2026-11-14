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
| [0011](0011-design-tokens-drive-styling.md) | Design tokens drive all styling | Accepted; the map on renter pages calls Google (0027) |
| [0012](0012-testing-and-ci.md) | Testing and CI | Accepted |
| [0013](0013-sign-in-operators-links-for-renters.md) | Operators sign in by email link; renters and landlords use private links | Accepted; renter accounts added by 0016; the ways to sign in replaced by 0028 |
| [0014](0014-vercel-supabase-approved-vendors.md) | Vercel and Supabase, with approved vendors instead of EU-only | Accepted |
| [0015](0015-marketplace-in-the-monolith.md) | The marketplace lives in the modular monolith | Accepted |
| [0016](0016-renter-accounts.md) | Renter accounts, alongside private links | Accepted (amends 0013); passwords and passkeys added by 0028 |
| [0017](0017-data-zones.md) | Data zones: organisation, renter, public and staff | Accepted |
| [0018](0018-homes-lettings-listings.md) | Homes, lettings and listings | Accepted |
| [0021](0021-photo-pipeline.md) | The photo pipeline | Accepted |
| [0022](0022-checking-letters.md) | Checking letters before their homes go live | Accepted |
| [0023](0023-moderation.md) | Moderation: rules first, a hold for a person, people decide | Accepted |
| [0025](0025-ai-provider-and-tasks.md) | Where the AI runs, and the tasks it does | Proposed (amends 0009) |
| [0026](0026-identity-and-documents.md) | Identity once per person, and documents for chosen renters | Proposed (amends 0022) |
| [0027](0027-places-index-on-google-maps.md) | Renter search uses our own place index, on Google Maps | Accepted (replaces the marketplace tech spec's self-hosted map, planned as 0020) |
| [0028](0028-sign-in-methods.md) | Sign in with Google, Apple, a password, a passkey or an email code | Accepted and built (amends 0013 and 0016); calls to revisit are Q62 to Q74 |

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

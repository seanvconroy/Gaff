# Architecture decision records

Short records of the decisions that shape Gaff's code: the context, what we chose, and what it costs us. Each starts as **Proposed** and becomes **Accepted** once the CTO decides. Sean has delegated technical decisions to the CTO role. When a decision changes, add a new ADR that supersedes the old one rather than rewriting history.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith-typescript-nextjs.md) | A TypeScript modular monolith on Next.js, with a separate worker process | Accepted |
| [0002](0002-eu-hosting-render-frankfurt.md) | EU hosting on Render, Frankfurt | Accepted |
| [0003](0003-postgres-only-data-store.md) | Postgres is the only data store: Drizzle, jobs and the outbox in Postgres | Accepted |
| [0004](0004-tenant-isolation-row-level-security.md) | Tenant isolation with `organisation_id` and row-level security | Accepted |
| [0005](0005-staged-data-and-retention.md) | Staged data and retention, built into the schema and jobs | Accepted |
| [0006](0006-event-log-without-personal-data.md) | The event log holds no personal data | Accepted |
| [0007](0007-people-decide.md) | People decide: renter-affecting changes need a decision record | Accepted |
| [0008](0008-deterministic-ranking.md) | Ranking is deterministic code, not AI | Accepted |
| [0009](0009-ai-drafting-with-claude-in-the-eu.md) | AI drafts answers only, from letting facts, processed in the EU | Accepted |
| [0010](0010-messaging-adapters-and-outbox.md) | Email and SMS through adapters and an outbox | Accepted |
| [0011](0011-design-tokens-drive-styling.md) | Design tokens drive all styling | Accepted |
| [0012](0012-testing-and-ci.md) | Testing and CI | Accepted |
| [0013](0013-sign-in-operators-links-for-renters.md) | Operators sign in by email link; renters and landlords use private links | Accepted |

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

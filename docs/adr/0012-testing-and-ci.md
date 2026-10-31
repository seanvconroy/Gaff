# ADR-0012: Testing and CI

- Status: Proposed
- Date: 2026-10-31

## Context

The product's value is getting Irish rules right. A regression in a compliance rule is an incident, not a bug. Two part-time founders can't hand-test every flow before each release.

## Decision

**For each requirement:** tests for the rule first, then the code, then the screen.

| Layer | Tool | What it covers |
| --- | --- | --- |
| Domain unit tests | Vitest | Pure rules: criteria, ranking, rent rules, capacity, reminder times across clock changes, Irish date and euro formatting, parsing, merging duplicates |
| Integration tests | Vitest + real Postgres | Use cases, events written, row-level security between organisations, jobs, the inbound pipeline from fixture emails |
| Compliance suite | Vitest | The PRD's Principles and Compliance rules as tests: no free-text criteria, no renter decision without a person, AI can't write fixed-wording messages, first reply discloses the AI, event payloads hold no personal data, no payments on renter pages, staged data |
| End-to-end | Playwright + axe | Journeys through real screens; WCAG 2.2 AA checks on every page; renter pages at phone size; screenshots for review |
| AI evals | Script against the real model | Golden questions, injection attempts, protected-ground questions, questions outside the facts; run on demand and before prompt or model changes |
| Design tokens | Vitest | Token file valid; generated CSS up to date; contrast pairs pass in both themes |

- Test names start with the requirement ID (`R10: …`), so coverage can be traced back to the PRD.
- `pnpm check` runs typecheck, lint (ESLint, Stylelint, Prettier), the tokens check, unit and integration tests, and the build. `pnpm test:e2e` runs Playwright.
- **CI (GitHub Actions)** runs all of it on every push, with a Postgres service container. The real-model AI evals are excluded because they need credentials and cost money.
- Only synthetic data in tests, fixtures and CI. Real renter data never leaves production.

## Consequences

- Slower to write than code alone, but each rule is pinned down in one place.
- Integration tests need Postgres locally (`pnpm db:start` uses the local install, or Docker).

## Alternatives considered

- **Mocked database in tests.** Faster, but it can't prove row-level security or SQL behaviour.
- **Jest.** Vitest is faster and handles TypeScript and ES modules without setup.

# Status

What's done and what's next. Updated with every requirement. The plan is in [architecture.md](architecture.md); launch gates are in [launch-checklist.md](launch-checklist.md).

Last updated: 31 October 2026.

## Done

| Item | What | Proven by |
| --- | --- | --- |
| Plan | Architecture, 13 ADRs (accepted), decisions on 16 PRD questions | `docs/` |
| Toolchain | Next.js 16, React 19, TypeScript 6 (strict), ESLint, Stylelint, Prettier, Vitest, Playwright | `pnpm check` |
| Design tokens | Tokens JSON → CSS variables and TS types; contrast tests in both themes; fonts self-hosted | `scripts/tokens/lib.test.ts` |
| Database | Drizzle schema and migrations; RLS on every tenant table, forced; `withOrg` / `withSystem` | `tests/integration/foundations.test.ts` |
| Record | Append-only event log (trigger); payloads checked for personal data; decisions only by a signed-in person | Unit, compliance and integration tests |
| Sign-in | One-time email links (Better Auth, hashed tokens, telemetry off), workspace set-up, PSRA licence for agencies | `tests/e2e/onboarding.spec.ts` |
| UI kit | Button, fields, choice group, notice, status pill, card, page header, stage tracker | Used on every screen; axe checks in E2E |
| Email | Port, development outbox, Mailgun EU adapter (no tracking) | Sign-in journey |
| CI and deploy | GitHub Actions with Postgres; Dockerfile; Render blueprint (Frankfurt) | `.github/workflows/ci.yml`, `render.yaml` |

## Slice 1 (stages 1 to 4)

| # | Requirement | Status |
| --- | --- | --- |
| 1 | R1: create a letting, with viewing times | **Done**: rules, use cases, screens, E2E (`tests/e2e/r1-letting.spec.ts`) |
| 2 | R2: criteria from the fixed list | **Done**: strict schema (no free text), questions only for set criteria, locked after invitations |
| 3 | R3: rent check | **Done**: rule table `ie-2026-03-v1` from public commentary (sources cited in `src/domain/rent/rent-check.ts`; solicitor to confirm); blocks a rent certainly over the 2% ceiling |
| 4 | R4: three comparables | **Done**: area only (no addresses), similarity warnings, middle rent beside the asking rent |
| 5 | R27: timeline, part 1 | **Done**: read-only timeline from the event log; stage 1 "Start taking enquiries" is a person's `confirm_setup` decision |
| 6 | R5: Gaff address and forwarding | **Done**: signed Mailgun EU webhook (5-minute replay window), store-then-queue, idempotent; settings page; dev inbox at `/dev/inbound` |
| 7 | R6: parse and merge enquiries | Next (synthetic emails until real samples arrive) |
| 8 | R7: first reply with AI disclosure | To do |
| 9 | R29: approve-before-send | To do |
| 10 | R8: answers from facts | To do |
| 11 | R9: renter's pre-viewing questions | To do |
| 12 | R10: ranking with reasons | To do |
| 13 | R11: approve invitations and waitlist | To do |
| 14 | R12: self-book, reschedule, cancel | To do |
| 15 | R13: confirmation and reminders | To do |
| 16 | R14: waitlist offers | To do |
| 17 | R15: attendance on a phone | To do |
| 18 | R28: dashboard | To do |
| 19 | R27: read-only landlord link | To do |

## Known issues

- **Design tokens, dark theme:** text on `forest` fails WCAG AA (`ink-inverse` 2.94:1, `peach` 2.83:1). Until the tokens are fixed, no screen puts text on `forest`. The token tests track it.

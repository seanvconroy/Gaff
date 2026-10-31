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
| 7 | R6: parse and merge enquiries | **Done** (synthetic emails until real samples arrive): match by advert ID then address; merge by email or phone; replies thread by address; "Needs attention" for anything else |
| 8 | R7: first reply with AI disclosure | **Done**: fixed template (AI disclosure, a person decides, private link, what's next, privacy notice); outbox + dispatcher with retries; held until the home is live. Sends as "<operator> via Gaff" until operator domains are verified |
| 9 | R29: approve-before-send | **Done**: on by default; AI answers wait in Approvals; approve (as is or edited) is a person's decision; "don't send" moves the questions to the operator; admin toggle in Settings |
| 10 | R8: answers from facts | **Done**: Claude on Bedrock EU (fake locally); cites fact IDs, checked by guardrails; fixed lawful answers for protected grounds; names and contact details redacted; requests for a person and anything uncovered go to Questions; operator answers remembered as facts |
| 11 | R9: renter's pre-viewing questions | **Done**: private link, no account, phone-first; only the questions the criteria need, only those answers kept; locked once invitations are decided |
| 12 | R10: ranking with reasons | **Done**: pure ranking (answered first, criteria met, enquiry time, stable); reasons in words; reads only answers and enquiry times |
| 13 | R11: approve invitations and waitlist | **Done**: one action (ticked by default up to the places available); waiting list = next in rank (Q2); holding message for everyone else (Q6); `invite_to_view` decision records criteria and ranking (IDs only) |
| 14 | R12: self-book, reschedule, cancel | **Done**: renter picks a time from their private link, phone first; the slot row is locked while places are counted (no double-booking); moving cancels the old reminders; booking closes 15 minutes before |
| 15 | R13: confirmation and reminders | **Done**: fixed-template confirmation straight away, email reminders 24 hours and 2 hours before, SMS 2 hours before only to a mobile given for it when booking (Q12); SMS adapter with a development stand-in and Sinch (EU) |
| 16 | R14: waitlist offers | **Done**: a cancellation queues an offer job in the same transaction; places go down the approved waiting list one person each with a 2-hour hold, then to everyone 4 hours before (Q2); held places count as taken for others; one hold per person; someone from the waiting list who cancels goes back on it |
| 17 | R15: attendance on a phone | **Done**: Attendance tab, one tap per person (Came / Didn’t come, changeable); opens 15 minutes before each viewing; each mark is a person’s `mark_attendance` decision, logged with IDs only; the renter’s page moves on; workspace pages no longer scroll sideways on phones (reflow checked in E2E) |
| 18 | R28: dashboard | Next |
| 19 | R27: read-only landlord link | To do |

## Known issues

- **Design tokens, dark theme:** text on `forest` fails WCAG AA (`ink-inverse` 2.94:1, `peach` 2.83:1). Until the tokens are fixed, no screen puts text on `forest`. The token tests track it.

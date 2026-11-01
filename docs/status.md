# Status

What's done and what's next. Updated with every requirement. The plan is in [architecture.md](architecture.md); launch gates are in [launch-checklist.md](launch-checklist.md).

Last updated: 1 November 2026 (Slices 1 and 2 complete; Slice 3 next).

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
| 18 | R28: dashboard | **Done**: “Needs you today” (answers to approve, emails needing attention, questions, who came to mark, who views, set-up to finish), each linking to where it’s done; each letting’s stage; active minutes per letting (a minute counts only with input in the last 2 minutes and the tab in view) against the usual time and days set in Settings (Q15) |
| 19 | R27: read-only landlord link | **Done**: operator makes a private link on the Timeline tab (shown once, only its hash kept), sees when the landlord last opened it, and can stop sharing at once; the landlord’s page shows the stage, numbers, criteria, ranking with reasons and the timeline, with renters only as “Applicant N” (Q4); tables scroll inside a keyboard-focusable region on phones |

## Slice 2 (stages 5 to 7)

| # | Requirement | Status |
| --- | --- | --- |
| 20 | R16: apply link after the viewing | **Done**: marking someone as “came” schedules a fixed-wording invitation to apply for the end of their viewing (cancelled if the mark changes); the renter’s page reuses their enquiry details and asks only how they mainly earn and their household’s take-home income (Q17); the income rule (default 2.5 times the rent, Q18) is shown before they apply; admins set it in Settings |
| 21 | R17: applicants side by side; preferred and backup | **Done**: Applications tab with a card per applicant in shortlist order (criteria met, take-home income against the rule in words and colour, how they earn, when they applied); the operator picks a preferred applicant and an optional backup (a `choose_applicants` decision recording positions and income ratios as numbers only); changeable until an offer is made; the letting moves to stage 6; “Needs you today” prompts when people have applied |
| 22 | R18: checks for the preferred applicant and backup | **Done** (with stand-in providers): checks are created only for the two people chosen, and explained before each starts; ID and income go through provider ports (a development stand-in page until the founders approve providers; production uses “none”, and the operator arranges those checks); the provider never gets the renter’s private link; only the verified name or confirmed income is kept, sealed with AES-256-GCM (ADR-0005); the identity check keeps no date of birth (Q19); references by email form with fixed choices and no free text, reminded twice, flagged after six days; results on the operator’s cards in words; a check that doesn’t pass is shown in warning with a plain reason and a way to explain; all cleared by the retention job |
| 23 | R19: landlord approves by link | **Done**: an agency sends the landlord a private link (adding their email on the spot if it’s missing) to a one-page summary of the preferred applicant and the backup: names from this stage only (Q4), criteria met, income against the rule as a ratio (never an amount), check results in words; the landlord approves or declines each, with no account; recorded as the landlord’s, by ID; a landlord letting their own homes approves by making the offer, and an agency without an email confirms the approval at offer time (Q22); changing the choice withdraws the request; landlord and referee replies go to the operator, never into a renter’s thread |
| 24 | R20: offer with a deadline; backup | **Done**: a `make_offer` decision with the landlord’s approval (R19, Q22); terms are the rent, a deposit capped at one month’s rent (rule 4), a move-in date and 24 hours, 48 hours or 3 days to answer; the offer says nothing is paid through Gaff and there are no other fees; the renter accepts or declines on their phone; at the deadline the offer closes and the renter is told; if the operator pre-approved it (Q20), a declined or unanswered offer goes to the backup on the same terms; “Needs you today” prompts to make the offer or choose again |
| 25 | R21: outcome messages | **Done**: when the offer is accepted the letting is let (stage 8), viewings still to come and other scheduled messages are cancelled, and everyone else gets a fixed-wording outcome straight away (applicants are told it went to another applicant; others that it’s let), with the date their details go; their deletion date is set then |

## Built early, before real renters

| Item | What | Status |
| --- | --- | --- |
| R26 (basic) | Retention, as ADR-0005 and Q3 require before the first real renter | **Done**: a person closes a letting as let or withdrawn (a `close_letting` decision); everyone who enquired gets a fixed closing message with the date their details go; viewings still to come and their reminders are cancelled; a daily job (02:30 UTC, catches up if missed) deletes names, contact details, answers and message text on the date, revokes renters’ links and logs each deletion by ID; backstops: 180 days after the last enquiry for lettings nobody closed, 30 days for emails Gaff couldn’t place |

## Next

- **Slice 2 (stages 5 to 7):** R16 apply link for people marked as came, R17 side-by-side applicants, R18 checks for the preferred applicant and backup only (providers need founders’ approval, rule 10), R19 landlord approval by link, R20 offer with a deadline and backup, R21 outcome messages.
- **Slice 3 (stages 8 and 9):** R22 tenancy agreement and e-signature, R23 payment request (deposit and first month, capped, paid to the operator’s own account), R24 rent-setting and RTB packs, R25 move-in checklist, and the full R26 (references deleted once the tenancy starts; the anonymous record deleted after 12 months).
- **Tidy-ups:** move the renter pages’ words into `src/copy/` with the templates, for one-place voice review; a dashboard nudge to close lettings whose viewings ended a while ago; a purge path for events and decisions older than `RETENTION_RECORD_MONTHS` (the event log is append-only, so this needs a privileged job), due before the first record is 12 months old; retention for `activity_minutes`.

## Known issues

- **Design tokens, dark theme:** text on `forest` fails WCAG AA (`ink-inverse` 2.94:1, `peach` 2.83:1). Until the tokens are fixed, no screen puts text on `forest`. The token tests track it.

# Status

What's done and what's next. Updated with every requirement. The plan is in [architecture.md](architecture.md); launch gates are in [launch-checklist.md](launch-checklist.md).

Last updated: 1 November 2026 (all three slices built; hosting moved to Vercel and Supabase; ready for the founder's end-to-end test).

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
| Email | Port, development outbox, Resend adapter (sending, and receiving with signed webhooks), Mailgun EU adapter; no tracking | Sign-in journey; `src/adapters/email/resend.test.ts`; `tests/integration/r5-resend-inbound.test.ts` |
| CI and deploy | GitHub Actions with Postgres; Vercel (Dublin) and Supabase (Ireland), migrations in the build ([deploy.md](deploy.md), ADR-0014) | `.github/workflows/ci.yml`, `vercel.json` |
| Jobs on Vercel | No always-on worker: a per-minute cron tick and a run straight after each request, time-boxed and stopping cleanly; the nightly retention job from the same schedule | `tests/integration/jobs-run-due.test.ts`, `tests/integration/cron-tick.test.ts` |
| Rules review | Rule 10 is now "approved vendors" (Q26); renter profiles decided, not built (Q25) | `CLAUDE.md`, `docs/open-questions.md` |

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

## Slice 3 (stages 8 and 9)

| # | Requirement | Status |
| --- | --- | --- |
| 26 | R22: tenancy agreement, signed by all parties | **Done**: the tenancy is set up from the accepted offer; Gaff’s standard agreement (draft wording for the solicitor) names the landlord, agent and PSRA licence, the home, start date, rent day, rent and capped deposit, and points to the Residential Tenancies Acts; the tenant reads and signs on their phone (typed name and consent, against a fingerprint of the exact text); the operator signs for the landlord as a `sign_agreement` decision; or both sign on paper and the operator records it (Q23); both have a printable copy |
| 27 | R23: payment request to the operator’s own account | **Done**: an admin sets the account tenants pay into (IBAN checksum checked; changes logged without the IBAN); once signed, the operator asks for the deposit and first month’s rent (capped, rule 4) by a date, with a reference; the bank details appear only on the tenant’s private page, never in email, with a prompt to confirm them by phone; the operator marks it received and the tenant gets a receipt; Gaff never holds money (rule 5); the tenant’s page shows each tenancy step, what’s done and what’s next |
| 28 | R24: rent-setting and RTB packs | **Done**: printable rent-setting pack (previous rent and date, the rent check and its rules version, three comparables, the new rent) and RTB registration pack (the home, dates, rent, deposit, landlord, agent and PSRA licence, tenant’s contact details); the tenant’s PPS number is optional, checked, sealed, shown only in the pack and deleted once the operator records the registration; no date of birth (Q24); the deadline is one month from the start, with an email to admins a week before and a dashboard prompt once the tenancy has started |
| 29 | R25: move-in checklist and inventory | **Done**: checklist (keys, alarms, how to report repairs, meter readings; keys handed over is moving in); inventory room by room with a condition, a short note and a photo; photos are re-drawn in the browser (the right way up, at most 1600 px, no location or camera details), checked by their real type and size on the server and stripped again, stored in Postgres and served only to the operator and, once shared, the tenant; the tenant confirms it’s a fair record, after which it can’t change |
| 30 | R26: retention, in full | **Done**: the operator finishes a let home once the agreement is signed and the money is in (warned if the RTB registration isn’t recorded); the letting is archived at stage 9 and the tenant’s details get their deletion date; the daily job deletes everyone’s personal details on schedule (now including the typed signature and any PPS number), the tenant’s references once the tenancy starts, and the anonymous record (events, decisions), operators’ active minutes and old inventory photos after `RETENTION_RECORD_MONTHS`, through the event log’s deliberate purge switch; “Needs you today” shows each tenancy’s next step, and lettings show days to let against the usual |

## Retention (R26), built early and completed in Slice 3

| Item | What | Status |
| --- | --- | --- |
| R26 (basic) | Retention, as ADR-0005 and Q3 require before the first real renter | **Done**: a person closes a letting as let or withdrawn (a `close_letting` decision); everyone who enquired gets a fixed closing message with the date their details go; viewings still to come and their reminders are cancelled; a daily job (02:30 UTC, catches up if missed) deletes names, contact details, answers and message text on the date, revokes renters’ links and logs each deletion by ID; backstops: 180 days after the last enquiry for lettings nobody closed, 30 days for emails Gaff couldn’t place |

## Next

- **Deploy the test copy** on Vercel and Supabase ([deploy.md](deploy.md), about 20 minutes).
- **Your end-to-end test** (see [testing-guide.md](testing-guide.md)), then feedback and iteration.
- **Before the first pilot:** everything in [launch-checklist.md](launch-checklist.md), including the providers for ID and income checks (stand-ins today) and the solicitor’s answers on electronic signing (Q23) and the agreement wording.
- **Later:** joint tenants on one agreement; guarantors when affordability isn’t met (renters can explain or add one by replying, today); an e-signature provider if the solicitor wants an advanced signature; renter profiles they can keep and reuse (decided in Q25; a slice of its own after the end-to-end test); an export of the signed agreement, packs and inventory as PDFs; moving the renter pages’ words into `src/copy/`.

## Known issues

- **Design tokens, dark theme:** text on `forest` fails WCAG AA (`ink-inverse` 2.94:1, `peach` 2.83:1). Until the tokens are fixed, no screen puts text on `forest`. The token tests track it.

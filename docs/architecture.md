# Gaff architecture

Status: **accepted**, 31 October 2026 (CTO decision). Hosting changed on 1 November 2026 to Vercel and Supabase ([ADR-0014](adr/0014-vercel-supabase-approved-vendors.md)). Key decisions are recorded as ADRs in [adr/](adr/README.md). Product questions and their decisions are in [open-questions.md](open-questions.md). What has to happen before the first pilot is in [launch-checklist.md](launch-checklist.md).

## What shapes it

- **Two part-time founders.** One codebase, one language, one database, one deployable, few vendors. Boring, well-documented tools over clever ones.
- **Approved vendors, EU regions where offered.** Each vendor that handles personal data has a signed DPA, uses its EU region where it has one, and has a lawful transfer basis otherwise (Q26). The database is in Ireland and the functions run in Dublin. The AI runs in the EU.
- **The PRD's compliance rules are built into the code.** Each rule maps to a mechanism in the code and a test (see [Where the rules live](#where-the-prds-rules-live)).
- **Re-skinnable.** All styling comes from `docs/design-tokens.json`.

## The shape

A modular monolith: one TypeScript codebase and one Postgres database. On Vercel, the "jobs" box below isn't a separate server: a cron runs due jobs every minute, and requests that queue work run it straight after responding. Locally it's `pnpm worker`.

```
                 Daft / MyHome enquiry emails
                              │ (operator's forwarding rule)
                              ▼
                 ┌─────────────────────────┐
 renters ──────▶ │  Email provider         │ ◀── outbound email
 (email, SMS)    └───────────┬─────────────┘
                             │ webhook
 operators (laptop/phone) ┐  ▼
 renters (phone, links) ──┼▶ ┌─────────────────────────┐        ┌──────────────────┐
 landlords (links) ───────┘  │  Web: Next.js (Vercel)  │        │  Claude (AI),     │
                             │  pages, forms, webhooks │        │  EU processing    │
                             └───────────┬─────────────┘        └────────▲─────────┘
                                         │                               │
                             ┌───────────▼─────────────┐                 │
                             │  Postgres (Supabase, IE)│                 │
                             │  data + event log +     │                 │
                             │  job queue + outbox     │                 │
                             └───────────▲─────────────┘                 │
                                         │                               │
                             ┌───────────┴─────────────┐                 │
                             │  Jobs (cron + after())  │─────────────────┘
                             │  parse enquiries, draft │──▶ SMS provider (EU)
                             │  answers, send, remind, │
                             │  waitlist, retention    │
                             └─────────────────────────┘
```

Inside the code, dependencies point inwards:

- `app/` (Next.js routes) and `jobs/` (worker tasks) are thin. They call...
- `server/` use cases, which load data, apply a domain rule, then save the result and its event in one transaction. Use cases call...
- `domain/`: pure business rules with no I/O and no framework code, unit-tested first. Criteria, ranking, rent rules, viewing capacity, reminder times and message templates all live here.
- `ports/` are interfaces to the outside world (email, SMS, AI, clock). `adapters/` implement them: local stand-ins for development and tests, real providers once approved.

The web framework, the email provider and the AI provider can each be swapped without touching the rules.

## Stack

| Concern | Choice | ADR |
| --- | --- | --- |
| Language | TypeScript (strict), Node.js LTS | [0001](adr/0001-modular-monolith-typescript-nextjs.md) |
| Web | Next.js (App Router), React, server-rendered; forms work without JavaScript | [0001](adr/0001-modular-monolith-typescript-nextjs.md) |
| Hosting | Vercel (functions in Dublin) and Supabase Postgres (Ireland); jobs from a per-minute tick (Supabase Cron) | [0014](adr/0014-vercel-supabase-approved-vendors.md) |
| Database | PostgreSQL 16+, Drizzle ORM, SQL migrations in the repo | [0003](adr/0003-postgres-only-data-store.md) |
| Jobs | graphile-worker (queue in Postgres), outbox table for every message; run by a cron tick on Vercel | [0003](adr/0003-postgres-only-data-store.md), [0014](adr/0014-vercel-supabase-approved-vendors.md) |
| Tenant isolation | `organisation_id` on every row, plus Postgres row-level security | [0004](adr/0004-tenant-isolation-row-level-security.md) |
| Privacy | Staged collection, renter data scoped to one application, retention jobs | [0005](adr/0005-staged-data-and-retention.md) |
| Record | Append-only event log with no personal data | [0006](adr/0006-event-log-without-personal-data.md) |
| Decisions | Renter-affecting changes need a person's decision record | [0007](adr/0007-people-decide.md) |
| Ranking | Deterministic code with reasons in words; no AI | [0008](adr/0008-deterministic-ranking.md) |
| AI | Claude on Amazon Bedrock (EU routing), drafting answers from letting facts only | [0009](adr/0009-ai-drafting-with-claude-in-the-eu.md) |
| Email and SMS | Resend (or Mailgun EU) and Sinch EU, behind adapters; dev outbox and fakes locally | [0010](adr/0010-messaging-adapters-and-outbox.md), [0014](adr/0014-vercel-supabase-approved-vendors.md) |
| Styling | Design tokens to CSS variables; CSS Modules; lint blocks raw values | [0011](adr/0011-design-tokens-drive-styling.md) |
| Validation and dates | Zod for every input; date-fns with Europe/Dublin | [0001](adr/0001-modular-monolith-typescript-nextjs.md) |
| Testing | Vitest, real Postgres, Playwright with axe, compliance suite, AI evals | [0012](adr/0012-testing-and-ci.md) |
| CI | GitHub Actions; synthetic data only | [0012](adr/0012-testing-and-ci.md) |
| Sign-in | Operators: email link (Better Auth, data in our DB). Renters and landlords: private links, no accounts | [0013](adr/0013-sign-in-operators-links-for-renters.md) |

## Where the PRD's rules live

| PRD rule | Mechanism | Proven by |
| --- | --- | --- |
| People make every decision (Principle 1, GDPR Art. 22) | Renter-affecting changes take a `Decision` that only a signed-in person can create; jobs and AI code can't create one | Compliance tests; lint import rules |
| Criteria from a fixed lawful list (R2, Equal Status Acts) | Criteria are a closed TypeScript union with typed parameters; there's no free-text field to store | Type checks; compliance tests |
| No protected grounds | Questions come only from the criteria list; ranking reads only criteria answers and enquiry time; fixed lawful answers for protected-ground questions; operator answers screened before reuse | Unit and compliance tests; AI evals |
| Staged data (DPC) | Each data group can only be written at its stage; documents and checks don't exist until Slice 2, and then only for the preferred applicant and backup | Compliance tests |
| Retention (R26) | Deletion date on every application; daily job deletes personal data and logs the deletion | Integration tests; job log |
| Renters never pay | No payment fields or flows on renter pages; the payment request (Slice 3) is capped and goes to the landlord's or agent's account | Compliance tests |
| Gaff never holds money (PSRA) | No payment-provider integration that receives funds; IBAN request to the landlord's or agent's own account | Architecture review; ADR |
| AI disclosure (EU AI Act) | First reply is a fixed template that states it; a test fails if the disclosure is removed | Compliance tests |
| Facts only from the letting (R8) | AI must cite fact IDs; uncited answers go to the operator | Unit tests; AI evals |
| Enquiry text is untrusted | Renter text passed as quoted data; no tools; schema-validated output | AI evals (injection set) |
| Fixed wording where it matters | Message kinds other than "answer" must come from versioned templates | Compliance tests |
| Every step logged (R27) | Use cases write an event in the same transaction as the change | Integration tests |
| Never lose an enquiry | Raw email stored before parsing; failures shown to the operator | Integration tests |
| WCAG 2.2 AA | Token contrast test; axe on every page in E2E; 16px minimum on renter pages | CI |

## Data model

The core objects follow the PRD's data model. Every tenant table carries `organisation_id` and is covered by row-level security. Money is stored in integer cents and times in UTC, displayed in Europe/Dublin.

### Slice 1 tables

| Table | Holds | Personal data? |
| --- | --- | --- |
| `organisations` | Agency or portfolio landlord: name, kind, PSRA licence number (agencies), Gaff inbound address, sending identity, approve-before-send flag, pilot baselines | No |
| `users`, `sessions`, `memberships` | Operator accounts (Better Auth tables) and their role in an organisation (admin or negotiator) | Operator staff |
| `landlords` | Owner's name and contact details, when an agent lets for them | Yes |
| `lettings` | Address, rent, available from, key facts, photos link, advert links, criteria (typed), stage, status | No |
| `letting_facts` | Facts the AI may answer from, each with an ID: set-up facts and operator answers | No (screened) |
| `rent_checks` | How the last tenancy ended, previous rent and date, outcome, rule version, who confirmed | No |
| `rent_comparables` | Three comparables from the RTB Rent Register | No |
| `viewing_slots` | Start, end, kind (booked slot or group viewing), capacity | No |
| `inbound_emails` | Every email received, raw, before parsing; parse status and reason; deletion date | Yes |
| `applications` | One renter's application to one letting, from first enquiry: name, contact details, source portals, enquiry times, answers to the pre-viewing questions, status, deletion date | Yes |
| `access_links` | Hashed private-link tokens for renters and landlords: purpose, expiry, revoked | No |
| `bookings` | Application, slot, status (booked, cancelled, attended, no-show), who marked attendance | Links to personal data |
| `waitlist_entries` | Approved waitlist with order and offer state | Links to personal data |
| `messages` | Every inbound and outbound message: channel, kind, template key and version, author (template, AI or person), status, send time, approval, wrong-fact flag | Yes |
| `ai_drafts` | Model, prompt version, fact IDs cited, outcome, safety-check result | No (refers to message) |
| `operator_questions` | Questions the AI couldn't answer, and the operator's answer, which becomes a fact | Question text may contain some |
| `decisions` | Who decided what and when, with a snapshot of the criteria and ranking used | No (IDs only) |
| `events` | Append-only log behind the timeline and the metrics | **Never** |
| `activity_minutes` | Operator active minutes per letting, for time saved | Operator staff |

### Later slices (sketch)

- **Slice 2:** `applications` gains self-declared employment and income (stage 5 only). Plus `checks` (provider, result, expiry, deletion date; no document images), `references`, `guarantors`, `offers`.
- **Slice 3:** `tenancy_packs` (agreement, signatures, payment request, rent-setting pack, RTB pack; PPSN encrypted at application level) and `renter_profiles` (opt-in, owned by the renter).

## Project structure

```
.
├── CLAUDE.md                    product rules, architecture, conventions, commands
├── docs/                        PRD, business plan, design system, tokens, ADRs, status
│   └── design-tokens.json       the single source of styling; replace it to re-skin
├── scripts/build-tokens.ts      tokens JSON → src/styles/tokens.css + tokens.ts
├── src/
│   ├── app/                     Next.js routes only: thin pages, server actions, route handlers
│   │   ├── (workspace)/         operator workspace, sign-in required
│   │   ├── r/[token]/           renter pages: questions, booking (no account)
│   │   ├── l/[token]/           landlord pages: read-only timeline (no account)
│   │   └── api/                 inbound email webhooks, cron tick, health check
│   ├── domain/                  pure rules, unit-tested first
│   │   ├── criteria/  ranking/  rent/  viewings/  enquiries/
│   │   └── messages/  decisions/  compliance/
│   ├── server/                  use cases: one transaction each, writes its event
│   ├── db/                      Drizzle schema, migrations, RLS policies, withOrg()
│   ├── jobs/                    task handlers, local worker, time-boxed runner for the tick
│   ├── ports/                   interfaces: email, SMS, AI, clock
│   ├── adapters/                dev outbox, fakes, real providers once approved
│   ├── ui/                      design-system components with CSS Modules (tokens only)
│   ├── copy/                    every word renters see, in one place, for voice review
│   ├── styles/                  generated tokens.css and tokens.ts, global.css, fonts
│   └── lib/                     Irish dates, euro formatting, env parsing
├── tests/
│   ├── integration/             real Postgres: use cases, RLS, jobs, inbound pipeline
│   ├── compliance/              the Principles and Compliance rules as tests
│   ├── e2e/                     Playwright journeys with axe accessibility checks
│   └── fixtures/                synthetic Daft and MyHome emails
├── evals/                       AI guardrail evals, run on demand against the real model
└── .github/workflows/ci.yml
```

## Two flows in detail

**An enquiry arrives (R5 to R9)**

1. Daft emails the operator; their forwarding rule sends a copy to their Gaff address.
2. The email provider posts it to `/api/inbound/email`. The handler checks the signature, stores the raw email in `inbound_emails`, queues a parse job and returns. It does nothing else, so nothing can be lost.
3. The worker parses it (portal, name, email, phone, message, advert), matches it to a letting by advert link, and finds or creates the application, merging duplicates within the letting. If it can't parse or match the email, it marks it "needs attention" and shows it to the operator.
4. The worker queues the first reply: a fixed template with the AI disclosure, a private link to the pre-viewing questions, what happens next and the privacy notice. It goes out within minutes.
5. If the enquiry asks questions, the worker asks the AI to draft answers from the letting's facts. Answers that cite facts go to the operator's approval queue (or straight out, if approve-before-send is off). Anything else becomes an operator question. The operator's answer becomes a new fact for next time.
6. Every step writes an event.

**A viewing is booked (R12 to R14)**

1. The renter opens their private link and picks a slot. The use case checks capacity in a transaction with a row lock, so a slot can't be double-booked.
2. The confirmation email is queued now. Reminders are written to the outbox with `send_at` 24 hours and 2 hours before the viewing.
3. Rescheduling moves the booking and rewrites the reminders. Cancelling cancels them and frees the place.
4. A freed place goes to the approved waitlist, following the rule agreed in Q2.

## Design tokens drive all styling

1. `docs/design-tokens.json` is the only place colours, fonts, type sizes, spacing, radii, shadows and motion are defined. Today it holds design direction A4, Navy and Atlantic.
2. `pnpm tokens` validates the file against a schema, resolves references such as `{atlantic-text}`, and generates:
   - `src/styles/tokens.css`: CSS custom properties (`--color-surface-0`, `--space-4`, `--radius-md`, `--font-display`, `--motion-fast` and so on) for light and dark themes. Dark follows the system setting, and `data-theme` can override it either way. Type sizes are in rem, so they follow the reader's browser text size. Under reduced motion every duration is 0ms. It also generates one class per type style (`.type-heading`, `.type-label` and so on).
   - `src/styles/tokens.ts`: typed token names, so components can only ask for tokens that exist.
3. Components use CSS Modules that reference only `var(--…)`. Stylelint rejects raw colours, font sizes, font families, spacing, radii and shadows. ESLint rejects inline `style` props.
4. The tokens file lists every text and background pair the screens use, with its contrast in both themes. A test checks each pair meets WCAG AA for its rule (text 4.5:1; large text and accent fills 3:1; edges, controls and focus rings 3:1), that the recorded ratios are right, and that the list covers the pairs the design system promises. A tokens file that breaks WCAG AA fails CI.
5. Fonts are self-hosted, with the weight and optical-size axes, so renters' phones never call Google.

**To re-skin:** replace `docs/design-tokens.json` (and the font files, if the families change), run `pnpm tokens`, check the contrast test passes, and commit.

## Testing approach

For every requirement:

1. **Rule first.** Unit tests for the domain rule (Vitest), named with the requirement ID, for example `R10: ranks by criteria met, then enquiry time`.
2. **Then the code.** The use case, with integration tests against real Postgres covering data, events, row-level security and jobs.
3. **Then the screen.** A Playwright journey, an axe accessibility check (WCAG 2.2 AA rules), and a screenshot for review. Renter pages are tested at phone size.

Also:

- **A compliance suite** encodes the PRD's Principles and Compliance rules, so a change that breaks one fails CI.
- **AI evals** cover a golden set of enquiries, including injection attempts, protected-ground questions and questions outside the facts. They run on demand against the real model; CI uses a fake.
- **Only synthetic data** in tests, fixtures and CI.

All checks run with one command, `pnpm check`, and in CI on every push.

## Environments

| Environment | Where | Data | Providers |
| --- | --- | --- | --- |
| Local | Your machine or this container: Postgres 16 and Node | Synthetic seed data | Dev outbox, fake SMS, fake AI |
| CI | GitHub Actions with a Postgres service | Synthetic | Fakes |
| Test copy | Vercel and Supabase, a separate project of each ([deploy.md](deploy.md)) | Synthetic only | Stand-ins: outbox page, fake SMS and AI, test check page |
| Production | Vercel (Dublin) and Supabase (Ireland) | Real | Real |

Production needs, before the first pilot letting: the DPIA, the solicitor's sign-off, the retention job (R26), backups with tested restores, and error alerts. A provider for error alerts is a later approval.

## Slice 1 build order

Each requirement is built rule, then code, then screen, and shown to you when its screen is done. `docs/status.md` tracks progress.

| # | Requirement | Screen |
| --- | --- | --- |
| 0 | Foundations: tokens, UI components, sign-in and organisations, event log, decisions, dev outbox | Sign-in, empty dashboard |
| 1 | R1: create a letting in under 10 minutes | New letting, letting overview |
| 2 | R2: criteria from the fixed list | Criteria step |
| 3 | R3: rent check (needs Q8) | Rent check step |
| 4 | R4: three comparables | Comparables step |
| 5 | R27, part 1: timeline of everything so far | Timeline tab |
| 6 | R5: Gaff address and forwarding instructions | Settings: your Gaff address |
| 7 | R6: parse and merge enquiries (needs sample emails, Q11) | Enquiries list, "needs attention" queue |
| 8 | R7: first reply with AI disclosure | Message log |
| 9 | R29: approve-before-send | Approvals queue |
| 10 | R8: answers from facts; operator answers once | Questions for you |
| 11 | R9: renter's pre-viewing questions (phone, no account) | Renter questions page |
| 12 | R10: ranking with reasons | Shortlist |
| 13 | R11: approve invitations and waitlist in one action | Approve dialog |
| 14 | R12: self-book, reschedule, cancel | Renter booking pages |
| 15 | R13: confirmation and reminders | Message templates |
| 16 | R14: waitlist offers | Renter "a place opened up" page |
| 17 | R15: attendance in one tap on a phone | Viewing day page |
| 18 | R28: dashboard | Dashboard |
| 19 | R27, part 2: read-only landlord link | Landlord timeline |


## Services and providers

Chosen by the CTO on 31 October 2026; hosting and email changed on 1 November 2026 (Q26, ADR-0014). Each stores or processes personal data, so each needs an account, a signed DPA and the checks below before launch. Until then, local stand-ins are used.

| Need | Choice | Why | Check before launch |
| --- | --- | --- | --- |
| Hosting | Vercel, functions in Dublin (Pro before real data) | The founders already use it; deploys on push | DPA; Data Privacy Framework for anything stored in the US; region set to `dub1` |
| Database | Supabase, West EU (Ireland) | The founders already use it; plain Postgres with row-level security | DPA; Data API off; daily backups, and point-in-time recovery before real data |
| AI | Claude on Amazon Bedrock, EU geographic routing | Keeps prompts and outputs in EU regions; Anthropic's own API currently offers global or US-only processing | The model is offered in the EU profile; Bedrock DPA; invocation logging off |
| Email in and out | Resend (Mailgun EU as an alternative) | The founders already use it; sends and receives with signed webhooks | DPA; Data Privacy Framework (data stored in the US); DKIM and SPF on our domains; open and click tracking off |
| SMS | Sinch, EU region | EU company (it owns Mailgun), EU API region | DPA; Irish sender ID rules; price |
| Operator sign-in | Better Auth (a library, not a service) | Accounts stay in our database; no third-party identity provider | None: open source, runs inside Gaff |
| CI | GitHub Actions | Already where the repo lives | Synthetic data only, so no personal data |

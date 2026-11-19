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
- `ports/` are interfaces to the outside world. `adapters/` implement them: local stand-ins for development and tests, real providers once approved (see "Ports" below).

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
| Accounts | One person, several roles: each organisation they belong to, a private landlord's silent organisation of one, and renting. A person's own profile has no organisation and its own row-level security | [0016](adr/0016-one-person-several-roles.md) |
| Privacy | Staged collection, renter data scoped to one application, retention jobs | [0005](adr/0005-staged-data-and-retention.md) |
| Record | Append-only event log with no personal data | [0006](adr/0006-event-log-without-personal-data.md) |
| Decisions | Renter-affecting changes need a person's decision record | [0007](adr/0007-people-decide.md) |
| Ranking | Deterministic code with reasons in words; no AI | [0008](adr/0008-deterministic-ranking.md) |
| AI | Claude on Amazon Bedrock in Dublin in production, the Claude API on the test copy; one adapter for three tasks (answers, reading an advert, reading a question about who's enquired), every call logged by usage alone, a monthly budget and switches | [0009](adr/0009-ai-drafting-with-claude-in-the-eu.md), [0017](adr/0017-one-ai-provider-with-usage-budget-and-switches.md) |
| Email and SMS | Resend (or Mailgun EU) and Sinch EU, behind adapters; dev outbox and fakes locally | [0010](adr/0010-messaging-adapters-and-outbox.md), [0014](adr/0014-vercel-supabase-approved-vendors.md) |
| Styling | Design tokens to CSS variables; CSS Modules; lint blocks raw values | [0011](adr/0011-design-tokens-drive-styling.md) |
| Validation and dates | Zod for every input; date-fns with Europe/Dublin | [0001](adr/0001-modular-monolith-typescript-nextjs.md) |
| Testing | Vitest, real Postgres, Playwright with axe, compliance suite, AI evals | [0012](adr/0012-testing-and-ci.md) |
| CI | GitHub Actions; synthetic data only | [0012](adr/0012-testing-and-ci.md) |
| Sign-in | People with accounts: Google, Apple, a six-digit email code, or a passkey (Better Auth, data in our DB). Renters, owners and referees: private links, no accounts | [0015](adr/0015-sign-in-google-apple-codes-passkeys.md), [0013](adr/0013-sign-in-operators-links-for-renters.md) |
| Places and the map | Gaff's own place index for "Where" (Postgres); the search map and the lister's pin on Google Maps (the Maps JavaScript API only), or a stand-in drawn from Gaff's own data, behind `MAP_PROVIDER`; Google's script only on the map's pages | [0018](adr/0018-own-place-index-from-openstreetmap.md), [0019](adr/0019-search-map-on-google-maps.md), [0020](adr/0020-google-script-only-on-map-pages.md) |

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
| `organisations` | An agency, a landlord's team, or one private landlord's silent organisation: name, kind, the agency's entry in the PSRA register and the licence number copied from it, when someone at Gaff confirmed it, whether its licence has lapsed, Gaff inbound address, sending identity, approve-before-send flag, pilot baselines | A private landlord's first name |
| `users`, `sessions`, `memberships` | People's accounts (Better Auth tables) and their role in each organisation they belong to (admin or negotiator) | Yes |
| `profiles` | A person's own profile (ADR-0016): whether they're renting, the context they used last, where they are in first run. No `organisation_id`; only `withPerson()` reads it | Yes, the person's own |
| `organisation_invites` | An invitation to join an organisation, by email address (UX-AG-5). Deleted when accepted, or once expired | Yes |
| `join_requests` | A person's request to join an agency that is already on Gaff (UX-AG-3) | IDs only |
| `psra_register`, `psra_register_refreshes` | Gaff's weekly copy of the PSRA register: businesses licensed to let, and a count for each refresh (Q39). No organisation, no person | Sole traders' names |
| `landlords` | Owner's name and contact details, when an agent lets for them | Yes |
| `lettings` | Address, rent, available from, key facts, photos link, advert links, criteria (typed), stage, status; where the home is, as its lister placed the pin (ADR-0019; a private landlord's is shown within about 150 m, and never logged) | No |
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
| `funnel_events` | Funnel steps the record has no event for (UX-ME-1): a step code, an ID, an optional split code and a time, once per step per subject. No `organisation_id`: any use case may add a row, and only `withSystem()` can read them, for Gaff's internal page | **Never** |

### Slices 2 and 3, and the UX redesign

| Table | Holds | Personal data? |
| --- | --- | --- |
| `checks` | The ID, income and reference checks of the two people chosen: kind, status, the sealed result (a verified name or a confirmed income), deletion date. No document image, no date of birth | Yes, sealed |
| `landlord_approvals`, `offers` | The owner's answer for the people chosen, and the offer with its terms and deadline | IDs and terms |
| `tenancies`, `inventory_items` | The tenancy from the accepted offer: agreement and signatures, payment request, RTB registration (the PPSN sealed, deleted once registered), move-in checklist; the inventory, item by item, with photos | Yes |
| `letting_drafts`, `letting_photos` | A letting part-way through "Add a letting" (Save and exit), and a home's photos, with a cover photo. The photo bytes are in the photo store | No |
| `letting_helpers` | Who chose "Help with this letting" on a colleague's letting (UX-AG-8) | IDs only |
| `viewing_sessions` | A run of viewing times added in one go on the calendar | No |
| `waiting_enquiries`, `waitlist_offers` | An ask to view not yet confirmed from its email (dropped after 24 hours), and places offered from a waiting list | Yes, until confirmed or dropped |
| `listing_reports` | A report of a listing: the home, the reason tapped, an optional note. Nothing about who reported | No |
| `one_time_codes`, `confirmations`, `passkeys`, `accounts`, `verifications` | Sign-in by email code, passkey, Google or Apple (ADR-0015), and "Confirm it's you" before a sensitive change | The person's own |
| `places` | Gaff's own place index (ADR-0018): every county, town, village, area, Dublin district, townland, street and landmark in the Republic, built from OpenStreetMap around a curated base and loaded on deploy. Reference data, with no organisation and no person | No |
| `place_misses` | What renters typed under "Where" that found no place, counted by day, with no digits, person or device; deleted after 30 days (M124) | No |
| `map_daily_counts` | How the search map was used, by day, as fixed codes (opened, drawn, failed and why, area searched, pin opened); nothing about any renter, device, area or search; deleted after 13 months (M133, ADR-0019) | No |

### Data that belongs to a person (ADR-0016)

A person is one person whatever they do on Gaff. What belongs to them, not to an organisation, has no `organisation_id`. It carries `personPolicy()` instead of `tenantPolicy()` and is read only through `withPerson()`, with the signed-in person's own ID; `withOrg()` can't read it, and a test holds that.

| Table | Holds |
| --- | --- |
| `profiles` | Whether they rent, the context they used last, where they are in first run |
| `renter_profiles` | What a renter chose to keep for next time: their details, the four answers, work and income with its date (Q25) |
| `verified_identities`, `identity_checks` | A kept identity: that the check passed, the verified name and the date (Q35, Q47). Never an image, document details, country or date of birth. An operator sees it only at the checks stage, with the renter's yes |
| `saved_homes`, `saved_searches` | Homes saved and searches to hear about; a search keeps the chips, never the sentence |
| `renter_enquiries` | The renter's own list of enquiries, pointing at the operator's application |
| `profile_events` | The record of the profile, with IDs and codes only |

An application to one letting stays the operator's copy, in `applications`, and is deleted on the letting's own schedule. A renter's profile is kept while they choose to keep it, deleted at once from Profile, and deleted after two years unused, 30 days after an email that says so (UX-PF-7).

## Project structure

```
.
├── CLAUDE.md                    product rules, architecture, conventions, commands
├── docs/                        PRD, business plan, design system, tokens, ADRs, status
│   └── design-tokens.json       the single source of styling; replace it to re-skin
├── scripts/build-tokens.ts      tokens JSON → src/styles/tokens.css + tokens.ts
├── src/
│   ├── app/                     Next.js routes only: thin pages, server actions, route handlers
│   │   ├── _shell/              the one shell: the navigation round the page (NavBar)
│   │   ├── (workspace)/         the letting side: Today, Lettings, Calendar, Inbox, Settings
│   │   ├── (task)/              its focused tasks on FlowShell: no navigation, one question a screen
│   │   ├── (site)/              Search (the public site's first screen), a home's page, Saved,
│   │   │                        Enquiries, Profile, Help
│   │   ├── (open-task)/         focused tasks open to anyone: asking to view, reporting a listing
│   │   ├── (first-run)/         /welcome: at most four questions, one a screen
│   │   ├── (auth)/              sign-in: email code, passkey, Google and Apple; privacy and terms
│   │   ├── r/[token]/           a renter's private pages: questions, booking, applying, checks,
│   │   │                        the offer, the tenancy (no account)
│   │   ├── l/[token]/           the owner's page (no account)
│   │   ├── approve/[token]/     the owner approves the people chosen (no account)
│   │   ├── reference/[token]/   a referee's form (no account)
│   │   ├── internal/            Gaff's own team: agencies to confirm, reported listings, funnels
│   │   ├── dev/                 development tools (outbox, inbound, stand-in checks, /dev/ui)
│   │   └── api/                 inbound email webhooks, cron tick, health check
│   ├── domain/                  pure rules, unit-tested first
│   │   ├── criteria/  ranking/  rent/  viewings/  enquiries/
│   │   └── messages/  decisions/  compliance/
│   ├── server/                  use cases: one transaction each, writes its event
│   ├── db/                      Drizzle schema, migrations, RLS policies, withOrg()
│   ├── jobs/                    task handlers, local worker, time-boxed runner for the tick
│   ├── ports/                   interfaces: email, SMS, AI, checks, address search, photos,
│   │                            the PSRA register, sign-in providers
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

## Ports

Every outside service sits behind an interface in `src/ports/` with a local stand-in in `src/adapters/`, so nothing needs a real account to build or test (rule 10). Each is chosen by a setting ([deploy.md](deploy.md)); production refuses a stand-in.

| Port | What it does | Stand-in | Real |
| --- | --- | --- | --- |
| `email.ts`, `inbound-email.ts` | Sending, and receiving with signed webhooks | Development outbox (`/dev/outbox`), `/dev/inbound` | Resend; Mailgun EU |
| `sms.ts` | Text reminders | Fake SMS | Sinch (EU) |
| `ai.ts` | One `AiProvider` for three tasks: drafting answers, reading a pasted advert (`ADVERT_READER`), and reading a question about who's enquired into chips. Called only through `runAi` (`src/server/ai/usage.ts`), which logs each call in `ai_calls`, keeps to `AI_MONTHLY_BUDGET_USD` and honours `AI_TASKS_OFF` | Fake AI | Claude on Amazon Bedrock (Dublin) in production; the Claude API on the test copy and in development, made-up data only |
| `checks.ts` | ID and income checks: a chosen applicant's, and a private landlord's "Confirm it's you" (Q47) | A stand-in page (`/dev/checks`) | None chosen yet (Q48); `none` in production until then |
| `address-search.ts` | Finding an address when adding a letting (`ADDRESS_SEARCH`) | A made-up list | Autoaddress, once its DPA is signed (Q40); `off` types it in |
| `photo-store.ts` | Homes' photos (`PHOTO_STORE`) | A table in this database | Supabase Storage (Ireland), a private bucket |
| `register.ts` | Gaff's weekly copy of the PSRA register (`PSRA_REGISTER_SOURCE`) | A made-up register | The PSRA's download, once its format is checked |
| `sign-in-providers.ts` | Google and Apple sign-in, for sign-in only (Q30) | `/dev/sign-in` | Google, Apple |

## Jobs

Background tasks wait in graphile-worker's queue in Postgres (`src/jobs/tasks.ts`). A use case queues one in the same transaction as its change.

| Job | When | What |
| --- | --- | --- |
| `send_message` | Queued with each message | Sends it through the outbox, with retries |
| `process_inbound_email` | Each email received | Reads, matches and merges an enquiry |
| `draft_answers` | A renter's question | Drafts a grounded answer for a person to approve |
| `send_waiting_reply`, `drop_waiting_enquiry` | An ask to view from someone without an account (UX-AV-6) | Sends the first reply, which they confirm from; drops it unconfirmed after 24 hours |
| `offer_place` | A cancelled booking | Offers the place down the waiting list |
| `expire_offer`, `expire_home_offer` | An offer's deadline | Closes a waiting-list place or a home's offer |
| `reference_overdue` | Six days after a referee is asked | Marks the reference overdue |
| `rtb_reminder` | A week before the RTB deadline | Reminds the admins |
| `saved_search_alerts`, `send_saved_search_email` | Daily at 08:00 UTC, and per alert | Tells people who saved a search about new homes |
| `psra_register_refresh` | Weekly | Refreshes Gaff's copy of the PSRA register; a lapsed licence holds go-live |
| `send_account_email` | Sign-in codes, invitations | Sends account emails |
| `retention_sweep` | Daily (02:30 UTC) | Deletes personal data on its date (rule 9); renters' profiles unused for two years; a let home's page 30 days after it was let; reports six months after they're answered; unconfirmed asks to view; saved searches held by an email alone; the AI's usage log (`ai_calls`) after 12 months; and the anonymous record after `RETENTION_RECORD_MONTHS` |

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

1. `docs/design-tokens.json` is the only place colours, fonts, type sizes, spacing, sizes, radii, shadows and motion are defined. Today it holds the UX redesign's direction: ink, white and Atlantic blue (`docs/design-system.md`).
2. `pnpm tokens` validates the file against a schema, resolves references such as `{brand-text}`, and generates:
   - `src/styles/tokens.css`: CSS custom properties (`--color-surface-0`, `--space-4`, `--size-control`, `--radius-md`, `--font-sans`, `--motion-fast` and so on) for light and dark themes. Dark follows the system setting, and `data-theme` can override it either way. Type sizes are in rem, so they follow the reader's browser text size. Under reduced motion every duration is 0ms. It also generates one class per type style (`.type-heading`, `.type-label` and so on).
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
| Test copy | Vercel and Supabase, a separate project of each ([deploy.md](deploy.md)), on a public address with a banner on every page | Synthetic only | Real email for real addresses (made-up ones to the outbox); fake SMS and AI, test check page. Everything under `/dev` but `/dev/ui` is for Gaff's own team only; no Google or Apple stand-in |
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
| AI | Claude on Amazon Bedrock in Dublin (`eu-west-1`); the Claude API on the test copy and in development only, with made-up data (ADR-0017) | Keeps prompts and outputs in the EU; Anthropic's own API offers global or US-only processing, so production refuses it | The model is offered in-region; Bedrock DPA; invocation logging off |
| Email in and out | Resend (Mailgun EU as an alternative) | The founders already use it; sends and receives with signed webhooks | DPA; Data Privacy Framework (data stored in the US); DKIM and SPF on our domains; open and click tracking off |
| SMS | Sinch, EU region | EU company (it owns Mailgun), EU API region | DPA; Irish sender ID rules; price |
| Operator sign-in | Better Auth (a library, not a service) | Accounts stay in our database; no third-party identity provider | None: open source, runs inside Gaff |
| CI | GitHub Actions | Already where the repo lives | Synthetic data only, so no personal data |

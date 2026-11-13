# Replacing the stand-ins: technical specification

Draft, 8 November 2026, revised the same day after Sean's review · CTO · goes with the [PRD](prd.md) (P1 to P60)

## Summary

The stand-ins are replaced inside the existing monolith, behind ports that already exist or are renamed. No new service runs alongside the app, and no vendor beyond those already approved is needed at launch. The work adds:

- a Claude adapter for both the Claude API (test copy) and Claude on Bedrock in Dublin (production), with four tasks, usage logging, a budget and evals;
- **one identity check per person**, a photo ID and a live selfie with Stripe Identity, with no other way through (Q60), kept in the person's own zone. Renters check the first time they're chosen, letters before their first letting goes live. Each workspace gets a copy for its badges, and each application gets one when the renter is chosen;
- **a mobile confirmed by text code, required to book a viewing**, using the code logic letters already have;
- **one checks page for chosen renters**: identity (once), work and income documents, and referees, shared in one step;
- **work and income documents**: uploaded straight to private storage, read and checked by Claude, encrypted, and deleted on schedule. Statements of other income never reach letters;
- no open banking at launch. "Confirm with your bank" (Tink) is sketched as a later option.

Everything in [architecture.md](../architecture.md), the ADRs and the [marketplace specification](../marketplace/tech-spec.md) still holds unless this document says otherwise.

## Decisions

| # | Decision | Choice | Why | ADR |
| --- | --- | --- | --- | --- |
| 1 | Where the AI runs | The Claude API on the test copy and in development; Claude on Bedrock, `eu-west-1` in-region, in production. Production refuses anything else | Q37. The Claude API offers only global or US inference and US storage; Bedrock in Dublin keeps renters' data in the EU (ADR-0009) | 0025 |
| 2 | One adapter for both | `Anthropic` and `AnthropicBedrockMantle` expose the same Messages API, so one implementation of each task takes either client | Same prompts, same evals, one place to change | 0025 |
| 3 | Model | Claude Opus 5.5 for every task, effort set per task. A cheaper model per task is a founder decision once its evals pass | ADR-0009; quality first, cost is a few cents per call | 0025 |
| 4 | Refusals and failures | A refusal, timeout or invalid output falls back to people. No server-side model fallback | Rule 1 and P5; evals cover exactly the model that runs; Bedrock doesn't offer server-side fallback | 0025 |
| 5 | Identity belongs to the person | One `identity_checks` row per person, in the renter zone (ADR-0017), with copies into `letter_checks` for each workspace and into `checks` for each application when the renter is chosen | Q48: checked once and reused; the person owns it; letters get copies only at their stage (rule 2) | 0026 |
| 6 | When renters check | The first time a letter chooses them as the preferred applicant or the backup, on the same page as their documents and referees, whatever the source of their enquiry. Before then, a confirmed email to enquire and a confirmed mobile to book a viewing | Q48: the moment identity matters, one rule for Gaff, Daft and MyHome renters, the DPC's guidance, and about €2.50 a letting instead of €1.25 a sign-up | 0026 |
| 7 | One standard, no alternative | A photo ID and a live selfie for everyone. No check without a selfie, no "can't be checked online", no seeing ID in person. A person at Gaff can give more tries after three | Q60: one verification standard, and stick to it. Whether consent holds, and the Equal Status Acts, are for the solicitor (Q61) | 0026 |
| 8 | Work and income | Documents chosen by how the renter earns, read and checked by Claude. No income estimate, no score, no ratio. Statements of other income are read by Gaff alone | Q49; the Irish norm; rule 3 | 0026 |
| 9 | Documents | Uploaded straight to private storage, then checked, read and encrypted by a job, as photos are (ADR-0021). The renter's and the letter's copies are separate objects with their own deletion dates | Vercel's 4.5 MB request limit; the photo pipeline already works this way; the two copies have different reasons to exist (Q25) | 0026 |
| 10 | Open banking | Not at launch. A later "Confirm with your bank" checks payslips against payments, through Tink, keeping only the outcome | Rare in Ireland, enterprise terms, credit unions can't be connected, and Sean doesn't want an income estimate | 0026 |

## The shape

```
Booking a viewing (r/[token])     Renter's checks page (r/[token])               Letter's Applications page
   │ mobile + text code             │ identity (once), upload, confirm, share        │ see the pack, open documents
   ▼                                ▼                                                ▼
server/viewings              server/identity ──► ports/identity ──► adapters/identity/stripe ──► Stripe Identity (hosted)
                                   │   copies at stage: letter_checks (workspace badges), checks (application, when chosen)
                                   ▼
                             domain/identity (names, what's done, words)   webhook /api/webhooks/stripe-identity ─► server/identity

server/documents ──► ports/storage (private bucket) ──► job process_document ──► ports/ai (read)
      ▼
domain/documents (what's asked, recency, flags, pay periods)

server/answers, server/listings, server/moderation ──► ports/ai ──► adapters/ai/claude ──► Claude API | Bedrock (eu-west-1)
                                                                    adapters/ai/fake (tests, local)
```

## Code layout

```
src/ports/ai.ts                     the AI port: four tasks (was one)
src/adapters/ai/claude.ts           the tasks, for either client
src/adapters/ai/clients.ts          Claude API or Bedrock client, from the environment
src/adapters/ai/prompts/            one file per task: system prompt, version, output schema
src/adapters/ai/fake.ts             deterministic stand-in (tests, local)
src/domain/ai/                      budget maths, price table, output validators (pure)
src/server/ai/usage.ts              logs each call, enforces the budget, kill switches
src/ports/identity.ts               was ports/letter-identity.ts, now for every person
src/adapters/identity/stripe.ts     was adapters/letter-identity/stripe.ts, now always with a selfie
src/adapters/identity/index.ts      Stripe, or the stand-in page at /dev/identity (development and
                                      the test copy)
src/domain/identity/                names.ts (does a name match?), access.ts (is a chosen renter's
                                      identity done? may this letter publish yet?)
src/copy/identity.ts                what each person sees about the check
src/server/identity/                identity.ts (start, consent, outcome, webhook, redaction, copies
                                      to workspaces and applications), renter.ts, staff.ts (more
                                      tries)
src/domain/documents/               requests.ts (what's asked, by how someone earns), checks.ts
                                      (recency, names, flags), pay.ts (pay periods to a month)
src/server/documents/               upload, read, confirm, share, view, keep, delete
src/server/viewings/mobile.ts       the booking's text code, reusing domain/verification/mobile.ts
src/jobs/tasks.ts                   + process_document, delete_documents; redact_identity moves to
                                      person rows
tests/evals/                        golden sets and runners, against the real model (not in CI)
```

## The AI

### Clients and configuration

| Setting | Values | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `fake`, `anthropic`, `bedrock` | Production accepts only `bedrock` (`src/lib/env.ts`, with a test) |
| `ANTHROPIC_API_KEY` | secret | The test copy and development only |
| `AWS_REGION` | `eu-west-1` | Production. The client signs with the Vercel project's AWS credentials |
| `AI_MODEL` | default `claude-opus-5-5` | Bedrock adds the `anthropic.` prefix |
| `AI_MONTHLY_BUDGET_USD` | number, default 100 | P4. In dollars, as both providers bill. The test copy uses 90, inside the $100 of credits |
| `AI_TASKS_OFF` | list | P8, for example `description,wording`, or `all` |

`inference_geo` isn't sent: the test copy uses the default global routing, and Bedrock's region comes from the endpoint. No `temperature`, `top_p` or `top_k` (rejected since API version `2026-10-21`). Thinking is adaptive and always on with Opus 5.5; the effort is set per task. Timeouts: 20 seconds for answers and the wording check, 60 for documents; two retries on 429, 5xx and connection errors (the SDK's defaults).

### The four tasks

Each task has a versioned prompt, a Zod output schema used with `messages.parse` and `zodOutputFormat` (as `adapters/ai/bedrock.ts` does today), and a validator in `domain/ai` that rejects anything the schema allows but the product rules don't.

| Task | Input | Output | Effort | Validation, then |
| --- | --- | --- | --- | --- |
| Answers (R8, P9) | The home's facts with IDs; the renter's questions, redacted, as quoted data | For each question: an answer and the fact IDs, or `null` | low | Existing guardrails: every cited fact exists, the protected-ground check, fixed answers. Then approval or sending |
| Description (M45, P10) | The structured facts the letter entered (type, rooms, heating, BER, outdoor space, floor area, appliances, accessibility, area name, availability) and their "other facts" | A description of 400 to 900 characters, and the IDs of the facts used | medium | `checkListingText` (no protected ground, no contact details, no scam wording); numbers in the text must match the facts. Then shown in the editor as drafted by AI |
| Wording check (ADR-0023, P12) | The listing's title and description, or an operator's answer | Findings: the exact phrase, the ground (a fixed list), why, and a rewording | low | Each phrase must appear word for word in the input; the ground must be on the list. Any finding holds the listing (`listing_holds` reason `unfair_wording`) |
| Reading a document (P37) | One document (an image, or a PDF of up to 10 pages) and the kind the renter said it is | The kind (a fixed list); the name on it; its date. By kind: the employer, pay date, pay period and take-home pay in cents (payslips); the employer, start date and pay (contracts and employer letters); the tax year and income (Revenue and accountant's documents); the amount and how often, or the balance (other income and savings) | low | Dates and amounts are plausible; no field may hold a PPS-number pattern or an IBAN (the output is refused, not cleaned); for other income, no payer or kind of payment. Then checked by `domain/documents/checks.ts` and shown to the renter to confirm |

The wording check's prompt carries the nine grounds plus housing assistance, the Equal Status Acts' test of indirect discrimination, and worked examples: "suits professionals", "no rent allowance", "ideal for a couple", "no DSS", "mature tenants preferred", "Irish citizens only", alongside fair wording that must not be flagged ("family bathroom", "suits up to three people", "no pets", "non-smoking"). That prefix is long enough to cache, so it carries `cache_control`.

The document prompt says what to read for each kind, and that everything else on the page is to be ignored. Statements of other income are the reason for the "no payer" rule: a payer such as the Department of Social Protection, or a payment's name, would reveal a protected ground (rule 3), so the schema has no field for it.

Prompt-injection stance, as in ADR-0009: the model has no tools, every input is quoted data, output is schema-checked, and nothing it returns is executed or sent without the checks above. A document is untrusted too: text on it saying "ignore your instructions" is just text on a document.

### Usage, budget and kill switches

Every call goes through `server/ai/usage.ts`, which writes a row to `ai_calls` (platform zone, no personal data):

| Column | Example |
| --- | --- |
| `task` | `answers`, `description`, `wording`, `document` |
| `provider`, `model`, `prompt_version` | `bedrock`, `anthropic.claude-opus-5-5`, `wording@1` |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | numbers |
| `cost_micros` | estimated from `domain/ai/prices.ts` (Opus 5.5: $4 and $20 per million tokens; Bedrock regional pricing configurable) |
| `latency_ms`, `outcome` | `ok`, `refused`, `invalid`, `timeout`, `error`, `over_budget`, `switched_off` |
| `organisation_id` | nullable, for cost per letter |

Before each call, the month's spend (cached for a minute) is compared with the budget. At 80% the founders get one email a month; at 100% the call is skipped with `over_budget` and the task falls back to people. Rows are deleted after 12 months.

### Evals

`pnpm evals [task]` runs each task's golden set against the configured provider and prints the cost estimate first; it needs `--confirm` to spend money. It isn't part of `pnpm check`. Golden sets are synthetic, in `tests/evals/fixtures/`.

| Task | Set | Pass mark |
| --- | --- | --- |
| Answers | 60 questions over 6 homes: answerable, partly answerable, unanswerable, protected-ground, injection attempts | No answer cites a fact it didn't use; at least 90% routed correctly; every injection ignored |
| Description | 30 homes | No protected-ground, contact or scam finding; no number or feature absent from the facts (checked by code, then a second model pass) |
| Wording | 80 unfair and 80 fair phrasings | At least 90% of unfair ones caught; no more than 5% of fair ones flagged |
| Documents | 48 synthetic documents: payslips (weekly, fortnightly, monthly), contracts, employer letters, Revenue and accountant's documents, pension, welfare and savings statements, and things that aren't any of these; PDFs and phone photos; half showing a PPS number | The kind right on at least 95%; take-home pay exact on at least 95%; no PPS number, IBAN or payer of other income in any output (100%) |

Results are saved under `tests/evals/results/` with the prompt version and model, and a prompt or model change is committed with its results.

## Identity, once per person

### The record

`identity_checks` (new, renter zone, `renterPolicy`): one row per person, whether they rent, let or both.

| Column | Notes |
| --- | --- |
| `user_id` | Primary key |
| `status` | `pending` (a Stripe session is open), `verified`, `not_verified` (the last attempt failed). `offline` remains only for checks recorded before Q60 |
| `selfie` | Whether the selfie was checked: always, since Q60. A check recorded without one has to be done again |
| `verified_name_sealed` | First and last name from Stripe, sealed (`src/lib/crypto.ts`) |
| `provider`, `provider_ref` | `stripe` (`stand_in` in development and on the test copy), and the VerificationSession, reused across a person's retries as Stripe advises |
| `attempts`, `reason` | Up to three, until a person at Gaff gives more (`identity.more_tries`); Gaff's reason code from Stripe's (`document`, `face_mismatch`, `gave_up`) |
| `consent_version`, `consented_at` | The selfie consent wording the person agreed to (P18) |
| `checked_at`, `provider_redacted_at` | The result's date; when Stripe was asked to redact |

`domain/identity/access.ts` decides what's done, with unit tests: identity is checked when the status is `verified` with a selfie (Q60). A letter's letting may start taking enquiries, and a listing go live under `missingChecks` (M22), only once their mobile and identity are checked (`startTakingEnquiries` refuses otherwise). Someone out of tries appears on `/staff/checks`, where a person at Gaff can give three more.

### Starting a check

1. Gaff's page explains the check (P18), with the consent wording next to one button, "Agree and check my ID". Pressing it records `consent_version` and `consented_at` with an `identity.consented` event.
2. `startIdentity` (`server/identity/identity.ts`) creates or reuses the person's VerificationSession: `type=document`; `options.document.require_matching_selfie` true; `require_live_capture=true`; `allowed_types` passport, driving licence and ID card; `return_url` to a letter's Settings, or for a renter to `/identity/done`, which shows nothing private, so their private link is never given to Stripe. `metadata[user_id]` and `metadata[check_id]` are opaque IDs, never names. The idempotency key is the check ID and the attempt number.
3. Stripe's hosted page does the rest, and offers a laptop user to carry on on their phone. No Stripe script loads on Gaff's pages (M103).
4. The webhook (`/api/webhooks/stripe-identity`, one route for everyone) verifies the signature, loads the check inside `withRenter(metadata.user_id)`, checks the session belongs to it, and asks Stripe for the session's state rather than trusting the payload (P54). The return page also asks, so the person rarely waits for the webhook.
5. With the secret key only, Gaff reads `status`, `last_error.code` and `verified_outputs.first_name` and `last_name`. It never expands `dob`, `id_number` or images, which need a restricted key Gaff doesn't have.
6. `consent_declined` doesn't count as one of the person's tries (P18). A failed attempt shows the reason in plain words and offers another try, up to three; after that, the person replies to any email from Gaff, and a person at Gaff gives three more (P25).
7. `redact_identity` runs 30 days after the result and redacts the session, as for landlords today; the webhook listens for `identity.verification_session.redacted`.

### When renters check

The same way for every renter, wherever they enquired:

1. When a letter chooses the preferred applicant and the backup (R18), each gets the existing checks email, with a link to their checks page (`r/[token]`), "A few checks before an offer".
2. The page asks a renter who isn't signed in to confirm their email with a 6-digit code (M76's sign-in). That links the application to their Gaff account and profile, so whatever they do here is kept for next time. A Daft or MyHome renter gets their account this way.
3. If their profile already has a verified identity, the page shows it as done (P29). Otherwise it shows the identity step, which goes to Stripe and returns to `/identity/done`, then back to the link in the email.
4. Documents and referees sit on the same page (P30 to P39). "Share" sends all of it at once (P39).

### A confirmed mobile to book a viewing

The booking page (`BookingSection`) asks for a mobile number, as today, but now sends a text code and books the slot only once it's confirmed (P16). The code rules in `domain/verification/mobile.ts` (expiry, attempts and daily sends) are reused by `server/viewings/mobile.ts`, with the code hashed and keyed to the application, so renters from Daft and MyHome need no account to book. The confirmed number becomes the application's `phone_e164`, with `mobile_confirmed_at`, and also gets the 2-hour text reminder (R13, changing Q12). On the test copy the code shows on screen until Sinch is set up (N3). A new booking needs the confirmed mobile (`bookViewing` refuses with `mobile_needed`); moving a booking doesn't ask again.

### Copies at each stage

- **Workspaces.** When a person is verified, or creates or joins a workspace already verified, `refreshCopies` (`server/identity/identity.ts`) writes or refreshes their `letter_checks` row for each of their workspaces (`method=id_document`, `passed`, the verified name, `checkedAt`). The row keeps no `providerRef`: the session belongs to the person's own record. Badges (M26) and readiness (M22) keep reading `letter_checks`, so nothing changes for them. Agents now need identity too (`missingChecks` adds `identity` for agency members). The staff licence queue shows the agent's verified name next to the register's (P24).
- **Applications.** When a renter is chosen, their checks are created as today (R18). The identity check is `to_do`, or filled from their record if they've checked before, or as soon as they do: `passed`, with the verified name and the date. The sealed result also says whether the verified name differs from the one they gave (P22). The event is `identity.shared`. Until the one "Share" step arrives with documents (P39), it reaches the letter as soon as it's checked, with the `checks` data group (M11, M12).

### Moving the landlords' check over

A migration copies each `letter_checks` row with `method=id_document` into `identity_checks` for its user (status, verified name, provider ref, redaction date), keeping the most recent if someone has more than one. The adapter, port and webhook move from `letter-identity` to `identity`, and `LETTER_IDENTITY_PROVIDER` becomes `IDENTITY_PROVIDER` (`stand_in` or `stripe`; production refuses `stand_in`). The renters' check stand-in (the test page on `r/[token]`) is replaced by the same stand-in page as landlords'.

### Cost

€1.25 per submitted verification in Ireland while Identity is in public beta, the first 50 free, charged whatever the outcome. Once per person: for renters, only those chosen, so at most about €2.50 a letting for the preferred applicant and the backup, and less as renters who've checked before are chosen again. Each letter costs the same, once. The weekly view (P58) shows the cost per letting.

## Work and income documents

### What's asked

`domain/documents/requests.ts`, from the application's `earning` (R16), with unit tests:

| How they earn | Asked for | Also |
| --- | --- | --- |
| `employed` | Three most recent payslips; or, if they started in the last three months, a contract or offer letter | The employer reference (built), or an uploaded employer's letter instead; the landlord reference |
| `self_employed` | The latest Notice of Assessment from Revenue, or an accountant's letter | The landlord reference |
| `other` | A statement of each regular income, or a savings statement showing only the balance | The landlord reference |

Anyone can add a statement of other income too. A renter who hasn't rented before, or is new to Ireland, gives a character reference instead of a landlord's (P42): the same email and fixed questions, worded for someone who knows them. Referees' details are kept with the documents if the renter ticks "keep" (P40).

### The pipeline

1. On the checks page, the renter picks files. The browser asks `server/documents/upload.ts` for a signed upload URL for each, after checking the type and size, and uploads straight to the private `documents` bucket (Supabase Storage in production; the database stand-in on the test copy). The renter's documents live in the renter zone (`renter_documents`), not yet shared with anyone.
2. `process_document` sniffs the bytes (PDF, JPEG or PNG), turns a photo upright, limits a PDF to 10 pages, and sends it to the document task with the kind the renter chose.
3. `domain/documents/checks.ts` turns the reading into flags (P38):
   - `kind_differs`: it isn't the kind asked for;
   - `name_differs`: the name doesn't match the verified name (`domain/identity/names.ts` handles accents, case, punctuation, Ó and O', Mc and Mac, and middle names);
   - `out_of_date`: the latest payslip is older than six weeks, a letter or statement older than three months, or a Revenue document older than the last two tax years;
   - `unreadable`.

   A flag tells the renter at once what to fix. It never blocks sharing. If the AI is off, over budget or can't read a document, the renter types what it says instead, and the letter sees it as entered by the renter (P5).
4. The file is encrypted with AES-256-GCM using `DATA_ENCRYPTION_KEY` and stored under a new key; the original upload is deleted. The reading is sealed into the row.
5. The renter sees each reading, corrects anything, and confirms. A correction sets `corrected_by_renter`. A statement of other income is deleted as soon as it's confirmed; only the sealed reading stays (P33).
6. **Sharing** (P39) is one action, `documents.shared`. For each work document, Gaff copies the encrypted object to a new key for the letting and writes a `check_documents` row in the organisation zone, with its own `delete_after`. Other income travels as a sealed reading only, with no file and no kind beyond "regular income". The landlord and employer references start at the same moment, as today.
7. `domain/documents/pay.ts` turns a pay period into a month for the letter's view, using the figure on the payslip: weekly × 52 ÷ 12, fortnightly × 26 ÷ 12, four-weekly × 13 ÷ 12, monthly as it is. It's shown as "about", next to the figure itself, and next to the household income from the application. It's arithmetic on the payslip, not an estimate of anyone's income, and nothing compares it with the rule.
8. A letter member opens a document through `/lettings/[id]/applications/[applicationId]/documents/[documentId]`. The route checks membership inside `withOrg`, decrypts, streams with `Cache-Control: no-store`, and records `document.viewed`. There's no route at all for other income.
9. `delete_documents` runs daily:
   - letters' copies at their `delete_after`: when the tenancy starts or the application closes, and 30 days after sharing at the latest (P41);
   - renters' copies once shared, unless kept (P40);
   - kept copies when they go out of date: payslips and letters three months after their date, Revenue documents after 12 months;
   - anything the renter removes, at once.

### Reference flags

When a renter names an employer's referee, an email at a common personal domain (gmail.com, outlook.com and the like, a list in `domain/documents/checks.ts`) is flagged to the letter: "Gaff sent this reference to a personal email address". It's never blocked: small employers often use one.

## Later: confirm with your bank

Not built now (P60, Q56). When it is, it sits behind its own port and returns an outcome, never an income figure:

```ts
interface BankConfirmation {
  readonly name: 'tink' | 'stand_in';
  /** A one-off, read-only link on the provider's own pages. */
  createLink(input: { checkId: string; returnUrl: string }): Promise<{ ref: string; url: string }>;
  /** Does pay of about this amount arrive at about this interval? Held in memory only. */
  confirmPay(
    ref: string,
    expected: { amountCents: number; period: PayPeriod },
  ): Promise<'confirmed' | 'not_found'>;
  /** Ends the provider's access and deletes what it holds for Gaff. */
  remove(ref: string): Promise<void>;
}
```

It needs Tink's enterprise terms for Income Check, its confirmed Irish bank list (PTSB, An Post Money and bunq especially), and a DPA. Tink is already approved (rule 10).

## Data model

| Change | Detail |
| --- | --- |
| `identity_checks` (new, renter zone, `renterPolicy`) | As above |
| `letter_checks` | `id_document` rows become copies of the person's record: no `providerRef` or `providerRedactedAt` for new rows. Migrated as above |
| `checks` | The identity check's sealed result holds the verified name, `nameDiffers` and the date. The `income` kind holds the shared documents' summary: `documentsSharedAt` and the flags |
| `applications` | `mobile_confirmed_at`, and the booking's text code (hashed, with its expiry and attempts), cleared once confirmed (migration 0036). The number is the existing `phone_e164`; `sms_reminders` follows the confirmed number (Q12) |
| `renter_documents` (new, renter zone, `renterPolicy`) | `user_id`, `kind` (`payslip`, `contract`, `employer_letter`, `revenue_statement`, `accountant_letter`, `other_income`), `storage_key` (null once deleted), `content_type`, `bytes`, `pages`, `status` (`processing`, `ready`, `deleted`), `reading_sealed`, `flags`, `document_date`, `corrected_by_renter`, `keep`, `delete_after`, `deleted_at` |
| `check_documents` (new, organisation zone, `tenantPolicy`) | `check_id`, `application_id`, `kind` (`other_income` has no file), `storage_key`, `reading_sealed`, `flags`, `document_date`, `corrected_by_renter`, `delete_after`, `deleted_at` |
| `ai_calls` (new, platform zone) | As above. No organisation data beyond the ID |
| `listing_holds` | `reasons` adds `unfair_wording`. New `wording_findings` (jsonb): the phrase from the letter's own words, the ground, why and a rewording, shown to the letter and to staff. Not personal data, so not sealed |
| Events | `booking.mobile_code_sent`, `booking.mobile_confirmed`, `identity.consented`, `identity.started`, `identity.decided`, `identity.redacted`, `identity.more_tries`, `identity.shared` (a workspace's copy keeps `letter_check.decided`), `document.uploaded`, `document.read`, `document.confirmed`, `documents.shared`, `document.viewed`, `document.deleted`, `listing.description_drafted`, `listing.wording_flagged`; platform: `ai.budget_warning`. IDs, codes, numbers and dates only, checked by the compliance suite. Person-zone events carry no organisation |

## Privacy and retention

| Data | Where | Kept | Deleted by |
| --- | --- | --- | --- |
| Identity result, verified name, selfie or not | `identity_checks`, sealed | As long as the account (P28) | Account deletion; the 2-year inactivity rule (Q25) |
| Copies of a letter's result | `letter_checks` | While they're a member | Leaving the workspace; account deletion |
| A chosen renter's result | `checks.result_sealed` | With the application (R26) | The retention job |
| Confirmed mobile | `applications.phone_e164` | With the application (R26) | The retention job |
| ID documents and selfies | Stripe | 30 days, then redacted; Stripe's own controller copy per its terms | `redact_identity`, and the privacy notice |
| The renter's documents | `documents` bucket, encrypted; `renter_documents` | Until shared, unless kept; kept ones until out of date | `delete_documents` |
| The letter's copies | `documents` bucket, encrypted; `check_documents` | Until the tenancy starts or the application closes, 30 days after sharing at most | `delete_documents` |
| Statements of other income | `documents` bucket, encrypted | Until the renter confirms the reading | `server/documents/confirm.ts`, at once |
| Readings | `renter_documents`, `check_documents`, sealed | With their row; on the letter's side, with the application | The retention job |
| AI prompts and outputs | Bedrock (production): not stored, invocation logging off. Claude API (test copy): per Anthropic's retention | — | — |
| AI usage | `ai_calls` | 12 months | A daily job |

## Security

- **Webhooks:** Stripe's signature (existing `verifyStripeSignature`); then Gaff fetches the state itself (P54).
- **No third-party scripts:** Stripe runs on its own pages; `script-src` stays `'self'` and the M103 test keeps passing. The return pages carry nothing in the URL but Gaff's own state.
- **Documents:** a private bucket, server-side reads only, encrypted with Gaff's key on top of the storage provider's own encryption, with no public or long-lived URL. The renter's and the letter's copies are separate objects, so deleting one never touches the other.
- **Limits (P55):** three ID attempts per person, ten uploads per check, and the existing rate limits per device.
- **Secrets:** `ANTHROPIC_API_KEY` exists only on the test copy; production's AWS credentials are scoped to `bedrock-mantle:CreateInference` on the allowed model in `eu-west-1`.

## Testing

- **Unit:** `names.ts` (fadas, Ó and O', Mc and Mac, middle names, married names), `access.ts` (each status and setting), `requests.ts`, `checks.ts` (each flag at its boundary), `pay.ts`, the AI validators (a phrase not in the input, a fact ID that doesn't exist, a number not in the facts, a PPS number or IBAN in a reading, a payer on other income), the budget maths, the Stripe adapter with a mocked `fetch` (a selfie always, `consent_declined`, retries on one session).
- **Integration:** each use case with the fake AI and the stand-in provider: the mobile code at booking (and no new booking without it), consent, attempts and more tries, an old check without a selfie done again, letters verified before a letting goes live, copies to workspaces when verified and on joining, sharing to an application, redaction, the migration from `letter_checks`, uploads and readings, sharing, deletion of each copy on its date, other income never reaching the organisation zone, and events without personal data.
- **End to end:** booking a viewing with a text code on a phone; a chosen renter checking their identity, uploading, confirming and sharing on one page; a Daft renter doing the same; the same renter chosen again, with identity already done; the letter's pack and opening a payslip; an agent's identity and licence; axe on every page; the existing journeys keep passing.
- **Compliance:** no column can hold a date of birth, document number, transactions or a payer of other income (a schema test); event payloads; no third-party scripts; production refuses `AI_PROVIDER=anthropic`, `IDENTITY_PROVIDER=stand_in` and the database storage provider; no route serves an `other_income` document.
- **Evals:** above, before every prompt or model change.
- **Sandboxes:** a manual contract test against Stripe test mode before each release that touches it.

## Delivery plan

| # | Milestone | Requirements | Needs |
| --- | --- | --- | --- |
| 1 | The Claude adapter on both clients, usage logging, budget, kill switches; answers on the real model; their evals | P1 to P9, P56 | An Anthropic API key on the test copy |
| 2 | Drafted descriptions and the wording check, with evals | P10 to P14 | — |
| 3 | Identity per person: the record, Stripe with a live selfie and no other way through (Q60), consent, more tries, the checks page and reuse on a later letting, the mobile code to book, letters verified before a letting goes live, copies to workspaces and applications, agents, redaction, the migration | P15 to P29 | Stripe test keys and the webhook on the test copy; a test-mode spike with Irish documents first |
| 4 | Documents: what's asked, upload, reading, flags, confirming, sharing, the letter's viewer, keeping, deletion; their evals | P30 to P41 | — |
| 5 | The letter's pack and fairness words; character references and guarantors; measures and alerts | P42 to P49, P58, P59 | — |
| 6 | Production readiness: Bedrock in Dublin and its evals, Stripe's live keys and DPA, the privacy notice, the DPIA, the solicitor's answers | P50 to P55, P57 | AWS account; solicitor; Stripe |

## Costs

| Item | Unit cost | When |
| --- | --- | --- |
| Answers | about €0.02 each | about €1 per letting |
| Description draft | about €0.03 | per draft |
| Wording check | about €0.01 | per publish or edit |
| Reading documents | about €0.02 a page | about €0.10 per chosen renter |
| Stripe Identity | €1.25 per verification (first 50 free), per attempt | once per person: at most about €2.50 a letting for chosen renters, and once per letter |
| Text codes | Sinch's price per text, a few cents | once per booking |

AI figures are estimates at Claude Opus 5.5's list price ($4 and $20 per million tokens); Bedrock's regional endpoint costs about 10% more than its global one. The $100 of API credits cover several thousand test calls.

## Risks and spikes

| Risk | Mitigation |
| --- | --- |
| A chosen renter doesn't finish their checks in time | One page, about five minutes; the existing reminders and chasers; the backup is checked at the same time (R18); the letter decides |
| Fake bookings and no-shows at viewings | A confirmed mobile to book, and text reminders (P16) |
| Stripe reads its terms as excluding housing | Gaff checks its own users, the same way for everyone, and the result never decides who gets a home. Daft uses Stripe Identity the same way. Another provider fits behind the same port (with approval, rule 10) |
| Stripe doesn't accept an Irish document (passport card, driving licence, Irish Residence Permit), or someone can't pass the selfie | A spike in test mode with each type before real people use it. There's no other way through for now (Q60): a person at Gaff can give more tries, and the share who can't get through is measured (P58) and brings Q61 back |
| Identity costs grow with sign-ups | The cost per new person in the weekly view; three attempts at most; ask Stripe for volume pricing after the beta |
| Forged payslips, the most common referencing fraud in the UK | Every renter's identity is checked, and documents must be in that name; the employer reference is a separate check; personal-email referees are flagged; Gaff says it can't detect forgeries. "Confirm with your bank" (P60) is ready to build |
| A work document shows something the letter shouldn't weigh, such as maternity pay | The reminder to letters (P47); statements of other income never reach them (P33) |
| The AI misreads a figure | The renter confirms or corrects each reading, and corrections are shown |
| PPS numbers on payslips reach letters, including for the backup (Q43) | Never read out or recorded; Gaff suggests covering it; deleted on schedule; the letter is told not to note it |
| Bedrock access to Opus 5.5 in `eu-west-1` needs approval | Request access as soon as the AWS account exists; the EU inference profile is the fallback |
| AI spend runs away | The budget and kill switches (P4, P8) |
| HAP and affordability (Q42) | Open; the solicitor and the founders before launch |

## ADRs

- **ADR-0025, the AI provider per environment and the AI's tasks** (Proposed): amends ADR-0009's provider section and its "nothing else" scope.
- **ADR-0026, identity once per person, and documents for chosen renters** (Proposed, revised): Stripe Identity for everyone, once, with a non-biometric alternative; documents read and checked by Claude, without an income estimate; no open banking at launch.

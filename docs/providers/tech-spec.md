# Replacing the stand-ins: technical specification

Draft, 8 November 2026 · CTO · goes with the [PRD](prd.md) (P1 to P48)

## Summary

The three stand-ins are replaced inside the existing monolith, behind the ports that already exist: the AI behind `ports/ai.ts`, ID and income checks behind `ports/checks.ts`. No new service runs alongside the app. The work adds:

- a Claude adapter that serves both the Claude API (test copy) and Claude on Bedrock in Dublin (production), with four tasks, usage logging, a budget and evals;
- Stripe Identity for chosen renters, reusing the landlord adapter, with an in-person alternative recorded by the letter;
- a Tink adapter that turns Tink's Income Check report into one monthly figure and then removes the connection, with TrueLayer behind the same port as the backup;
- a private, encrypted store for payslips, read by Claude and deleted on schedule.

Everything in [architecture.md](../architecture.md), the ADRs and the [marketplace specification](../marketplace/tech-spec.md) still holds unless this document says otherwise.

## Decisions

| # | Decision | Choice | Why | ADR |
| --- | --- | --- | --- | --- |
| 1 | Where the AI runs | The Claude API on the test copy and in development; Claude on Bedrock, `eu-west-1` in-region, in production. Production refuses anything else | Q37. The Claude API offers only global or US inference and US storage; Bedrock in Dublin keeps renters' data in the EU (ADR-0009) | 0025 |
| 2 | One adapter for both | `Anthropic` and `AnthropicBedrockMantle` expose the same Messages API, so one implementation of each task takes either client | Same prompts, same evals, one place to change | 0025 |
| 3 | Model | Claude Opus 5.5 for every task, effort set per task. A cheaper model per task is a founder decision once its evals pass | ADR-0009; quality first, cost is a few cents per call | 0025 |
| 4 | Refusals and failures | A refusal, timeout or invalid output falls back to people. No server-side model fallback | Rule 1 and P5; evals cover exactly the model that runs; Bedrock doesn't offer server-side fallback | 0025 |
| 5 | Renters' ID | Stripe Identity (document and selfie) or in person, recorded by the letter | Q38; the EU needs a non-biometric alternative | 0026 |
| 6 | Renters' income | Open banking through Tink's hosted pages (Tink Link) and its Income Check report, with TrueLayer as the backup behind the same port; or payslips read by Claude | Q39, Q40. Tink's Income Check covers Ireland and processes in the EU; no third-party scripts on Gaff's pages (M103) | 0026 |
| 7 | Payslips | Uploaded straight to private storage, then checked, read and encrypted by a job, as photos are (ADR-0021). Deleted 30 days after the result at the latest | Vercel's 4.5 MB request limit; the photo pipeline already works this way | 0026 |
| 8 | What's kept | Results only: the verified name and whether it matches, the monthly income and how it was found. Never transactions, dates of birth or document images | Rules 2, 3 and 9 | 0026 |

## The shape

```
Renter's checks page (r/[token])                Letter's Applications page
   │ start / consent / upload                         │ see results, open payslips, record "seen in person"
   ▼                                                  ▼
server/checks ── identity ──► ports/checks ──► adapters/checks/stripe-identity ──► Stripe (hosted)
      │       ── income ────► ports/checks ──► adapters/checks/tink | truelayer ──► Tink Link (hosted)
      │       ── payslips ──► ports/storage (private bucket) ─► job process_document ─► ports/ai (read)
      ▼
domain/checks  (name match, monthly income, payslip maths, rule ratio)     webhooks ─► server/checks

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
src/adapters/checks/stripe-identity.ts  shared with landlords' checks (moved from letter-identity)
src/adapters/checks/tink.ts         Tink Link and Income Check (Q39)
src/adapters/checks/truelayer.ts    the backup, behind the same port, built only if needed
src/adapters/checks/stand-in.ts     the development stand-in, as today
src/domain/checks/names.ts          does the verified name match the applicant's?
src/domain/checks/income.ts         regular monthly income from incoming payments; payslip maths
src/server/checks/identity.ts       consent, start, outcome, in person, redaction
src/server/checks/income.ts         bank connection, payslips, the renter's confirmation
src/server/checks/documents.ts      upload, read, view, delete
src/jobs/tasks.ts                   + process_document, fetch_bank_income, redact_identity_sessions,
                                      delete_check_documents
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
| `AI_MONTHLY_BUDGET_EUR` | number | P4. The test copy starts at 80 (about $100 of credits) |
| `AI_TASKS_OFF` | list | P8, for example `descriptions,wording` |

`inference_geo` isn't sent: the test copy uses the default global routing, and Bedrock's region comes from the endpoint. No `temperature`, `top_p` or `top_k` (rejected since API version `2026-10-21`). Thinking is adaptive and always on with Opus 5.5; the effort is set per task. Timeouts: 20 seconds for answers and the wording check, 60 for payslips; two retries on 429, 5xx and connection errors (the SDK's defaults).

### The four tasks

Each task has a versioned prompt, a Zod output schema used with `messages.parse` and `zodOutputFormat` (as `adapters/ai/bedrock.ts` does today), and a validator in `domain/ai` that rejects anything the schema allows but the product rules don't.

| Task | Input | Output | Effort | Validation, then |
| --- | --- | --- | --- | --- |
| Answers (R8, P9) | The home's facts with IDs; the renter's questions, redacted, as quoted data | For each question: an answer and the fact IDs, or `null` | low | Existing guardrails: every cited fact exists, the protected-ground check, fixed answers. Then approval or sending |
| Description (M45, P10) | The structured facts the letter entered (type, rooms, heating, BER, outdoor space, floor area, appliances, accessibility, area name, availability) and their "other facts" | A description of 400 to 900 characters, and the IDs of the facts used | medium | `checkListingText` (no protected ground, no contact details, no scam wording); numbers in the text must match the facts. Then shown in the editor as drafted by AI |
| Wording check (ADR-0023, P12) | The listing's title and description, or an operator's answer | Findings: the exact phrase, the ground (a fixed list), why, and a rewording | low | Each phrase must appear word for word in the input; the ground must be on the list. Any finding holds the listing (`listing_holds` reason `unfair_wording`) |
| Payslip reading (P30) | One page as an image or PDF | Is it a payslip; is a PPS number visible; pay date; pay period; net pay in cents | low | Dates and amounts are plausible; a visible PPS number deletes the page. Then shown to the renter to confirm |

The wording check's prompt carries the nine grounds plus housing assistance, the Equal Status Acts' test of indirect discrimination, and worked examples: "suits professionals", "no rent allowance", "ideal for a couple", "no DSS", "mature tenants preferred", "Irish citizens only", alongside fair wording that must not be flagged ("family bathroom", "suits up to three people", "no pets", "non-smoking"). That prefix is long enough to cache, so it carries `cache_control`.

Prompt-injection stance, as in ADR-0009: the model has no tools, every input is quoted data, output is schema-checked, and nothing it returns is executed or sent without the checks above.

### Usage, budget and kill switches

Every call goes through `server/ai/usage.ts`, which writes a row to `ai_calls` (platform zone, no personal data):

| Column | Example |
| --- | --- |
| `task` | `answers`, `description`, `wording`, `payslip` |
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
| Payslips | 24 synthetic payslips (weekly, fortnightly, monthly; PDF and photos), 8 with a visible PPS number | Net pay exact on at least 95%; every visible PPS number caught |

Results are saved under `tests/evals/results/` with the prompt version and model, and a prompt or model change is committed with its results.

## Checking a chosen renter's identity

- **Adapter:** the Stripe Identity adapter moves from `adapters/letter-identity` to `adapters/checks/stripe-identity.ts` and serves both landlords (M24) and renters. Sessions carry `metadata[subject]` (`letter_check` or `renter_check`), `metadata[check_id]` and `metadata[organisation_id]`, and the one webhook route (`/api/webhooks/stripe-identity`) dispatches on the subject. Sessions are `type=document` with `require_matching_selfie`, allowed types passport, driving licence and ID card.
- **Reading the result:** with the secret key only, Gaff reads the status, the error code and `verified_outputs.first_name` and `last_name`. It never expands `dob`, `id_number` or images, which need a restricted key Gaff doesn't have.
- **Consent:** the renter's checks page shows the explanation and a consent checkbox (not ticked). Ticking it records `consentedAt` and the wording's version on the check, with a `check.consented` event, before the session starts. `consent_declined` from Stripe moves the renter to the in-person route.
- **In person:** a letter member records "I've seen an original photo ID" and the name on it, on the Applications page. The check becomes `passed` with method `in_person` and `recordedBy`; the event is `check.recorded_in_person`.
- **Name match:** `domain/checks/names.ts` normalises both names (accents, case, punctuation, Ó and O', Mc and Mac) and matches when the verified first and last names both appear in the applicant's name, allowing middle names. The result is `matches` or `differs`; a person decides either way.
- **Attempts:** `checks.attempts` counts sessions; the fourth start offers the in-person route instead (P21, P44).
- **Redaction:** the daily job `redact_identity_sessions` redacts renters' sessions 30 days after their result, as for landlords, and records `redactedAt`. The webhook subscribes to `identity.verification_session.redacted`.
- **Gate:** `IDENTITY_PROVIDER=stripe` is accepted in production only with `RENTER_ID_STRIPE_CONFIRMED=1`, which is set once Stripe confirms the use in writing (Q44, P23). Until then production offers in person only.
- **Cost:** €1.25 per submitted verification in Ireland while Identity is in public beta there, the first 50 free; charged whatever the outcome, so attempts are capped.

## Checking a chosen renter's income

### Open banking

Tink is the provider (Q39), with TrueLayer as the backup. The port hides which one runs:

```ts
interface OpenBankingProvider {
  readonly name: 'tink' | 'truelayer' | 'stand_in';
  /** A one-off, read-only link on the provider's own pages. */
  createLink(input: { checkId: string; returnUrl: string }): Promise<{ ref: string; url: string }>;
  /** After the renter comes back: what the provider found. Held in memory only. */
  readIncome(ref: string, callback: URLSearchParams): Promise<IncomeEvidence>;
  /** Ends the provider's access and deletes what it holds for Gaff, where it can. */
  remove(ref: string): Promise<void>;
}
type IncomeEvidence =
  /** Tink Income Check: one entry per income stream; the stream's label is dropped here. */
  | { kind: 'streams'; streams: Array<{ monthlyMedianCents: number; monthsSeen: number }> }
  /** TrueLayer: the incoming payments themselves, for Gaff to work out. */
  | { kind: 'payments'; payments: Payment[] };
interface Payment {
  date: string;
  amountCents: number;
  currency: string;
  kind: 'income' | 'transfer_own' | 'loan' | 'refund' | 'other';
  /** Groups regular payments from one payer, then dropped. */
  payerKey: string;
}
```

1. The renter presses **Connect my bank**. The server asks Tink for a one-off Income Check link (Tink Link, Tink's hosted pages, so no third-party script runs on Gaff) and redirects.
2. The renter picks their bank, signs in there, and consents to Tink reading their accounts once, for this check.
3. Tink redirects to `/checks/bank/return` with a one-time code. The server records the reference and queues `fetch_bank_income`; the page says it's reading payments and refreshes itself.
4. The job fetches the Income Check report for the last three months into memory, turns it into one figure with `domain/checks/income.ts`, stores only the result, and calls `remove` at once. Streams, labels and transactions never touch the database or the logs.
5. The renter sees the figure, adds any declared other income, and sends it. The check becomes `passed` (a figure was found) or `not_passed` with `no_regular_income`; neither says anything about the rule, which the letter's view applies.

**One monthly figure** (`monthlyIncome(evidence)`, unit-tested on synthetic reports):
- From Tink's streams: the sum of each regular stream's monthly median over the last three months, counting salary, pension and benefits alike. The labels Tink attaches ("Pension", "Benefits", child support) are dropped before anything is stored, because they reveal age, family status or disability.
- From TrueLayer's payments: drop transfers between the renter's own accounts, loans and refunds; keep income the provider classifies as income, plus payments from one payer in at least two of the three months; sum each complete month; take the median month.
- Fewer than two months of regular income gives `no_regular_income`. HAP is paid to the landlord, so it never appears; the renter adds it, if they want to, as declared income (P28).

Before building: Tink's quote and enterprise terms for Income Check, its confirmed Irish bank list (PTSB, An Post Money and bunq especially), one-off consent in Ireland, its webhook signing, and whether Gaff must register as Tink's agent. Tink AB is licensed in Sweden and passported to Ireland; it acts as controller for the account access, and its DPA keeps data in the EEA unless agreed otherwise.

### Payslips

1. The renter picks up to three files. The browser asks for a signed upload URL for each (`server/checks/documents.ts`), checking type and size first, and uploads straight to the private `check-documents` bucket (Supabase Storage in production; the database stand-in on the test copy).
2. `process_document` sniffs the bytes (PDF, JPEG, PNG), limits a PDF to three pages, and sends each page to the payslip task.
3. A page that isn't a payslip, or that shows a PPS number, is deleted at once, and the renter is told what to fix.
4. A payslip is encrypted with AES-256-GCM using `DATA_ENCRYPTION_KEY` and stored under a new name; the original upload is deleted. Its figures are sealed into a `check_documents` row.
5. `domain/checks/income.ts` turns the payslips into a monthly figure: weekly × 52 ÷ 12, fortnightly × 26 ÷ 12, four-weekly × 13 ÷ 12, monthly as is; the average of the payslips sent.
6. The renter confirms or corrects each figure and sends them. Corrections are flagged to the letter.
7. A letter member opens a payslip through `/lettings/[id]/applications/[applicationId]/documents/[documentId]`, which checks membership inside `withOrg`, decrypts, streams with `Cache-Control: no-store`, and records `document.viewed`.
8. `delete_check_documents` deletes payslips at their `delete_after`: 30 days after the result, or when the application closes or the tenancy starts.

## Data model

| Change | Detail |
| --- | --- |
| `checks` | Add `method` (`stripe`, `in_person`, `open_banking`, `payslips`), `attempts`, `consented_at`, `consent_version`, `recorded_by`, `redacted_at`, `connection_removed_at`. The sealed result gains `nameMatch`, `incomeSource`, `monthsCovered`, `declaredOtherIncomeCents` and `correctedByRenter` |
| `check_documents` (new, organisation zone, `tenantPolicy`) | `check_id`, `kind` (`payslip`, `employer_letter`), `storage_key`, `content_type`, `bytes`, `pages`, `status` (`processing`, `ready`, `rejected`, `deleted`), sealed figures, `read_by` (`ai`, `renter`), `delete_after`, `deleted_at` |
| `ai_calls` (new, platform zone) | As above. No organisation data beyond the ID |
| `listing_holds.reasons` | Adds `unfair_wording`, with the findings sealed for staff |
| Events | `check.consented`, `check.attempted`, `check.recorded_in_person`, `check.redacted`, `check.connection_removed`, `check.confirmed_by_renter`, `document.uploaded`, `document.rejected`, `document.read`, `document.viewed`, `document.deleted`, `listing.description_drafted`, `listing.wording_flagged`; platform: `ai.budget_warning`. IDs, codes, numbers and dates only, checked by the compliance suite |

## Privacy and retention

| Data | Where | Kept | Deleted by |
| --- | --- | --- | --- |
| Verified name, name match, ID result | `checks.result_sealed` | With the application (R26) | The retention job |
| ID documents and selfies | Stripe | 30 days, then redacted; Stripe's own controller copy per its terms (biometrics up to a year) | `redact_identity_sessions`, and the privacy notice |
| Bank transactions and income streams | Memory, for seconds | Never stored | — |
| The bank connection and Income Check report | Tink (as controller for the account access) | Minutes | `remove`, straight after the figure; Tink's own retention per its terms |
| Monthly income, declared other income | `checks.result_sealed` | With the application | The retention job |
| Payslips | `check-documents` bucket, encrypted | 30 days after the result at most | `delete_check_documents` |
| Payslip figures | `check_documents`, sealed | With the application | The retention job |
| AI prompts and outputs | Bedrock (production): not stored, invocation logging off. Claude API (test copy): per Anthropic's retention | — | — |
| AI usage | `ai_calls` | 12 months | A daily job |

## Security

- Webhooks: Stripe's signature (existing `verifyStripeSignature`), and Tink's; then Gaff fetches the state itself (P43).
- No third-party scripts: Stripe and Tink run on their own pages; `script-src` stays `'self'` and the M103 test keeps passing. The return pages carry no secrets in the URL beyond the provider's one-time code.
- Payslip storage: private bucket, server-side reads only, encrypted with Gaff's key on top of the storage provider's own encryption, no public or long-lived URL.
- Limits (P44): per check, three Stripe sessions, three bank connections and five uploads; per IP, the existing rate limits.
- Secrets: `ANTHROPIC_API_KEY` exists only on the test copy; production's AWS credentials are scoped to `bedrock-mantle:CreateInference` on the allowed model in `eu-west-1`.

## Testing

- **Unit:** `names.ts`, `income.ts` (regular income across messy months, own transfers, loans, a missing month; payslip periods), the AI validators (a phrase not in the input, a fact ID that doesn't exist, a number not in the facts), the budget maths, the adapters with a mocked `fetch`.
- **Integration:** each use case with the fake AI and stand-in providers: consent, attempts, in person, redaction, connection removal, document deletion, events without personal data.
- **End to end:** the renter's journeys on a phone with stand-ins (Stripe and the bank as test pages, the fake AI reading payslips), the letter's view, axe on every page; the existing journeys keep passing.
- **Compliance:** no column can hold transactions or dates of birth (a schema test); event payloads; no third-party scripts; production refuses `AI_PROVIDER=anthropic` and the stand-ins.
- **Evals:** above, before every prompt or model change.
- **Sandboxes:** a manual contract test against Stripe test mode and Tink's sandbox before each release that touches them.

## Delivery plan

| # | Milestone | Requirements | Needs |
| --- | --- | --- | --- |
| 1 | The Claude adapter on both clients, usage logging, budget, kill switches; answers on the real model; their evals | P1 to P9 | An Anthropic API key on the test copy |
| 2 | Drafted descriptions and the wording check, with evals | P10 to P14 | — |
| 3 | Renters' ID: consent, Stripe in test mode, in person, name match, redaction | P15 to P23 | Stripe test keys and the webhook on the test copy |
| 4 | Open banking: the Tink adapter, the income maths, the renter's confirmation | P24 to P28 | Tink sandbox credentials; Tink's quote and terms |
| 5 | Payslips: upload, reading, viewer, deletion | P29 to P33 | — |
| 6 | The letter's results view and fairness words; measures and alerts | P34 to P38, P47, P48 | — |
| 7 | Production readiness: Bedrock in Dublin and its evals, DPAs, privacy notice, DPIA, Stripe's confirmation | P39 to P46 | AWS account; solicitor; Stripe |

## Costs

| Item | Unit cost | Per letting (2 chosen renters, 40 enquiries) |
| --- | --- | --- |
| Answers | about €0.02 each | about €1 |
| Description draft | about €0.03 | €0.03 |
| Wording check | about €0.01 per publish or edit | €0.03 |
| Payslip reading | about €0.02 a page | up to €0.12 |
| Stripe Identity | €1.25 per verification (first 50 free) | up to €2.50 |
| Open banking | Tink Income Check, enterprise pricing on quote (TrueLayer quoted as a check) | — |

AI figures are estimates at Claude Opus 5.5's list price ($4 and $20 per million tokens); Bedrock's regional endpoint costs about 10% more than its global one. The $100 of API credits cover several thousand test calls.

## Risks and spikes

| Risk | Mitigation |
| --- | --- |
| Stripe's terms forbid this use (Q44) | Ask first; build behind the gate; in person works without Stripe |
| Stripe doesn't accept an Irish document (passport card, driving licence) | A spike in test mode with each document type before milestone 3 ships |
| Bedrock access to Opus 5.5 in `eu-west-1` needs approval | Request access as soon as the AWS account exists; the EU inference profile is the fallback |
| Open banking coverage or conversion is poor for some banks; most credit unions can't be connected at all | Payslips are always offered; never treat not connecting as a negative; measure the share by bank |
| Tink's enterprise terms are out of reach before launch | TrueLayer behind the same port, with Gaff working out the figure from payments |
| The income maths misreads irregular income (self-employed, shift work) | Show the renter the figure before it's shared; let them add declared income; the letter decides |
| A payslip shows a PPS number the model misses | Evals with a 100% pass mark on PPS numbers; renters are told to cover it; the letter is told not to note it |
| AI spend runs away | The budget and kill switches (P4, P8) |
| HAP fairness (Q42) | Declared income, the letter's reminder, the solicitor's answer before launch |

## ADRs

- **ADR-0025, the AI provider per environment and the AI's tasks** (Proposed): amends ADR-0009's provider section and its "nothing else" scope.
- **ADR-0026, checking chosen renters** (Proposed): Stripe Identity or in person; open banking or payslips; what's kept.

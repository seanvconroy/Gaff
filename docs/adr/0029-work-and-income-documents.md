# ADR-0029: Chosen renters show their work and income with documents

- Status: Accepted (BA-16, from the live line's ADR-0026 and P30 to P49; the founder's decisions of 8 November 2026 there, Q49, Q50, Q53, confirmed for the one project on 19 November, Q51)
- Date: 2026-11-20

## Context

The preferred applicant and the backup were asked to "check their income" with an open-banking stand-in that returned a monthly figure (`IncomeResult`). Sean decided on the other line that chosen renters show their work and income with the documents Irish letters already ask for, read and checked by Claude, with no income estimate, no bank statements and no open banking at launch. It was specified there (P30 to P49) and never built.

Documents are the most sensitive data Gaff will hold. A statement of other income (a pension, a social welfare payment, maintenance) can show age, disability, family status or the housing assistance ground, which covers HAP, rent supplement and any social welfare payment (rule 3). A payslip can show a PPS number (Q50). A document can't have its names stripped before the model reads it (rule 7).

## Decision

**What's asked depends only on how the renter said they earn** (`src/domain/documents/requests.ts`), from a fixed list a letter can't add to (Q53): three payslips, or a contract for a new job; a Revenue Notice of Assessment or an accountant's letter; a statement of each regular payment, or a savings statement showing only the balance. Never bank statements.

**Two zones, so other income can't reach a letter by construction.**
- The renter's own copy is `renter_documents`, with no `organisation_id` and its own policy (`applicantPolicy()`): a row is visible only to a transaction scoped to its application by `scopeToApplicant()`, which only `src/server/documents/renter.ts` calls, in the renter's own request from their private link; or to the person who keeps it, through `withPerson()`. `withOrg()` sets neither. A compliance test holds both.
- The letter's copy is `check_documents`, a tenant table. Its kinds are the work kinds and `regular_income`; it can't name other income, and a database constraint refuses a regular income row with a file. There is no route to open one, and the one route that opens documents refuses its kind.

**Files.** Read by their bytes (PDF, JPG or PNG, 10 MB, 10 pages counted from the PDF's own page tree, inflating compressed streams with `node:zlib`, so no new dependency). A photo is made again upright with no metadata (sharp, as for homes' photos). Each file is encrypted with `DATA_ENCRYPTION_KEY` (AES-256-GCM) and kept under a key that names nobody, in a document store of its own (`src/ports/document-store.ts`): a system-only table locally, a private Supabase bucket in Ireland in production, never the photos' bucket. Browsers send to the bucket with a signed upload; Gaff reads, encrypts under a new key and deletes the original at once. The letter's copy is a separate object.

**Reading** is the `document` task of the one AI adapter (ADR-0017), through `runAi`, logged without its words and kept to the budget and the switch. It returns fields only: the kind, the name, the date, the employer (work documents only), an amount with how often or a balance, and a tax year. `checkDocumentReading` refuses (never cleans) a reading with a PPS number, an IBAN or any long number in a field, or a payer on other income. A refused or missing reading is "not read": a person at the letting agency looks at a work document, and for other income the renter enters the amount (P5).

**Rule 7, for documents.** The rule strips names and contact details from text before it reaches the model. A document can't be stripped: its words are in its pixels, and reading the name on it is the point. So the file goes alone, with only the kind the renter said and today's date, never their name or anything else about them; the name is matched by Gaff's own code (`namesMatch`), not the model. In production it goes only to Claude on Bedrock in the EU (Dublin), with invocation logging off, under AWS's DPA; the Claude API serves the test copy and development with made-up documents only, as `src/lib/env.ts` already enforces. The model has no tools, everything on the page is data, and what comes back is checked before anyone sees it.

**Checks and words** (P38, P44 to P47). Each document is checked at once: the kind asked for, the name on the ID, recent enough (the newest payslip within six weeks, letters and statements within three months, Revenue within the last two tax years). The renter sees what to fix in `warning`; nothing blocks sharing. The letter sees, in words, what each document shows ("about €3,207 a month" is arithmetic on the figure printed), beside the household income given, with flags in `warning` and what to do; never a score, a ratio or a "pass". Wherever a letter sees income, the fixed reminder that the decision is theirs and that refusing someone for HAP, rent supplement or any social welfare payment is unlawful.

**Sharing in one step** (P39). The renter's page goes: their ID check (as built), their referees' names, then their documents, ending with one screen that shows exactly what will be shared and shares it: the documents, and the referees, whom Gaff emails then. The ID check reaches the letter when it passes, as built (ADR-0020).

**Deletion** (P40, P41, P49, rule 9). Every row carries a date and the nightly job keeps to it: an unshared upload after 30 days; the renter's copy at sharing, unless they ticked "Keep these documents for my next application" (unticked, signed in only), and then when out of date (three months after its date, twelve for Revenue); a statement of other income at sharing, always; the letter's file when the tenancy starts or the application closes, and 30 days after sharing at the latest; the readings with the application's personal data; kept documents with the profile.

## Consequences

- The income stand-in, `IncomeResult`, `INCOME_PROVIDER` and the "I'd rather send payslips" link are gone. New settings: `DOCUMENT_STORE`, `DOCUMENT_BUCKET`.
- Referees are emailed when the renter shares, not when they're named.
- The operator's check line for work and income is "Documents shared on …", with a page for each chosen renter; the owner sees only that documents were shared with the letting agent.
- Forged documents aren't detected; Gaff says so. "Confirm with your bank" (the live line's P60) stays for later.
- Reading takes up to a minute while the renter waits (a request, not a job); a renter can leave and come back.

## Alternatives considered

- **Keeping the renter's working copy in the organisation's zone, hidden by code.** Simpler, but one careless query would show an operator a pension statement. Rejected for rule 3.
- **Reading in a background job.** Matches the live specification, but the renter would watch a page refresh; reading inline with a one-minute limit is simpler and the stand-in is instant.
- **A PDF library to count pages.** A new dependency for one number; the page tree and its streams give it.

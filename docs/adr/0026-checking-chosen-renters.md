# ADR-0026: Checking chosen renters' identity and income

- Status: Proposed (with the [providers PRD](../providers/prd.md), 8 November 2026)
- Date: 2026-11-08

## Context

R18 runs ID and income checks for the preferred applicant and the backup only. Until now they've been stand-ins: a test page on the test copy, and "the letter arranges it" in production. The Data Protection Commission accepts documents showing ability to pay, and ID, from people who are entering a tenancy, not from every applicant. Selfie matching is biometric data (GDPR Article 9), so it needs explicit consent and, in the EU, a non-biometric alternative. Housing assistance such as HAP is paid to the landlord, so it never shows in a renter's bank account. Income categories from a bank (pension, benefits, child support) reveal age, family status or disability.

## Decision

**Identity (Q38).** The renter chooses between Stripe Identity (a document and a selfie) and showing an original photo ID to the letter in person, which the letter records. Before Stripe, Gaff explains the selfie and asks for explicit consent; declining leads to the in-person route, never to a failed check. From Stripe, Gaff reads only the status and the verified first and last names, with the secret key (never the date of birth, document number, issuing country or images), and keeps the result, the name, whether it matches the applicant's name, and the date. Sessions are redacted 30 days after their result. The landlord and renter checks share one adapter and one webhook. Renters' Stripe checks go live in production only after Stripe confirms in writing that its terms allow the use (Q44).

**Income (Q39, Q40).** The renter chooses between connecting their bank and uploading payslips.
- **Bank:** Tink Link and Tink's Income Check, one-off and read-only, on Tink's own pages. Gaff turns the report into one monthly figure, counting every regular income alike, drops the stream labels in memory, and removes the connection straight away. TrueLayer sits behind the same port as the backup, with Gaff working out the figure from incoming payments.
- **Payslips:** uploaded straight to a private bucket, then a job checks them, Claude reads the figures, and the job encrypts them with Gaff's key. A page showing a PPS number is deleted at once, and the renter is asked to cover it. The letter can open payslips until they're deleted, 30 days after the result at the latest.
- **Declared income:** in both routes the renter can add income that isn't in the account or on the payslips, such as housing support, as one declared amount. Nothing records what it is (Q17).

**Results.** Income is shown against the letter's rule in words, in `warning` when below it, with a reminder that housing support counts and is paid to landlords directly. No result rejects anyone or moves an application: the letter decides (rule 1).

## Consequences

- Two vendors join for renters' data, Stripe (extended from landlords) and Tink, each needing a DPA, a transfer basis and a place in the privacy notice. Tink's Income Check is sold on enterprise terms.
- Gaff now holds documents for the first time (payslips), for at most 30 days after the result, encrypted, with every view logged.
- Most credit unions can't be connected by any provider, so payslips must stay an equal route.
- The DPIA must cover biometric and financial data before the first real renter.

## Alternatives considered

- **Plaid.** The founder's first suggestion. It supports Ireland for transactions, but its income product isn't offered in Ireland yet, it stores European data in the US, and its EU plans need a minimum commitment. Revisit if Plaid Income reaches Ireland.
- **TrueLayer as the main provider.** Authorised by the Central Bank of Ireland, with data in Ireland and the UK, but no income report, so Gaff would infer income from raw transactions. Kept as the backup.
- **Document-only ID checks.** No biometric data, but they don't show the person holding the document is the renter.
- **No uploads, open banking only.** It would leave out people whose bank or credit union can't be connected.

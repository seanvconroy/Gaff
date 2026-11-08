# ADR-0026: Identity once per person, and documents for chosen renters

- Status: Proposed (with the [providers PRD](../providers/prd.md), 8 November 2026, revised the same day after Sean's review). Amends ADR-0022.
- Date: 2026-11-08

## Context

Until now, identity was checked per workspace (private landlords only, M24) and per letting (the preferred applicant and the backup, R18). Income was a stand-in, and the first draft of this ADR turned open banking into a monthly income figure.

Sean's review on 8 November 2026 changed four things:
- everyone checks their identity once, as part of their Gaff profile: renters before their first enquiry, letters before their first listing;
- Gaff doesn't wait for Stripe's written confirmation;
- an income estimate isn't needed;
- a payslip showing a PPS number is accepted.

Research the same day found that Irish letters ask chosen renters for photo ID, payslips, an employer's reference and a previous landlord's reference. The Data Protection Commission accepts documents showing someone can pay, but only from the person being offered the home, and never asks for transactions. Open banking is rare in Ireland. Daft checks its users with Stripe Identity. The housing assistance ground in the Equal Status Acts covers HAP, rent supplement and any social welfare payment. Selfie matching is biometric data (GDPR Article 9), so it needs explicit consent and, in the EU, an alternative.

## Decision

**Identity belongs to the person (Q48).**
- One `identity_checks` row per person, in the renter zone, checked with Stripe Identity: a document, and a selfie with explicit consent, or the document alone.
- Renters check before their first enquiry on Gaff, behind a setting (`RENTER_ID_AT`) that can move it to "when chosen". Daft and MyHome renters check when they're chosen.
- Letters, agents included, check before their first listing goes live. An agent's verified name must match their PSRA licence.
- Each workspace gets a copy for its badges and readiness, so ADR-0022's `letter_checks` keeps working. Each application gets a copy when the renter is chosen, and not before (rule 2, M11).
- Without a selfie, or when the ID can't be checked online, a chosen renter shows their ID to the letter in person, and a letter's first listing is reviewed by a person at Gaff. Nobody is shut out by the document they hold.
- From Stripe, Gaff reads only the status and the verified names, with the secret key. It keeps the result, the name, whether a selfie was checked and the date, and redacts the session 30 days after its result. The check lasts as long as the account.

**Work and income are shown with documents, not estimated (Q49, Q50).**
- What's asked depends on how the renter earns: payslips, or a contract for a new job; a Revenue Notice of Assessment or an accountant's letter; or statements of other income or savings. Employer and landlord references are sent as before.
- Documents are uploaded straight to a private bucket. A job reads them with Claude (the kind, name, date, employer and pay, never a PPS number) and checks they're the kind asked for, recent and in the verified name. It then encrypts them with Gaff's key.
- The renter confirms what was read and shares everything in one step. The letter's copy is a separate object, deleted when the tenancy starts or the application closes, and 30 days after sharing at the latest. The renter can keep their own copy until it's out of date.
- Statements of other income never reach letters. Gaff reads the amount, how often and the date, deletes the statement, and the letter sees "regular income", unlabelled (rule 3).
- No score, no ratio and no estimate: the letter reads the evidence and decides (rule 1). Payslips are converted to a month only as arithmetic on the figure printed.

**No open banking at launch.** A later "Confirm with your bank" through Tink would check payslips against payments and keep only the outcome.

## Consequences

- Every renter's first enquiry gains a two-minute step. The drop-off at it is measured from day one, and the setting can move the check without a rebuild.
- Identity costs about €1.25 per new person, once, and grows with sign-ups rather than lettings.
- Agents check their identity for the first time.
- Gaff now holds documents (encrypted, deleted on schedule, every view logged) and reads them with the AI in the EU in production.
- Forged documents aren't detected. Checked identities, matching names, references and the later bank confirmation are the defences.
- The landlords' check moves from `letter-identity` to `identity`, with a migration.
- The DPIA must cover biometric data and documents before the first real person checks.

## Alternatives considered

- **Checking identity per letting, only for chosen renters** (the first draft). The least data, but renters repeat it for every home, and letters get no assurance until the end.
- **Selfie only, no alternative.** Simpler, but EU law, and Stripe's own guidance, call for a non-biometric route, and consent would not be freely given.
- **Open banking with an income figure** (Tink, the first draft). Hard to forge, but rare in Ireland, sold on enterprise terms, unable to reach most credit unions, and an estimate Sean doesn't want.
- **Letters see every document.** Familiar, but statements of other income reveal protected grounds, including the housing assistance ground.
- **Gaff reads every document and letters see none.** The most private, but letters expect to see payslips, and Gaff would be vouching for figures it can't verify.

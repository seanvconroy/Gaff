# ADR-0026: Identity once per person, and documents for chosen renters

- Status: Proposed (with the [providers PRD](../providers/prd.md), 8 November 2026, revised the same day after Sean's review, and again for one verification standard, Q60). Amends ADR-0022.
- Date: 2026-11-08

## Context

Until now, identity was checked per workspace (private landlords only, M24) and per letting (the preferred applicant and the backup, R18). Income was a stand-in, and the first draft of this ADR turned open banking into a monthly income figure.

Sean's review on 8 November 2026 changed four things:
- everyone checks their identity once, as part of their Gaff profile: renters the first time they're chosen, letters before their first listing;
- Gaff doesn't wait for Stripe's written confirmation;
- an income estimate isn't needed;
- a payslip showing a PPS number is accepted.

Research the same day found that Irish letters ask chosen renters for photo ID, payslips, an employer's reference and a previous landlord's reference. The Data Protection Commission accepts documents showing someone can pay, but only from the person being offered the home, and never asks for transactions. Open banking is rare in Ireland. Daft has introduced identity checks with Stripe Identity. The housing assistance ground in the Equal Status Acts covers HAP, rent supplement and any social welfare payment. Selfie matching is biometric data (GDPR Article 9), so it needs explicit consent. The first version offered an alternative without a selfie; Q60 removed it, and Q61 asks the solicitor whether consent still holds.

## Decision

**Identity belongs to the person (Q48).**
- One `identity_checks` row per person, in the renter zone, checked with Stripe Identity: a photo ID and a live selfie, agreed to explicitly, with no other way through (Q60). After three tries that don't work, a person at Gaff can give more.
- Renters check the first time a letter chooses them as the preferred applicant or the backup, on one page with their documents and referees, wherever they enquired. Before then, a confirmed email to enquire and a mobile confirmed by text code to book a viewing.
- Letters, agents included, verify (mobile and identity) before their first letting goes live, whether it takes enquiries from Daft and MyHome or is listed on Gaff. An agent's verified name must match their PSRA licence.
- Each workspace gets a copy for its badges and readiness, so ADR-0022's `letter_checks` keeps working. Each application gets a copy when the renter is chosen, and not before (rule 2, M11).
- **Revised (Q60):** there's no check without a selfie, no "can't be checked online" and no seeing ID in person. Whether consent holds when the selfie is required, and whether anyone Stripe can't verify has a claim under the Equal Status Acts, are open for the solicitor (Q61).
- From Stripe, Gaff reads only the status and the verified names, with the secret key. It keeps the result, the name and the date, and redacts the session 30 days after its result. The check lasts as long as the account.

**Work and income are shown with documents, not estimated (Q49, Q50).**
- What's asked depends on how the renter earns: payslips, or a contract for a new job; a Revenue Notice of Assessment or an accountant's letter; or statements of other income. No bank statements, apart from a balance-only savings statement for someone living on savings. Employer and landlord references are sent as before, with a character reference for someone who hasn't rented before.
- Documents are uploaded straight to a private bucket. A job reads them with Claude (the kind, name, date, employer and pay, never a PPS number) and checks they're the kind asked for, recent and in the verified name. It then encrypts them with Gaff's key.
- The renter confirms what was read and shares everything in one step. The letter's copy is a separate object, deleted when the tenancy starts or the application closes, and 30 days after sharing at the latest. The renter can keep their own copy until it's out of date.
- Statements of other income never reach letters. Gaff reads the amount, how often and the date, deletes the statement, and the letter sees "regular income", unlabelled (rule 3).
- No score, no ratio and no estimate: the letter reads the evidence and decides (rule 1). Payslips are converted to a month only as arithmetic on the figure printed.

**No open banking at launch.** A later "Confirm with your bank" through Tink would check payslips against payments and keep only the outcome.

## Consequences

- Chosen renters check their identity alongside their documents, in about five minutes in all; a renter chosen again skips it.
- Identity costs about €1.25 per person, once: at most about €2.50 a letting for renters.
- Booking a viewing gains a text code, and needs it.
- Agents check their identity for the first time, and every letter does before a letting goes live.
- Gaff now holds documents (encrypted, deleted on schedule, every view logged) and reads them with the AI in the EU in production.
- Forged documents aren't detected. Checked identities, matching names, references and the later bank confirmation are the defences.
- The landlords' check moves from `letter-identity` to `identity`, with a migration.
- The DPIA must cover biometric data and documents before the first real person checks.

## Alternatives considered

- **Checking identity per letting, only for chosen renters** (the first draft). The least data, but renters repeat it for every home.
- **Checking renters before their first enquiry** (decided, then revised the same day on the CTO's recommendation). A renter could skip it by enquiring on Daft for the same home, it's a barrier when Gaff most needs renters, early requests for ID look like a scam to renters, it goes beyond the DPC's guidance, and it costs €1.25 for every renter who signs up.
- **Checking renters before their first viewing.** A signal of safety at viewings, but it checks many people who'll never be chosen; a confirmed mobile does most of that job.
- **Selfie only, no alternative.** Simpler, but EU law, and Stripe's own guidance, call for a non-biometric route, and consent would not be freely given.
- **Open banking with an income figure** (Tink, the first draft). Hard to forge, but rare in Ireland, sold on enterprise terms, unable to reach most credit unions, and an estimate Sean doesn't want.
- **Letters see every document.** Familiar, but statements of other income reveal protected grounds, including the housing assistance ground.
- **Gaff reads every document and letters see none.** The most private, but letters expect to see payslips, and Gaff would be vouching for figures it can't verify.

# ADR-0022: Checking letters before their homes go live

- Status: Accepted
- Date: 2026-11-07

## Context

Scam adverts are a main reason renters distrust portals, and Daft checks advertisers only at the end of its ad flow. Q29 (Sean, 7 November 2026): agencies and agents are checked against the PSRA register, and private landlords pass a document-and-selfie ID check before their first home goes live. Stripe Identity is approved for that use only.

## Decision

- **What's checked** (`domain/verification/readiness.ts`, M22): a private landlord's mobile and identity; an agency's licence, and each agent's own mobile and licence. Nothing goes live until these pass (milestone 3 enforces it at publishing).
- **Licences** (M23, M27): each number goes into a queue (`letter_checks`) and a person at Gaff matches the number and the name on the PSRA register, within one working day (M105). The register's weekly file can be matched automatically once Gaff's servers can fetch it (`domain/verification/licence.ts` already matches a register); this build environment can't reach psr.ie.
- **Identity** (M24): Stripe Identity behind a port (`ports/letter-identity.ts`, now `ports/identity.ts` for every person: ADR-0026), with a development stand-in. Gaff reads only the verified first and last names (it never expands the date of birth or ID number), keeps the result, the name and the date, and asks Stripe to redact the session 30 days later. Webhooks are verified by their signature, and Gaff asks Stripe for the outcome rather than trusting the payload.
- **Mobile** (M3): Gaff's own codes, as ADR-0016.
- **Badges** (M26) say what was checked and when, from `badgeWords()`.
- **Payment accounts** (M30): once Gaff has checked who the letter is, the account for the deposit and first rent must be in that name; renters' banks also check the name when they pay.
- **Staff decisions** are written by `withStaff()` and logged in the organisation's own record, in the same transaction, with the `staff` actor.

## Consequences

- A landlord's first listing takes a few minutes longer; in return, every badge renters see means something.
- Gaff staff must work the licence queue every working day until the register import is automatic.
- One vendor sees landlords' documents for up to 30 days, under a DPA and named in the privacy notice.

## Alternatives considered

- **Phone and a person reviewing each first listing.** Cheaper, but weaker against organised scams.
- **Checking at the end of the ad flow, like Daft.** Letters lose work if they fail; renters see listings before anyone is checked.

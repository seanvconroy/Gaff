# ADR-0020: The ID check on Stripe Identity, and a mobile confirmed by text to book

- Status: Accepted (brought across from the live line's ADR-0026, its identity part, on 19 November 2026; Q51, Q52)
- Date: 2026-11-19

## Context

The redesign's ID check ran on a stand-in: `CheckProvider.start()` sent the person to a Gaff page where a tester picked the result. On 8 November Sean chose Stripe Identity (the live line's Q48), and the live line built it: a photo ID and a live selfie, a signed webhook, one session reused across tries, three tries, and redaction at Stripe 30 days after the result. On 19 November (Q51) the redesign took it, keeping its own rules for who verifies and when (Q35, Q47, Q52): a renter the first time they are chosen as preferred applicant or backup, a private landlord once at their first go-live, and never an agency's staff. Q51 also brought across the live line's rule that renters confirm their mobile by text before booking a viewing (its Q60, P16).

The two lines hold identity differently. The live line has one check per person and every renter has an account. In the redesign a letting's ID check belongs to the application (the operator's copy, `checks`), and a renter's pages need no account (UX-PP-8); a person's own check (go-live, "My name has changed") is in `identity_checks`, a person's own table.

## Decision

**An identity port with two adapters** (`src/ports/identity.ts`): `start` (open a session, or reopen the check's existing one), `outcome` (read the session from the provider) and `redact`. `IDENTITY_PROVIDER=stripe` is Stripe Identity, called over HTTPS with the secret key and no SDK; `stand_in` is the Gaff page; `none` leaves the check to the operator. Production refuses the stand-in. Stripe is given only the check's ID and whether it is a letting's or a person's check, never a name or an email. It asks for a passport, driving licence or ID card, captured live, with a matching selfie.

**What Gaff keeps is unchanged.** From Stripe, Gaff reads only the status and the verified first and last name, joined as one line. A pass becomes the redesign's result: the operator's sealed copy (name and date), and, with the person's yes, `verified_identities` (result, name, date: `tests/compliance/identity.test.ts`). The screens, the words and "Keep this, so you never have to do it again?" are the redesign's; only where the result comes from changed.

**The provider's bookkeeping lives beside the check it belongs to**, never in `verified_identities`: the tries (`attempts`), the version of the words shown before the check started (`consent_version`), the provider's reference, the deletion date (`redact_after`) and when Stripe redacted it (`provider_redacted_at`). For a letting's check that is the `checks` row (the operator's copy, because the renter may have no account); for a person's own check, `identity_checks` (`personPolicy()`). Codes, counts and dates only.

**Nothing posted is believed.** `/api/webhooks/stripe-identity` checks Stripe's signature (five minutes' tolerance), then reads the session from Stripe and records the outcome only for a check under way whose reference is that session. The same read runs when the person comes back from Stripe's pages and before a new try starts, so a late webhook loses nothing and a session Stripe is still checking is never replaced.

**Three tries, one session.** Each try reopens the check's session while Stripe allows it. Saying no on Stripe's own consent screen doesn't count. After three, the person is told in `warning` how to reach a person. Gaff's team giving more tries is not built: `mayAttempt(record, moreTries)` in `src/domain/identity/attempts.ts` is the seam.

**Redaction by the retention job (rule 9).** Every Stripe check carries `redact_after`: 30 days after its result, or after it started for a session nobody finished, or the night its application's personal data is deleted. The nightly job asks Stripe to redact each one due and logs it (`check.redacted`, `profile.identity_check_redacted`, IDs only). When a person's identity goes with their profile, their own sessions are redacted by a job queued in the same transaction.

**The stand-in on the test copy.** BA-1 made `/dev` Gaff's team only on the test copy. The stand-in check page is the one exception: its link carries a key made from the check's ID with `AUTH_SECRET`, and the person holding it may open that check's page and nothing else (`standInCheckAccess`, `requireStandInCheck`; `tests/compliance/dev-tools.test.ts`).

**A mobile confirmed by text to book (P16).** A new booking needs a mobile confirmed with a six-digit text code, keyed to the application: hashed, ten minutes, five tries, a new code after 30 seconds, five a day. It is asked at the confirm step of booking, never at "Ask to view" (UX-AV-4). Moving a booking doesn't ask again. The 2-hour reminder goes to the confirmed number and to no other (changing Q12). Where texts aren't sent (the fake sender on the test copy), the code is shown on the screen. Listers aren't asked for a mobile.

## Consequences

- With Stripe's test keys, the whole check runs through Stripe's test mode; without them the stand-in works as before.
- Every booking now has a confirmed mobile and a text reminder; tests book through `bookAs()`.
- Before real people use Stripe: its DPA, the privacy notice naming it, and the solicitor's answer on consent to the selfie (Q51).

## Alternatives considered

- **One check per person, as the live line has it.** Simpler, but a redesign renter may have no account, and the redesign's per-application copy and "Keep this?" are its rules.
- **A separate table for the provider's bookkeeping.** It would need either a person, which an accountless renter doesn't have, or an organisation, which a person's own check doesn't have.
- **Trusting the webhook's payload.** One request fewer, but anyone who learned the secret, or replayed a payload, could pass a check.

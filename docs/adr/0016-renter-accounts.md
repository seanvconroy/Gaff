# ADR-0016: Renter accounts, alongside private links

- Status: Accepted (amends ADR-0013). The ways to sign in were widened by [ADR-0028](0028-sign-in-methods.md) on 14 November 2026: a password, a passkey, Google and Apple as well as a code, and no sign-in links.
- Date: 2026-11-07

## Context

ADR-0013 gave renters private links and no accounts, which suits renters who find a home on Daft or MyHome. The marketplace (M1 to M13) needs renters to keep saved homes, alerts and a profile they reuse, and to follow every home they enquired about in one place.

## Decision

- **One account per person** (M1), with the same library as operators: Better Auth, one-time links or codes by email, no passwords. A person can rent, let, or both.
- **Renting is opt-in at sign-up** ("What brings you to Gaff?"), and behind `MARKETPLACE_PUBLIC` until launch. A renter's profile lives in the renter zone (ADR-0017) and starts with a first name only; the rest comes when they enquire, and is kept only if they tick "Keep my details" (Q25).
- **Private links stay.** Renters from Daft and MyHome keep using them, and can save them to an account (M4). Landlords keep their links.
- **Mobile numbers are confirmed by our own 6-digit codes** (M3), hashed, through the SMS port (Sinch). No phone-number identity service.
- **Gaff staff** are ordinary accounts listed in `staff_members`. Only `requireStaff()` creates a `Staff`, and only `withStaff()` gives the wider view; anyone else gets "not found" on staff pages. Passkeys for staff come before launch (M5).

## Consequences

- No identity provider to approve: accounts stay in Gaff's own database.
- Renters' data has an owner who can see, download and delete it (M12, M13), separate from letters' copies.
- One more kind of person to support. The renter pages share the design system and the accessibility rules of the renter link pages.

## Alternatives considered

- **Links only, for everything.** No saved searches or alerts, and a renter's enquiries scattered across emails.
- **Sign in with Apple or Google.** Quicker for some, but each is a new vendor handling identity (rule 10). Later, if approved (M7).

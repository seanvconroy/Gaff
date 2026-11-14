# ADR-0013: Operators sign in by email link; renters and landlords use private links

- Status: Accepted The email link for operators was replaced by [ADR-0028](0028-sign-in-methods.md) on 14 November 2026; private links for renters and landlords are unchanged.
- Date: 2026-10-31

## Context

Operators need accounts, with roles within their organisation. Renters must be able to answer questions and book viewings on a phone with no account (R9, R12). Landlords approve and view by link, without an account (R19, R27). The founders asked to approve any service that handles identity.

## Decision

**Operators:**

- Sign in with a one-time link sent by email, using **Better Auth**. It's an open-source library, so accounts and sessions are stored in Gaff's own Postgres. No third-party identity service is involved.
- Sessions are stored server-side, with secure, HTTP-only cookies.
- Each user belongs to an organisation as an admin or a negotiator. Admins invite colleagues.
- Passkeys or two-factor sign-in are added before a wider rollout beyond the pilots.

**Renters and landlords:**

- No accounts. Each person gets a private link containing a 256-bit random token. Only a hash of the token is stored.
- A link is scoped to one application (renter) or one letting (landlord).
- Links expire when the letting closes, can be revoked, are rate-limited and are never written to logs.
- Each page shows the minimum it needs to (see open question Q4 for the landlord's view).

## Consequences

- No identity provider to approve or put in the DPIA. Sign-in emails go through the same email adapter as everything else.
- A forwarded renter link gives access to that renter's page. That's acceptable for answers and bookings. Later stages that show documents or checks (Slice 2) will add a one-time code sent to the renter's email or phone.

## Alternatives considered

- **Auth.js.** Also self-hosted. Better Auth has built-in organisations, roles and invitations.
- **Clerk or Auth0.** Hosted identity services that would hold operators' personal data outside our database, and US-hosted by default.
- **Renter accounts.** Ruled out by the PRD.

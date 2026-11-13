# ADR-0028: Operators sign in with Google, Apple, a password, a passkey or an email code

- Status: Proposed. Sean chose the options on 8 November 2026; the CTO accepts. When accepted, it supersedes the operator part of [ADR-0013](0013-sign-in-operators-links-for-renters.md). ADR-0013's private links for renters and landlords are unchanged.
- Date: 2026-11-08

## Context

- **The one-time email link** (ADR-0013) is slow, opens in the wrong browser, can be used up by email scanners, and is the only way in.
- **No invitations.** ADR-0013 promised that admins invite colleagues, but there's no way to do it, so agencies can't give each person their own login.
- **ADR-0013 asks for passkeys or two-step sign-in** before a wider rollout.
- **No rate limit.** Gaff's server actions call Better Auth in-process, which skips Better Auth's rate limiter, so today's sign-in form has none.
- **Sean wants** sign-in with Google, Apple and email and password, working seamlessly together. He's open to Clerk if it's best.

The product requirements are in [auth-prd.md](../auth-prd.md), and the design is in [auth-tech-spec.md](../auth-tech-spec.md).

## Decision

**Ways in:**

- Operators sign in with Google, Apple, email and password, a passkey, or a 6-digit code sent by email.
- Codes replace sign-in links, for signing in, confirming an email and resetting a password.
- Passwords are 12 to 128 characters, and breached ones are refused.

**Library:**

- **Better Auth stays the library.** Accounts, sessions and passkeys stay in Gaff's Postgres in Ireland.
- **One new dependency:** `@better-auth/passkey`, pinned to Better Auth's version.

**Linking:**

- One person has one account, keyed by confirmed email.
- A Google or Apple sign-in joins an existing account automatically only when two things hold. The account's email must already be confirmed. The provider must host that email: Gmail or Google Workspace for Google; iCloud addresses or Hide My Email relays for Apple.
- Otherwise the person signs in another way and connects the provider themselves.
- An unconfirmed sign-up never keeps a way in that nobody proved.

**Teams:**

- Admins invite colleagues by email, as admin or negotiator.
- An invitation is accepted only by someone signed in with the invited, confirmed email. The link alone never signs anyone in.
- One workspace per person, for now.

**Limits and housekeeping:**

- Gaff's own limiter covers every auth call, in-process or over HTTP. Its keys are hashed, so no addresses or emails are stored.
- Better Auth's logger is quietened and redacted, so no personal data reaches the logs.
- The nightly job deletes expired sessions, codes and invitations, and unconfirmed and abandoned accounts (rule 9).
- Gaff keeps no Google or Apple tokens and no photos.

## Consequences

- **No identity vendor holds operators' data,** so no DPA or transfer is needed for accounts. Google and Apple only confirm identity, and they still need the founders' approval under rule 10, and a mention in the operators' privacy notice. So does the breached-password check (Have I Been Pwned's Pwned Passwords), which receives only 5 characters of a hash.
- **We build and maintain about ten screens and three emails.** In return they follow the design system and Gaff's voice, and they work without JavaScript, except passkeys.
- **Apple adds operational work:** a paid developer account, a key, and registering our sending domain for Hide My Email. The client secret is generated in code, so it never needs renewing by hand.
- **Real Google and Apple can't run in CI.** A local stand-in identity provider exercises the same callbacks and linking rules, and the real providers are checked by hand on the test copy.
- **Two-step verification** (TOTP) follows in phase 2, before a wider rollout. **Renter sign-in** follows with renter profiles (Q25).

## Alternatives considered

- **Clerk.** Prebuilt screens and less auth code, but:
  - operators' data moves to a US vendor needing approval;
  - its scripts loosen our security policy;
  - its screens sit outside our design system and need JavaScript;
  - users must sync into our organisations and row-level security.
- **Auth0, WorkOS, or Supabase Auth.** The same trade-off as Clerk, or, for Supabase Auth, a rework of ADR-0013's flow for no gain (ADR-0014).
- **Keep sign-in links and add Google and Apple.** Links are what fail today (scanners, wrong browser), and Sean asked for passwords.
- **Microsoft sign-in.** Many agencies use Microsoft 365, but Sean chose Google and Apple for now. Revisit with calendar sync (R31).
- **Link accounts whenever the provider says the email is verified** (Better Auth's simplest setting). This invites takeover through addresses the provider doesn't host, or through someone pre-registering a victim's email.

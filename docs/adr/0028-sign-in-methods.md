# ADR-0028: Sign in with Google, Apple, a password, a passkey or an email code

- Status: Accepted and built (14 November 2026). Sean chose the options on 8 November 2026, and on 13 November asked for it to be built with the CTO's best judgement on what was still open; those calls are noted for the founders to revisit ([Q62 to Q74](../open-questions.md#j-sign-in-and-accounts)). It amends [ADR-0013](0013-sign-in-operators-links-for-renters.md) and [ADR-0016](0016-renter-accounts.md): the sign-in link is gone, and passwords are allowed. Private links for renters and landlords are unchanged.
- Date: 2026-11-08, revised 2026-11-14

## Context

- **A code or link by email was the only way in** (ADR-0013, ADR-0016). It's slow, a link opens in the wrong browser, and email scanners can use a link up.
- **One account per person** (M1, ADR-0016): renters, letters and Gaff's staff share accounts, so they share sign-in.
- **Invitations existed** (M16), but a link worked for whoever held it.
- **Staff need passkeys** before launch (M5), and anyone should be able to add one (M6). Google and Apple were planned for later (M7).
- **No rate limit.** Gaff's server actions call Better Auth in-process, which skips its rate limiter, so the sign-in form had none.
- **Sean asked for** sign-in with Google, Apple and email and password, working seamlessly together, and was open to Clerk if it was best.

The product requirements are in [auth-prd.md](../auth-prd.md), and the design is in [auth-tech-spec.md](../auth-tech-spec.md).

## Decision

**Ways in:**

- Everyone signs in with Google, Apple, email and password, a passkey, or a 6-digit code sent by email, on one sign-in page.
- Codes replace sign-in links, for signing in, confirming an email and resetting a password.
- Passwords are 12 to 128 characters, never the email itself, and breached ones are refused.
- The renter-first entry points (the enquiry sheet and the chosen renter's page) keep asking for a code only.

**Library:**

- **Better Auth stays the library.** Accounts, sessions and passkeys stay in Gaff's Postgres in Ireland.
- **One new dependency:** `@better-auth/passkey`, pinned to Better Auth's version.

**Joining ways in to one account:**

- One person has one account, keyed by confirmed email.
- A Google or Apple sign-in joins an existing account on its own only when two things hold. The account's email must already be confirmed. The provider must host that email: Gmail or Google Workspace for Google; iCloud addresses or Hide My Email relays for Apple.
- A new address the provider doesn't host is asked for a code the first time. Otherwise the person signs in another way and connects the provider themselves, which they can do under any address once signed in.
- An unconfirmed sign-up never keeps a way in that nobody proved.

**Changing how you sign in:**

- One page, "How you sign in", for everyone. A change needs a sign-in in the last hour, or the person confirms it's them first.
- A code by email always works for a confirmed address, so any other way in can be removed. The one exception: Apple stays on an account whose address is Hide My Email.
- A browser holds one session; signing in again replaces it.

**Teams:**

- Admins invite colleagues by email, as admin or agent, and can send an invitation again or cancel it.
- An invitation is accepted only by someone signed in with the invited, confirmed email. The link alone never signs anyone in.
- One workspace per person, for now.

**Staff:**

- In production, Gaff's own tools open only on a passkey sign-in from the last 8 hours (M5).

**Limits and housekeeping:**

- Gaff's own limiter covers every auth call, in-process or over HTTP. Its keys are hashed, so no addresses or emails are stored.
- Better Auth's logger is quietened and redacted, so no personal data reaches the logs.
- The nightly job deletes ended sessions, used-up codes, lapsed invitations and sign-ups nobody confirmed (rule 9).
- Gaff keeps no Google or Apple tokens and no photos.

**Approvals (rule 10):**

- Google, Apple and the breached-password check are built behind settings and stay off until the founders approve them: the buttons show only when their keys are set, and production must choose the breach check or turn it off.

## Consequences

- **No identity vendor holds people's accounts,** so no DPA or transfer is needed for accounts themselves. Google and Apple only confirm identity; they still need the founders' approval under rule 10, and a mention in the privacy notice. So does the breached-password check (Have I Been Pwned's Pwned Passwords), which receives only 5 characters of a hash.
- **We build and maintain about a dozen screens and six emails.** In return they follow the design system and Gaff's voice, and they work without JavaScript, except passkeys.
- **Sign-in events are written beside the library's own writes,** not in one transaction with them: the one documented exception to rule 8's "same transaction" (Q67).
- **Passkeys tie Gaff to a domain.** The domain they're made for can't change afterwards without stranding them, so it's chosen before the first real one (Q69).
- **Apple adds operational work:** a paid developer account, a key, and registering our sending domains for Hide My Email. The client secret is generated in code, so it never needs renewing by hand.
- **Real Google and Apple can't run in CI.** A local stand-in provider exercises the same callbacks and joining rules, and the real providers are checked by hand on the test copy once they're set up.
- **"Last used" isn't built:** it needs a cookie that isn't strictly necessary (Q72).
- **Two-step verification** (TOTP) follows in phase 2, before a wider rollout.

## Alternatives considered

- **Clerk.** Prebuilt screens and less auth code, but:
  - everyone's account data moves to a US vendor needing approval;
  - its scripts loosen our security policy;
  - its screens sit outside our design system and need JavaScript;
  - users must sync into our organisations, renter zone and row-level security.
- **Auth0, WorkOS, or Supabase Auth.** The same trade-off as Clerk, or, for Supabase Auth, a rework of the existing flow for no gain (ADR-0014).
- **Keep sign-in links and add Google and Apple.** Links are what fail (scanners, wrong browser), and Sean asked for passwords.
- **A separate sign-in for renters, with no passwords.** The first draft's plan. But a renter's account and a letter's are the same account, so two sets of rules for one table would be confusing and easy to get wrong (Q63).
- **Microsoft sign-in.** Many agencies use Microsoft 365, but Sean chose Google and Apple for now. Revisit with calendar sync (R31).
- **Join accounts whenever the provider says the email is verified** (Better Auth's simplest setting). This invites takeover through addresses the provider doesn't host, or through someone pre-registering a victim's email.
- **Let whoever holds an invitation link join.** Simpler, but a forwarded or shared-inbox link puts a stranger on the team, with every renter's details.

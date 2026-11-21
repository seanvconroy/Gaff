# ADR-0015: People with accounts sign in with Google, Apple, an email code or a passkey

- Status: Accepted (Sean, 14 November 2026, open question Q30). Supersedes the "Operators" part of [ADR-0013](0013-sign-in-operators-links-for-renters.md): the one-time email link. The "Renters and landlords" part of ADR-0013 is unchanged: private links, no accounts.
- Date: 2026-11-16
- Added to by [ADR-0033](0033-mobile-sign-in-and-one-person-across-methods.md) (20 November 2026): the email address joins every way in. Its fourth method, a mobile number with a code by text, was taken out on 21 November 2026.

## Context

- ADR-0013 signed operators in with a one-time link by email. A link opens wherever the email is read, which is often not the browser the person started in, so they ended up signed in on the wrong device, or not at all.
- The UX redesign ([section 2](../ux-redesign/02-accounts-and-sign-in.md), UX-SI-1 to UX-SI-12) makes an account something any person can have: an agent, a private landlord, a renter who chooses to keep a profile. Sign-in has to work for people who aren't confident with software, on a phone.
- The founders approve every service that handles identity (rule 10). Q30 approves Google and Apple for sign-in only.
- ADR-0013 planned a one-time code for the private-link pages that show check results or bank details. It was never built.

## Decision

**One screen, "Sign in or create an account", for new and returning people.** Three methods to choose between, and a fourth offered afterwards. There are no passwords.

| Method | How |
| --- | --- |
| Google, Apple | Better Auth's own providers, switched on by `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET`. With neither value set, the button isn't shown. |
| Email, with a six-digit code | Gaff's own code store (`src/server/auth/codes.ts`) and two small Better Auth endpoints (`src/server/auth/plugin.ts`). Sent through the email port, like all mail. |
| Passkey | Better Auth's passkey package, `@better-auth/passkey`. Offered once after a first sign-in on a device that can keep one, and by the browser on the email field from then on. |

Still Better Auth, still our own Postgres: accounts, sessions, passkeys and codes are in Gaff's tables. Supabase Auth isn't used.

**New and returning people take the same path.** If nobody has the verified email, a person is created. Nobody is told "no account found".

**One person, however they sign in.** A second method joins the same person only when its email is verified on both sides: the provider says the address is verified, and ours is. No provider is trusted by name. A provider's unverified address is never joined to anyone; and if an account was made from one, the address's owner takes it over by proving the address with a code, and whatever was attached before is dropped.

**Google and Apple are for sign-in only.** Gaff keeps the provider's ID for the person, their email and their name. Access tokens, refresh tokens, ID tokens and scopes are discarded before the account row is written. Apple's "Hide My Email" relay address is accepted as the person's email.

**Codes.** The rules are pure functions in `src/domain/auth/codes.ts`; one store serves every use of a code.

- Six digits, 10 minutes, five tries. A new one after 30 seconds. An address gets at most five in ten minutes and twenty in a day.
- The code is never stored and never logged. The row holds a keyed hash (HMAC-SHA-256, with a key made from `AUTH_SECRET`).
- **A code works only in the browser that asked for it.** That browser holds a random key in an HTTP-only cookie, and the row holds the key's hash. A code read out, forwarded or phished is no use anywhere else.
- **The email's button.** The email carries the code and one button. Opened in the browser that asked, the button signs the person in. Opened anywhere else, it shows the code in large type and signs nobody in. The code is made from the button's random token, so the page can show it without the code being kept anywhere. Looking uses nothing up, so an email scanner that follows the link changes nothing.
- Rows are deleted a day after they're sent, by the nightly retention job (rule 9).

**Sessions** last 30 days from last use on that device, renewed at most once a day.

**Confirm it's you again.** Three actions ask for a passkey or a fresh email code, whatever the age of the session: changing the account tenants pay into (built), removing a member, and deleting an agency (later packages). Confirming writes a `confirmations` row for that person and that action, and gives the browser a random grant in an HTTP-only cookie; only its hash is stored. The use case that makes the change takes a `Confirmation` and spends it in the same transaction. It lasts five minutes and works once. `src/server/auth/confirm.ts` says how to require it for a new action.

**Private links, and the code ADR-0013 planned.** Renters, owners and referees keep their private links, with no account. The reusable piece for the sensitive pages is built and tested (`src/server/access/link-codes.ts`): a code to the email on that application, and a signed pass that remembers it for that link, in that browser, for 30 minutes. No renter page uses it yet; the package that rebuilds those pages wires it in.

**The stand-in.** Rule 10: nothing needs a real account to build. Where the development tools are on and a provider's credentials aren't set, "Continue with Google" goes to a page on Gaff, `/dev/sign-in/google`, where a tester says who is signing in. The answer goes through Better Auth's own callback, so creating and joining are the real code path. Production refuses `DEV_TOOLS`, so the stand-in can't exist there.

**What a device remembers.** Besides the session: the key a code is tied to (15 minutes); a grant after confirming (5 minutes); which method was used last (`google`, `apple`, `email_code` or `passkey`); "Not now" to a passkey (30 days) or that the device has one; and whether the device can keep a passkey. None says who the person is. They are listed in `src/server/auth/cookies.ts`.

**The funnel.** A try at signing in is still a random ID with no cookie (UX-ME-1). It is now signed by the server and lasts an hour, so "screen opened" can't be counted for an ID someone made up. The methods are `email_code`, `google`, `apple` and `passkey`; `email_link` is gone.

## Consequences

- Two new vendors see who signs in with them, and only that: Google and Apple. Both are named in the privacy notice (`/privacy`), which the solicitor reviews with the terms before the first real user.
- Apple needs a developer account, a client secret that has to be renewed at least every six months, and Gaff's sending domain registered so relay addresses can be reached.
- A passkey is tied to the site's address (`APP_URL`). Changing the production domain means people add their passkeys again; the other methods keep working.
- A code only works where it was asked for. Someone who asks on a laptop and reads the email on a phone types six digits, which is the case the code is for.
- One new dependency, `@better-auth/passkey`, pinned to the same version as `better-auth`. It brings `@simplewebauthn/server` and `@simplewebauthn/browser`.
- A person can have an account and no organisation. For now they are sent to the existing set-up page; the account model that follows changes that.
- Limits on codes are per address, not per network address. Better Auth's own rate limit covers its endpoints. A limit at the edge, on the sign-in pages, is worth adding before launch.
- The owner of an address can always take back an account made from a provider's unverified claim to it. The cost is that such an account loses that provider's sign-in when they do.

## Alternatives considered

- **Keep the email link.** It breaks whenever the email is read on another device, which is most of the time on a phone. The email's button keeps the one-press path for the case where it does work.
- **Better Auth's own email-code plugin.** It signs people in by code, but a code there works from any browser, and it has no second use: confirming an action or opening a private link would each need their own store. One store with one set of rules is less code to get wrong.
- **Passkeys first.** The fastest and safest way back, but a poor first step for people who haven't met them. Offered after sign-in.
- **A hosted identity service (Clerk, Auth0, Supabase Auth).** Rejected in ADR-0013 for holding people's details outside our database; nothing here changes that.
- **Passwords.** No.
- **"Continue with Microsoft".** Later, if more than one in five pilot users signs in with a Microsoft-hosted address (section 2).

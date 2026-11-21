# ADR-0019: Sign-in, hardened

- Status: Accepted (BA-8, brought across from the live line's sign-in work, AU). Extends [ADR-0015](0015-sign-in-google-apple-codes-passkeys.md).
- Date: 2026-11-19
- Changed by [ADR-0033](0033-mobile-sign-in-and-one-person-across-methods.md) (20 November 2026): where Google or Apple doesn't host the address, a code now goes to it as the provider comes back, and entering it connects the provider. The rule itself (AU4) stands.

## Context

ADR-0015's sign-in (an email code, Google, Apple, a passkey afterwards, "Confirm it's you") carries on, and there are no passwords (Q30, confirmed in Q51). The live line's sign-in (AU1 to AU16) had protections ADR-0015 lacked: limits Better Auth's own limiter can't give (it sees only HTTP requests, and Gaff's screens call it in-process from server actions), the library's routes closed to browsers, a stricter rule for joining Google or Apple to someone, a way to change how you sign in and see where you're signed in, security emails, and a nightly clean-up.

## Decision

- **Limits, counted in Postgres (AU12).** `auth_limits` holds a SHA-256 of the scope and the network address (or organisation), a count and when the window began: no address is stored. One `insert … on conflict` counts a try, so the count holds across serverless instances. Every Better Auth call passes the `limitTries` hook (codes checked, the email's button, Google and Apple out and back, passkey challenges and answers, adding a passkey). Asking for a code and both steps of "Confirm it's you" count in their server actions. Numbers are in `src/domain/auth/limits.ts`; the code store's own limits per address stay. A limited caller is told when to try again ("Try again in a minute"). `GAFF_ENV=test` gives a hundred times the room, for the journeys. Better Auth's own limiter is off. Invitations: 30 an hour for an organisation.
- **Closed routes (AU12).** Over HTTP only the routes a browser needs answer: passkeys, `get-session`, and coming back from a provider (`src/domain/auth/browser-routes.ts`). Every other route, including any a later version adds, answers "not found". Gaff's own server code calls the library without a request and isn't stopped.
- **Joining Google or Apple (AU4).** Better Auth's `validateUserInfo` gate (`src/server/auth/identity.ts`): a provider joins someone, or makes a new person, only for an address it hosts (Gmail or the Google Workspace domain in `hd`; iCloud, me.com, mac.com or Hide My Email). Otherwise the person enters their email for a code first, then connects the provider from Profile, signed in, where any verified address is joined. The sign-in screen says the same in both cases, so nobody learns whether an address has an account; the address's owner is emailed. Each refusal is counted as the funnel step `account.sign_in_failed`, split by provider, with `notJoined` and nothing about the person.
- **How you sign in, and devices (AU6 to AU8).** On Profile: connect or disconnect Google and Apple, add, rename or remove a passkey, each behind "Confirm it's you" for the new action `change_sign_in`, spent in the transaction that makes the change. The library's own "signed in within the last day" check (`freshAge`) is off: the confirmation replaces it. The passkey offer straight after a sign-in (UX-SI-4) needs nothing more. Apple stays on a Hide My Email account, and nothing goes that would leave no way in. Signed-in devices are named in plain words; sign out one, or all the others. A browser keeps one session. Each change writes a `profile_events` step and queues the security email.
- **Security emails (AU11).** A provider or passkey added or removed; someone tried to sign in with Google or Apple using the address. Fixed wording in `src/copy/account-emails.ts`, pinned by `security-emails.test.ts`.
- **Clean-up (AU14).** The nightly retention job deletes ended sessions, run-out verifications (provider state, passkey challenges) and limiter counters a day old.
- **Apple's secret** is made on the server (ES256) from `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`, and the set-up is rebuilt every 30 days; a static `APPLE_CLIENT_SECRET` still works.
- **Gaff's team** open `/internal` in production only on a passkey sign-in from the last 8 hours (`sessions.sign_in_method`); on the test copy and locally, the email on `STAFF_EMAILS` is enough.

## Consequences

- One migration: `auth_limits`, and `sessions.sign_in_method`.
- Some sign-in events (a provider joined, a passkey added) are written just after Better Auth's own write, not in its transaction, as the live line's Q67 recorded. Changes Gaff makes itself (disconnecting, removing, renaming, signing out) are one transaction with their step.
- A person whose work address is on Microsoft can't sign up with a Google account made from it; they use a code and connect Google afterwards.

## Alternatives considered

- **Better Auth's own limiter.** It doesn't see server actions' in-process calls.
- **The live line's "signed in within the last hour".** The redesign's "Confirm it's you" already does this job, for every change.

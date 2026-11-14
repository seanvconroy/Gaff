# Sign-in and accounts: technical design

How the requirements in [auth-prd.md](auth-prd.md) are built. The decision record is [ADR-0028](adr/0028-sign-in-methods.md). Built from 13 to 14 November 2026 on the marketplace line (`claude/epic-ride-0ha68s`), which the first draft of this document didn't know about; this version describes the code as it is.

## 1. In brief

- **Better Auth stays the library** (pinned at 1.7.14), with one new package, `@better-auth/passkey`, pinned to the same version. Accounts, sessions and passkeys are rows in Gaff's own Postgres in Ireland.
- **One sign-in for everyone**: renters, letters and Gaff's staff share `users` (ADR-0016), so they share the sign-in pages. The renter-first entry points (the enquiry sheet, M76, and the chosen renter's page, P16) keep asking for a code and nothing else.
- **Gaff's own rules sit around the library**, as hooks, so they apply however the library is called:
  - a limiter (`src/server/auth/limits.ts`), because the library's own runs only for HTTP requests and Gaff's forms call it in-process;
  - the rule for joining Google or Apple to an account (`identity.ts`);
  - the password rules and breach check (`passwords.ts`);
  - "a sign-in in the last hour" for changing how you sign in (`recent.ts`).
- **Every form is a server action** that works without JavaScript. Passkeys are the one part that needs the browser's own API, so they appear only where it exists.

## 2. What changed

| Before | Now |
| --- | --- |
| A code or a link by email, and nothing else | Google, Apple, email and password, a passkey, or a 6-digit code |
| The `magicLink` plugin | Removed. `emailOTP` does sign-in, confirming an email and resetting a password |
| No limit on the sign-in form | A limiter as a `before` hook, per network address and per email |
| No passkeys; staff signed in like anyone | Passkeys for anyone (M6); staff tools need one in production (M5) |
| An invitation link worked for whoever held it | It works for the invited, confirmed email only |
| Nothing to manage | "How you sign in" (`/account/security`) and "Confirm it's you" (`/account/confirm`) |
| Sessions, codes and unconfirmed sign-ups stayed until used | The nightly job deletes them (AU14) |

## 3. Better Auth configuration

`src/server/auth/auth.ts` builds the instance on first use. What matters, and why:

| Setting | Value | Why |
| --- | --- | --- |
| `session` | 14 days, extended daily; `freshAge` one hour; `signInMethod` as an extra column | AU7's "recent sign-in" uses the library's own freshness check where it has one; the method is kept for the record and for staff (M5) |
| `emailAndPassword` | on; `requireEmailVerification`; 12 to 128 characters; `revokeSessionsOnPasswordReset` | A password account can't be used until a code confirms its email. That also makes a second sign-up for the same address answer exactly like a first |
| `emailVerification` | `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification` | The right password for an unconfirmed account sends a new code |
| `emailOTP` plugin | 6 digits, 10 minutes, 5 tries, stored hashed, `overrideDefaultEmailVerification` | Codes, not links, for all three jobs |
| `passkey` plugin | `rpID` from `PASSKEY_RP_ID` or `APP_URL`'s host; `origin` fixed to `APP_URL`; `residentKey: 'required'`, `userVerification: 'preferred'` | A passkey that needs no email to use, and only ever answers Gaff's own address |
| `socialProviders` | Google (`prompt: 'select_account'`) and Apple, each only when its settings exist | Off until approved and set up (Q64) |
| `genericOAuth` plugin | The stand-in providers, in development and tests only; an empty list elsewhere | The whole Google and Apple journey can be tested with no account at either. The plugin list stays a fixed tuple, or the library's types fall apart |
| `account.accountLinking` | on; `trustedProviders: []`; `allowDifferentEmails`; `allowUnlinkingAll`; `updateAccountOnSignIn: false` | Trust comes from who hosts the address (section 5.6), never from a provider's name. A code by email always works, so any other way in can go |
| `user.validateUserInfo` | `checkProviderIdentity` | The gate for every Google or Apple sign-in, sign-up and connection |
| `databaseHooks` | tokens stripped from `accounts`; events and emails on sign-up, sign-in and a provider joining; the browser's previous session ended | AU14, AU11, AU16, AU8 |
| `hooks.before` | `closedToBrowsers`, `checkNewPassword`, `limitTries`, `requireRecentForChanges` | Run for in-process and HTTP calls alike. The first closes every route a browser doesn't need (section 8) |
| `hooks.after` | `countPasswordFailures`, `passkeyRemoved` | |
| `rateLimit` | off | Replaced by Gaff's limiter, which sees every call |
| `logger` | `warn`, through `redactForLog` | The library logs email addresses at `info` |
| `advanced.backgroundTasks` | Next.js `after()`, in requests, outside tests | Emails don't hold up the response, and timing doesn't show whether an account exists |

Things learned from the library's source that the design relies on:

- Its rate limiter runs in the HTTP router only. `hooks` and `databaseHooks` run for `auth().api.*` calls too.
- `setPassword` is a server-only call with no route, so path-based hooks never see it. `addPassword()` in `flows.ts` checks the session, the hour and the password rules itself.
- `signUpEmail` with `requireEmailVerification` answers a duplicate with a made-up user and calls `onExistingUserSignUp`, which is where "You already have a Gaff account" is sent.
- `unlinkAccount` and adding a passkey use the library's `freshSessionMiddleware`; connecting a provider and removing a passkey don't, so `recent.ts` covers those two.
- A field declared with `input: false` (the session's `signInMethod`) can't be set through the library's `update-session` route, which the staff rule relies on. That route is closed to browsers as well.
- The library's change-email and delete-user routes are off unless switched on, and they aren't.
- Apple answers with a form post, which the library turns into a GET so the cookies come with it. The content security policy allows forms to post to `accounts.google.com` and `appleid.apple.com`.

## 4. Data model

Migration `0037_sign_in_methods`:

| Table | What | Notes |
| --- | --- | --- |
| `passkeys` | `id`, `name`, `public_key`, `user_id` (cascade), `credential_id`, `counter`, `device_type`, `backed_up`, `transports`, `created_at`, `aaguid` | The public half only. `backed_up` is what "kept in your password manager" is read from |
| `auth_limits` | `key_hash` (primary key), `hits`, `window_started_at` | The limiter's counters. The key is a SHA-256 of the scope and the address or email: neither is stored |
| `sessions.sign_in_method` | `password`, `email_code`, `google`, `apple` or `passkey` | Set as the session is created |

Unchanged: `users`, `accounts` (one row per way in: `credential`, `google`, `apple`; the provider's ID for the person, and no tokens), `sessions`, `verifications` (codes, passkey challenges, half-finished provider sign-ins), `memberships`, `invitations`, `staff_members`. None of the sign-in tables is a tenant table; `invitations` is, and the nightly job reaches it with `withSystem()`.

## 5. Flows

Each form's server action calls a function in `src/server/auth/flows.ts`, which calls the library in-process and turns its answer into a small set of outcomes the page has words for. What's waiting between two pages (which email, where to go next) is carried in a signed, short-lived cookie (`pending.ts`), never in the address.

### 5.1 Create an account with a password (AU1, AU2)

1. `/sign-up`: email and password. `checkNewPassword` refuses a password that's too short, too long, the email itself, or seen in a breach, before the step's own limit is counted, so a refused password doesn't use up tries.
2. A pending sign-up for the same address that nobody confirmed is dropped first (`pending-sign-up.ts`), so a stranger can't register someone's address and wait for them to confirm it.
3. `/sign-up/confirm`: the code. Confirming signs the person in. The code is only good in the browser that made the sign-up it belongs to.
4. An address that already has a confirmed account gets the same screen, and its owner gets "You already have a Gaff account".

### 5.2 Sign in with a password (AU3)

Outcomes: `signed_in`; `wrong` (one message for a wrong password and an unknown email); `unconfirmed` (the password was right; a new code goes out); `paused` (10 wrong passwords for this email in 15 minutes; codes still work); `slow_down`.

### 5.3 Sign in with a code (AU3)

`sendSignInCode` then `signInWithCode`. A new address gets an account when its code is entered. If an unconfirmed password sign-up exists for the address, signing in with a code drops its password: nobody proved it was theirs.

### 5.4 Reset a password (AU5)

`/forgot-password` then `/forgot-password/code`: the code and the new password on one screen. The reset signs the person in, signs every other device out, emails them, and adds a password to an account that had none.

### 5.5 Google and Apple (AU1, AU3)

- `continueWithProvider` (a server action behind each button, so it works without JavaScript) asks the library for the provider's address and redirects there. Coming back, the library's callback route does the rest and redirects to where the person was going, or to `/sign-in?provider=…&error=…`, which the page turns into one plain line (`sign-in-problems.ts`).
- `prepareForProvider` (the library's `mapProfileToUser`) keeps the name and email and drops the photo. `withoutTokens` strips access, refresh and ID tokens before an `accounts` row is written.
- **Apple's client secret** is a signed token, made from the team ID, key ID and private key (`apple-client-secret.ts`, ES256 with `node:crypto`). It lasts 150 days, and the instance is rebuilt every 30.
- **The stand-in provider** (`stand-in-provider.ts`, `/dev/sign-in-provider/[provider]`): a page of Gaff's own that plays Google or Apple in development and tests. The tester chooses who to be and what the provider says about them (verified or not, Workspace or not, Hide My Email). It does the real exchange (a code, PKCE, an identity token's claims) in-process, and answers as each provider does: a redirect for Google, a form post for Apple. It exists only when `GAFF_ENV` is `development` or `test` with `DEV_TOOLS` on, never on the test copy or in production, where anyone who reached it could sign in as anybody.

### 5.6 Joining a provider to an account (AU4)

`checkProviderIdentity` runs for every provider sign-in, sign-up and connection. The rule is in `src/domain/auth/email-authority.ts`:

| The person | The provider says | Result |
| --- | --- | --- |
| Is signed in, and connecting it from "How you sign in" | Any address it has verified, hosted or not | Joined, whatever the address. Refused only if that provider account is already someone else's way in |
| Has signed in with this provider account before | Anything | Signed in, by the provider's ID for them, not by email |
| Is new to Gaff | An address it hosts, verified | A new, confirmed account |
| Is new to Gaff | An address it doesn't host | `confirm_email_first`: use a code this first time |
| Has a confirmed account for the address | An address it hosts, verified | Joined and signed in; the owner is emailed |
| Has a confirmed account for the address | An address it doesn't host | `account_not_linked`: sign in another way, then connect it |
| Has an unconfirmed sign-up for the address | An address it hosts, verified | The sign-up is dropped; a new, confirmed account |
| Anyone | Not verified at all | `email_not_verified` |

Each refusal is counted as `account.sign_in_failed` with the reason `not_joined` and the provider, and nothing about the person, so it's possible to see how often the rule gets in the way (Q66).

"Hosts" means Gmail, Googlemail or a Google Workspace domain (the `hd` claim) for Google, and iCloud, me.com, mac.com or a Hide My Email relay address for Apple.

### 5.7 Passkeys (AU6, M6)

- **Adding** (`AddPasskey.tsx`): the browser asks the library for options, makes the passkey, and sends back the public half. The library refuses unless the sign-in was in the last hour. `afterVerification` records the event, emails the owner and names the passkey after what made it, when the browser says (`getAuthenticatorName`).
- **Signing in** (`PasskeySignIn.tsx`): a button, and on the sign-in page the browser's own suggestions on the email box (`autocomplete="username webauthn"`, conditional mediation). The passkey says whose account it is, so no email is typed.
- **What the browser said** when a passkey step didn't finish is read by `passkeyTrouble()` (`src/domain/auth/passkeys.ts`): closing the browser's own prompt says nothing more; a device that already has one, an old sign-in, too many tries and anything else each have their own words.
- The page learns whether the browser can use passkeys after it loads (`usePasskeySupport`), so nothing claims it can't before it has been asked, and without JavaScript a line says so.

### 5.8 Confirm it's you (AU7)

Changing how you sign in needs a sign-in in the last hour (`src/domain/auth/recent-sign-in.ts`). When it's older, the action redirects to `/account/confirm?next=…`, which offers only the ways this account has: its providers, a passkey if it has one, its password if it has one, and always a code to its own address. Signing in again makes a new session, and `endPreviousSession` ends the one the browser had, so the device list doesn't fill with copies.

### 5.9 How you sign in (AU7, AU8)

`/account/security`, one page for everyone. `src/server/auth/security.ts`:

- `signInOverview`: whether there's a password, when Google and Apple were connected, the passkeys, and the live sessions in words (`describeDevice`: "Safari on an iPhone").
- `disconnectProvider`: refused for Apple on a Hide My Email account (`canDisconnect`), since Apple is the only way anyone could get in to it.
- `removePasskey`, `renamePasskey`, `signOutDevice`, `signOutOtherDevices`. Each acts on the session's own account: the library checks ownership.
- `addPassword` and `changePassword` are in `flows.ts`. Changing a password signs the other devices out.

### 5.10 Invitations and team (AU9, AU10)

`src/server/organisations/team.ts`, with the rules in `src/domain/organisations/`:

- `inviteColleague`: admins only; replaces an earlier open invitation to the same address; counts against the workspace's 30 an hour.
- `acceptInvitation(user, …)`: `invitationIsFor()` requires the signed-in user's email to be the invited one, and confirmed. The invitation is claimed and the membership made in one transaction, so two taps can't use one invitation twice.
- `pendingInvitations`, `resendInvitation` (a new token and 7 more days on the same row, so the old link dies), `cancelInvitation` (the row, and its address, are deleted).
- `changeRole` and `removeColleague` use `team-rules.ts`: admins only, never the last admin, never your own place.
- The join page fills the invited address in and offers a code, the providers and a passkey. Signed in as someone else, it says so and offers to sign out and use the invited address.

### 5.11 Gaff's staff (M5)

`requireStaff()` (`src/server/auth/staff.ts`) asks `staffAccess()` (`src/domain/auth/staff-access.ts`): in production, staff tools open only when the session began with a passkey in the last 8 hours. Otherwise the person is sent to add a passkey (`/account/security?need=passkey`) or to sign in with the one they have (`/account/confirm?with=passkey`). Not asked on the test copy, where the founders' testers are staff.

## 6. Limits (AU12)

`src/domain/auth/limits.ts` holds the numbers; `src/server/auth/limits.ts` counts in `auth_limits`, in one statement, so simultaneous requests can't lose a count.

| Step | From one network address, a minute | For one email |
| --- | --- | --- |
| Password sign-in, and giving the current password to change it | 5 | 10 wrong in 15 minutes pauses password checks for 15 minutes |
| Sign-up | 3 | 3 in 10 minutes |
| Sending a code (sign-in, confirm, reset) | 5 | 5 an hour |
| Checking a code | 10 | 5 tries per code, by the library |
| Google or Apple (start and return) | 10 | |
| Passkey options | 30 (the sign-in page asks as it loads) | |
| Passkey sign-in | 10 | |
| Breach lookups for new passwords | 20 | |
| Invitations, new or sent again | | 30 an hour for one workspace |

- The address is the first entry of `x-forwarded-for`, which Vercel sets itself.
- A wrong-password pause never blocks codes, so nobody can lock someone else out of their account.
- Changing a password counts against the account that's signed in, so a session left open can't be used to guess its owner's password.
- End-to-end runs sign in constantly from one address, so `GAFF_ENV=test` multiplies the room by 100. Integration tests use the real numbers.

## 7. Emails (AU11)

`src/server/auth/emails.ts` sends; the words are in `src/copy/account-emails.ts` (the code in the subject, so the journeys and a phone's notification can read it). Sign-up confirmation, reset code, "You already have a Gaff account", "A password was added", "Your Gaff password was changed", and "Google, Apple or a passkey was added". Each says when, and what to do if it wasn't you.

## 8. Security review

| Risk | What stops it | Tested in |
| --- | --- | --- |
| Guessing passwords or codes at speed | Limits per address and per email; a pause per email; 5 tries per code | `au12-limits`, `au1-accounts` |
| Guessing a password from a session that's already signed in | The same limits and pause on the routes that take the current password | `au12-limits` |
| Calling the library's routes directly, past the forms' rules, emails and events | Only the routes a browser needs answer over HTTP: coming back from Google or Apple, and passkeys (`src/domain/auth/browser-routes.ts`). The rest, and any a later version adds, answer "not found" | `au12-limits`, `browser-routes.test` |
| Filling someone's inbox | 5 codes an hour to one address; 30 invitations an hour from one workspace | `au12-limits`, `m2-team` |
| Finding out who has an account | The same screens and words for known and unknown emails; emails go out after the response, so its timing says little | `au1-accounts` |
| Registering someone's address and waiting for them to confirm it | Unconfirmed sign-ups are replaced, and lose their password when the address is proved another way | `au1-accounts`, `au4-providers` |
| Taking over an account with a Google or Apple account that only claims its email | Joined only when the provider hosts the address | `au4-providers`, `email-authority.test` |
| A stolen or replayed provider sign-in | State, PKCE, and codes tied to the sign-in that asked | `au4-providers` |
| A look-alike site asking for a passkey | The origin and the site's ID are part of what's signed; each challenge works once, in the browser it was given to | `au6-passkeys` (software passkey) |
| Someone at an unlocked device changing how its owner signs in | A sign-in in the last hour, for every such change | `au6-passkeys`, `au7-how-you-sign-in` |
| A forwarded invitation | Accepted only by the invited, confirmed email | `m2-team`, `au9-team.spec` |
| An open redirect after sign-in | `safeNext()` takes only paths on Gaff | `safe-next.test` |
| Tokens or personal data leaking into logs and events | Tokens never stored; logs redacted; events hold codes and IDs | `au4-providers`, `log-redaction.test`, the event catalogue's compliance test |
| Staff tools reached with a phished code | A passkey sign-in, in production. A browser can't say how its own session began | `au6-passkeys`, `staff-access.test` |

Forms posted without JavaScript carry an `Origin` header only if the page's referrer policy allows one, and Next.js refuses a server action without it. The site's policy is `no-referrer`; the sign-in pages set `same-origin`. Forms elsewhere in the app still need JavaScript in production for this reason ([status.md](status.md), known issues).

## 9. Privacy, events and retention

- **Events (rule 8, AU16):** `account.signed_up`, `account.signed_in`, `account.sign_in_failed`, `account.email_confirmed`, `account.method_added`, `account.method_removed`, `account.password_changed` and `account.signed_out_elsewhere` go to `platform_events`, with a method code, a reason code or a count, and the account's ID as the subject. A failed try names nobody. Team events (`member.invited`, `member.invitation_resent`, `member.invitation_cancelled`, `member.joined`, `member.role_changed`, `member.removed`) go to the workspace's record in the same transaction as the change.
- **One exception to "the same transaction":** the library writes users, sessions and passkeys itself, so sign-in events are written by hooks just after, not in its transaction (Q67).
- **Retention (rule 9, AU14):** `sweepSignIn()` in `src/server/retention/sign-in.ts`, called by the nightly `retention_sweep`: ended sessions; codes and challenges that have run out; sign-ups nobody confirmed in 7 days; invitations that lapsed unaccepted; limiter counters over a day old.
- **Cookies:** the session, and three short-lived ones a sign-in needs while it's in progress (what's waiting for a code, a provider sign-in's state, a passkey challenge). All are strictly necessary. Nothing is kept on the device to remember people between visits, which is why "Last used" isn't built (Q72).

## 10. Configuration

| Variable | What | Default |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google. Both or neither | Unset: no button (a stand-in locally) |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple: the Services ID, and what signs its client secret. All four or none | Unset: no button (a stand-in locally) |
| `PASSKEY_RP_ID` | The domain passkeys belong to: `APP_URL`'s host, or a parent of it. **It can't change once people have passkeys** (Q69) | `APP_URL`'s host |
| `PASSWORD_BREACH_CHECK` | `pwned_passwords`, `stand_in` or `off`. Production refuses `stand_in` | `stand_in` |

`src/lib/env.ts` checks them when the app starts.

## 11. Setting up Google and Apple

Both wait for the founders' approval (Q64). Then:

**Google** (Google Cloud console, a project in Gaff's name):

1. OAuth consent screen: app name Gaff, the support email, the privacy notice and terms links (Q70), scopes `openid`, `email` and `profile` only.
2. An OAuth client of type "Web application", with the redirect address `https://<the app's domain>/api/auth/callback/google`. One client for production and one for the test copy.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Apple** (an Apple Developer account in Gaff's name, Q68):

1. An App ID with "Sign in with Apple", then a Services ID for the website. That's `APPLE_CLIENT_ID`.
2. On the Services ID: the app's domain, and the return address `https://<the app's domain>/api/auth/callback/apple`.
3. A key with "Sign in with Apple": its ID is `APPLE_KEY_ID`, and the `.p8` file's text is `APPLE_PRIVATE_KEY`. `APPLE_TEAM_ID` is on the membership page.
4. Under "Sign in with Apple for Email Communication", register Gaff's sending domains, so emails reach people who use Hide My Email.

## 12. Code layout

```
src/domain/auth/            pure rules, each with unit tests
  limits · browser-routes · codes · recent-sign-in · sign-in-methods · password-rules · safe-next
  email-authority · sign-in-problems · passkeys · devices · staff-access · housekeeping
src/domain/organisations/   invitation · team-rules
src/server/auth/
  auth.ts                   the Better Auth instance
  flows.ts                  what each form does, as outcomes
  limits.ts · passwords.ts · recent.ts · identity.ts       the hooks
  pending.ts · pending-sign-up.ts · account-events.ts · emails.ts
  providers.ts · apple-client-secret.ts · stand-in-provider.ts
  security.ts               "How you sign in"
  member.ts · staff.ts      who's signed in, and what they may open
src/server/organisations/team.ts
src/server/retention/sign-in.ts
src/ports/password-breach.ts · src/adapters/password-breach/
src/app/(auth)/             sign-in · sign-up · forgot-password · account · join · welcome
src/app/dev/sign-in-provider/   the stand-in for Google and Apple
src/copy/account-emails.ts
src/ui/                     PasswordField · ProviderButton · TextDivider · usePasskeySupport
src/lib/auth-client.ts      the browser client, for passkeys only
```

## 13. Testing

- **Unit** (`pnpm test`): every rule in `src/domain/auth` and `src/domain/organisations`, the copy, the environment checks.
- **Integration** (`pnpm test:int`, the real limits): `au1-accounts`, `au4-providers` (the stand-in provider end to end, through the library's own callback), `au6-passkeys`, `au7-how-you-sign-in`, `au12-limits`, `au14-housekeeping`, `m2-team`.
  - `tests/integration/software-passkey.ts` is a passkey kept in memory: a P-256 key pair, the attestation and the signed answers, as a device would send them. It lets the suite add a passkey, sign in with it, and tamper with the origin, the site ID, the key and the challenge.
- **End to end** (`pnpm build && pnpm test:e2e`), each page with an axe check: `au1-sign-in`, `au4-google-apple`, `au6-passkeys`, `au7-how-you-sign-in`, `au9-team`, and the journeys that sign in on the way.
  - Passkeys use Chrome's virtual authenticator (`addPasskeyDevice` in `tests/e2e/support.ts`). It answers a suggestions request the moment it's made, so the autofill path and the button are tested separately (`passkeysByButtonOnly`).
  - Phone width (320px) and no-JavaScript runs cover AU13.

## 14. Rollout

1. **Migration 0037 must reach a database before this code serves it.** Preview deployments of other branches never migrate the shared test database, so this branch's preview can't sign anyone in until the migration is applied there, which happens when the branch is merged into the line the test copy deploys.
2. Existing accounts need nothing: they have confirmed emails and sign in with a code as before, then add what they like.
3. `PASSWORD_BREACH_CHECK` must be chosen for production (Q65), and `PASSKEY_RP_ID` settled before the first real passkey (Q69).
4. Google and Apple appear when their settings are added (section 11).
5. Staff add a passkey before production turns the M5 rule on for them ([launch-checklist.md](launch-checklist.md)).

## 15. Where this differs from the first draft

- Built on the marketplace line: one sign-in for renters, letters and staff; `platform_events` for sign-in events; invitations fitted, not built.
- A new address that Google or Apple doesn't host is asked for a code first, instead of getting an unconfirmed account.
- Team removal doesn't sign the person out everywhere, and sends no email (Q71).
- Accounts nobody uses aren't deleted (Q74). "Last used", a passkey prompt and invitations on the welcome page aren't built (Q72).
- The invitation limit is 30 an hour for a workspace, not 20 a day.

## 16. Phase 2

Two-step verification (the library's `twoFactor` plugin; passkeys count), security activity from the AU16 events, an email on a new device, change of email, several workspaces for one person with a switcher, and sign-in rules per workspace (AU20 to AU26).

## 17. Risks

| Risk | Mitigation |
| --- | --- |
| A Better Auth upgrade changes behaviour the hooks rely on, or adds routes | Both packages are pinned to one exact version; the integration tests exercise the library's own routes, not mocks; a new route is closed to browsers until it's listed |
| The domain changes after people have passkeys | Decide the domain first (Q69); set `PASSKEY_RP_ID` to the registrable domain |
| Apple's relay drops Gaff's emails | Register the sending domains with Apple (section 11); a code by email is the fallback for every account |
| The breach check's service is slow or down | 2-second timeout, then the password is allowed: the check never blocks a sign-up |
| The limiter's table grows | The nightly job deletes counters over a day old |

# Sign-in and accounts: technical specification

Draft, 8 November 2026. It builds [auth-prd.md](auth-prd.md) (AU1 to AU16), and phases 2 and 3 are sketched at the end. The decision is recorded in [ADR-0015](adr/0015-operator-sign-in-methods.md) (proposed). It is written against the versions Gaff pins: `better-auth` 1.7.14, Next.js 16 and Drizzle 0.45. The library behaviour it depends on most was checked in that version's source: account linking, email codes, rate limiting, hooks, Apple's form post and generic OAuth providers.

## 1. Decision in brief

- **Better Auth stays.** We add its email-code plugin (`emailOTP`), the Google and Apple providers, `lastLoginMethod`, and `@better-auth/passkey`. Accounts stay in our Postgres in Ireland.
- **One new dependency:** `@better-auth/passkey@1.7.14`, pinned to match `better-auth`. It brings `@simplewebauthn/server` and `@simplewebauthn/browser`. WebAuthn verification isn't something to hand-write, and the package is a library, not a service.
- **No new service handles operators' data.** Google and Apple only confirm identity. The breached-password check sends 5 characters of a hash.
- **Server actions stay the way in.** Forms post to server actions that call `auth().api.*` in-process, as today, so every form works without JavaScript. Only passkeys use Better Auth's browser client.

**Why not Clerk.** Sean chose Better Auth on 8 November 2026.

| | Better Auth (chosen) | Clerk |
| --- | --- | --- |
| Where operators' data lives | Our Supabase, Ireland | Clerk's US infrastructure: a new vendor needing approval, a DPA and a transfer basis (rule 10) |
| Fit with our rules | Tables in our schema, our event log, our retention job | User sync by webhook into our organisations and RLS; deletion in two places |
| Screens | Ours, in our design system and voice, working without JavaScript | Clerk's components: separate styling, JavaScript only |
| Security policy | No third-party scripts; CSP stays `'self'` | Clerk's script and API domains in `script-src` and `connect-src` |
| Cost | Free | Free tier, then per active user |
| Work | We build about ten screens | Less UI work, more integration work |

## 2. What changes

| Today | After |
| --- | --- |
| Email link only (`magicLink` plugin) | Google, Apple, password, passkey, 6-digit email code |
| `emailAndPassword: { enabled: false }` | Enabled, with confirmation required |
| No rate limit on the sign-in server action (see §6) | Gaff's own limiter on every auth call |
| Every sign-up creates a workspace | Invitations, team management, and the welcome page offering pending invitations |
| Better Auth logs at `info`, including an email on duplicate sign-ups | Logger at `warn`, through a function that redacts emails and tokens |
| Expired sessions and verification rows are never deleted | The nightly job deletes them, plus unconfirmed sign-ups and abandoned accounts |

## 3. Better Auth configuration

This is a sketch: the names show intent, and the code is written test-first per requirement.

```ts
// src/server/auth/auth.ts
function createAuth() {
  const config = env();
  return betterAuth({
    appName: 'Gaff',
    baseURL: config.APP_URL,
    secret: config.AUTH_SECRET,
    // Apple answers with a form post from its own origin (response_mode=form_post).
    trustedOrigins: [config.APP_URL, 'https://appleid.apple.com'],
    database: drizzleAdapter(db(), {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications, passkeys },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: config.APP_URL.startsWith('https://'),
      // Emails go out after the response, so known and unknown emails take the same time.
      backgroundTasks: { handler: (work) => after(work) },
    },
    logger: { level: 'warn', log: redactingLog }, // rule 8: no emails or tokens in logs
    session: { expiresIn: 14 * DAY, updateAge: DAY, freshAge: HOUR },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true, // also makes a duplicate sign-up answer generically
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      onExistingUserSignUp: ({ user }) => emails.accountExists(user),
      onPasswordReset: ({ user }) => emails.passwordChanged(user),
    },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [], // trust comes from email authority (§5.6), not a provider's name
        allowDifferentEmails: true, // explicit links from Your account only (§5.6)
        allowUnlinkingAll: true, // email codes always work, so any other method can go (§5.9)
      },
      encryptOAuthTokens: true, // a second guard: tokens are dropped before storage (§9)
    },
    socialProviders: liveProviders(config), // google and apple; empty when SOCIAL_SIGN_IN=stand_in
    verification: { storeIdentifier: 'hashed' }, // OTP identifiers contain the email
    rateLimit: { enabled: false }, // replaced by Gaff's limiter (§6)
    databaseHooks: identityHooks, // drop provider tokens; record method changes (§9)
    hooks: { before: limitsAndFreshness, after: authEventsAndFailures },
    telemetry: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        overrideDefaultEmailVerification: true, // confirmations are codes, not links
        sendVerificationOTP: emails.code,
      }),
      passkey({
        rpID: config.PASSKEY_RP_ID,
        rpName: 'Gaff',
        origin: config.APP_URL,
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      }),
      lastLoginMethod(),
      ...(config.SOCIAL_SIGN_IN === 'stand_in' ? [genericOAuth({ config: standInProviders(config) })] : []),
      nextCookies(), // must stay last
    ],
  });
}
```

`auth()` stays a lazily built singleton. It is rebuilt when the Apple client secret it holds is more than 30 days old (§5.5).

## 4. Data model

One migration (`pnpm db:generate --name=auth-methods`). The auth tables aren't tenant tables and have no `organisation_id`, as now. `invitations` is a tenant table.

### Existing tables

| Table | Change |
| --- | --- |
| `users` | Add `last_signed_in_at timestamptz`, set when a session is created; the nightly job uses it (AU14). `image` stays null: we don't keep provider photos. |
| `accounts` | No schema change. Rows are `credential` (password hash), `google` or `apple` (the provider's subject ID). Token columns stay null (§9). |
| `sessions` | No change. `ip_address` and `user_agent` power "Signed-in devices" and go when the session goes. |
| `verifications` | No change. Now holds hashed email codes and OAuth state, with identifiers hashed too (`storeIdentifier: 'hashed'`). |

### New tables

```text
passkeys            (Better Auth passkey plugin schema)
  id text pk, user_id text → users (cascade), name text, public_key text, credential_id text (indexed),
  counter int, device_type text, backed_up bool, transports text, aaguid text, created_at

invitations         (tenant table: organisation_id + tenantPolicy(), RLS forced)
  id uuid pk, organisation_id uuid → organisations (cascade), email text (lower-case),
  role member_role, token_hash text unique, invited_by text → users,
  created_at, expires_at, accepted_at, accepted_by text → users, revoked_at
  unique (organisation_id, email) where accepted_at is null and revoked_at is null

auth_limits         (Gaff's limiter, §6)
  key_hash text pk, hits int, window_started_at timestamptz

auth_events         (sign-in measures, §9; not a tenant table)
  id bigint identity pk, user_id text → users (cascade) null, type text, data jsonb, occurred_at timestamptz
```

An invitation's token is 256 random bits, sent in the link and stored only as a SHA-256 hash, like `access_links`. The link page finds the invitation by hash through `withSystem()`. Every write happens inside `withOrg()`.

## 5. Flows

Every server action validates its input with Zod, consumes its limits (§6), and accepts a `next` path. `next` is kept only if it's a relative path (starts with `/`, not `//`); otherwise it's dropped (`src/domain/auth/safe-next.ts`). Between steps, a signed, HTTP-only cookie, `gaff.pending`, carries the flow's state: purpose, email, user ID, `next`, and when the last code was sent. It lasts 15 minutes and is signed with HMAC-SHA256 using `AUTH_SECRET`. This way nobody has to type their email twice (WCAG 3.3.7).

### 5.1 Create an account with a password (AU1, AU2)

1. `/sign-up` posts the email and password to `createAccount`.
2. **Breached-password check** (port `PasswordBreachCheck`, §10). If the password is breached, show a field error: "This password has appeared in a data breach, so it isn't safe to use. Choose another."
3. **A pending sign-up is replaced.** If a user with this email exists and `email_verified` is false, delete it (its credential cascades). An unconfirmed user can't have sessions, memberships or decisions, so nothing is lost. Without this, an unconfirmed sign-up would block the real owner (§5.6).
4. Call `auth().api.signUpEmail({ body: { email, password, name: '' } })`.
   - **New email:** Better Auth creates the unconfirmed user and credential, and emails a confirmation code (`emailOTP` overrides verification emails).
   - **Existing confirmed email:** Better Auth returns the same shape with a made-up user, hashes the password so timing matches, and calls `onExistingUserSignUp`, which emails "You already have a Gaff account".
5. Set `gaff.pending` (purpose `confirm`, the returned user ID) and redirect to `/sign-up/confirm`.
6. `confirmEmail` checks that the user with this email has the cookie's user ID and is still unconfirmed. Otherwise it answers "That code isn't right, or it has expired." Then it calls `auth().api.verifyEmailOTP`, which confirms the email and creates the session (`autoSignInAfterVerification`). It clears the cookie and redirects to `next`, or `/welcome`.
   - Binding the code to the browser that started stops a race in which someone else's sign-up for the same email swaps in their password, and the owner confirms it unknowingly.
7. **Resend:** allowed after 60 seconds. It sends only if the binding still holds; otherwise it pretends to succeed.

### 5.2 Sign in with a password (AU3)

1. `signInWithPassword` calls `auth().api.signInEmail({ body: { email, password, rememberMe: true } })`.
2. **Errors:**
   - `INVALID_EMAIL_OR_PASSWORD`: "That email and password don't match. Try again, reset your password, or email yourself a code." Better Auth hashes the password for unknown emails too, so timing doesn't reveal accounts.
   - `EMAIL_NOT_VERIFIED`: the password was right, so nothing leaks. Better Auth sends a new code (`sendOnSignIn`). Set `gaff.pending` (purpose `confirm`) and go to the code screen: "Confirm your email first. We've sent a code to…".
   - **Paused** (10 failures for this email in 15 minutes, §6): the same words as a wrong password, with "Email me a code instead" highlighted.
3. **Success:** redirect to `next`, or `/`. `requireMember()` sends people without a workspace to `/welcome`, as now.

### 5.3 Sign in with an email code (AU3)

1. **Email me a code instead** is a second submit button in the sign-in form (`formAction`), so it works without JavaScript. It calls `auth().api.sendVerificationOTP({ body: { email, type: 'sign-in' } })`.
   - Better Auth sends a code whether or not the email has an account, so the answer is the same either way.
2. Set `gaff.pending` (purpose `sign-in`) and go to `/sign-in/code`.
3. `auth().api.signInEmailOTP({ body: { email, otp } })`.
   - **Unknown email:** creates a confirmed user (passwordless sign-up, as today's link does).
   - **Unconfirmed user:** Better Auth's `revokeUnprovenAccountAccess` deletes every credential and linked account the unconfirmed user had, and their sessions, before marking the email confirmed. That's the pre-hijack guard for this path.
4. The `magicLink` plugin is removed.

### 5.4 Reset a password (AU5)

1. `/forgot-password` calls `auth().api.requestPasswordResetEmailOTP({ body: { email } })`. It sends nothing for unknown emails and answers the same.
2. `/forgot-password/code` takes the code and the new password together. It runs the breached-password check, then calls `auth().api.resetPasswordEmailOTP({ body: { email, otp, password } })`.
   - Better Auth creates a credential if the person had none, so a Google-only user can add a password this way.
   - It deletes all sessions (`revokeSessionsOnPasswordReset`) and confirms the email. An unconfirmed user's old password is overwritten.
   - `onPasswordReset` sends "Your Gaff password was changed".
3. The action then signs them in with `signInEmail` and redirects to `next`, or `/`.

### 5.5 Google and Apple (AU1, AU3)

**Starting.** Each button is a submit button in a small form posting to `startSocialSignIn(provider, next)`. It calls:

```ts
auth().api.signInSocial({
  body: { provider, callbackURL: next ?? '/', newUserCallbackURL: '/welcome', errorCallbackURL: '/sign-in' },
});
```

Then it redirects to the returned URL. Stand-in mode makes the same call. The stand-in providers are registered through `genericOAuth` under the IDs `google` and `apple`, and Better Auth 1.7 serves generic providers through the same `signInSocial` and `/callback/:id` endpoints (§14).

Better Auth handles the protocol:

- authorisation code with PKCE;
- `state` stored in the database and in a signed cookie;
- ID tokens verified for signature, issuer, audience and age (at most 1 hour).

**Google** asks for `openid email profile` with `prompt: 'select_account'`, so people with several Google accounts choose one.

**Apple:**

- **The form post.** Apple answers with `response_mode=form_post`, a cross-site POST to `/api/auth/callback/apple`. Better Auth turns it into a GET on the same path, so our `SameSite=Lax` cookies are sent. Apple's origin is in `trustedOrigins`.
- **The name.** Apple sends the person's name only the first time, and Gaff keeps it then.
- **The client secret is generated, not pasted.** `apple-client-secret.ts` signs an ES256 JWT with the Sign in with Apple key (`APPLE_PRIVATE_KEY`, from the .p8 file), using `node:crypto`, so no new dependency. It's valid for 180 days, inside Apple's 6-month limit, and `auth()` rebuilds itself when the secret is 30 days old, so nobody rotates it by hand.

**CSP.** `form-action` becomes `'self' https://accounts.google.com https://appleid.apple.com`. Chrome applies `form-action` to the redirect after a form post, and the no-JavaScript path posts a form whose answer redirects to the provider.

**Coming back.** Better Auth redirects to `callbackURL`, to `newUserCallbackURL` for a new user, or to `errorCallbackURL?error=<code>`. `src/domain/auth/sign-in-errors.ts` maps the codes to the PRD's plain lines:

| Better Auth or provider code | Message |
| --- | --- |
| `access_denied` | Cancelled |
| `account_not_linked`, `unable_to_link_account` | Can't link yet (§5.6) |
| `state_mismatch`, `state_not_found`, `invalid_callback_request`, `please_restart_the_process` | Too slow, or another browser |
| anything else | Something went wrong; try again or use your email |

### 5.6 Linking rules (AU4)

This is the heart of "one person, one account". Each case below names the code that enforces it.

1. **Implicit linking only onto a confirmed local account.** Better Auth 1.7's `requireLocalEmailVerified` defaults to on, and is due to become unconditional. We leave it on.
2. **Implicit linking only when the provider is authoritative for the email.** Google and Apple say `email_verified` for any address they once checked, including addresses they don't host. Google's own guidance is to trust the claim for linking only where Google is authoritative. `src/domain/auth/email-authority.ts` decides:
   - **Google:** the address is `@gmail.com` or `@googlemail.com`, or the token has an `hd` (Google Workspace) claim.
   - **Apple:** the address is `@icloud.com`, `@me.com`, `@mac.com`, or a Hide My Email relay (`@privaterelay.appleid.com`).
3. **How rules 1 and 2 apply.** Both providers call `mapProfileToUser(profile)`, and its result overrides `emailVerified`. Ours, `providerIdentity()` in `src/server/auth/identity.ts`, works as follows:
   - **No local user with this email:** keep the provider's `email_verified`. A new account is created confirmed. We trust Google and Apple to vouch for an address once.
   - **This identity is already linked:** keep it. Better Auth finds the account by provider and subject, not by email.
   - **A local user exists and is unconfirmed:** delete it, as a pending sign-up (as in §5.1). The person is then created fresh from the provider.
   - **A local user exists, is confirmed, and the provider isn't authoritative:** return `emailVerified: false`. Better Auth then refuses the implicit link (`account_not_linked`), and the sign-in page says "Sign in another way, then connect Google from Your account."
   - It also returns `image: null`, so photos aren't kept.
4. **Explicit linking** happens from **Your account**, with a recent sign-in (§5.8). It calls `auth().api.linkSocialAccount({ body: { provider, callbackURL: '/account' } })`. `allowDifferentEmails: true` lets someone connect a personal Google account, or an Apple account hiding its email, to their work account. Better Auth refuses an identity already linked to another Gaff user, and we say "That Google account is already used by another Gaff account."
5. **Unconfirmed accounts never keep unproven ways in.** Each path that confirms an email handles it:
   - an email code: `revokeUnprovenAccountAccess`;
   - a password reset: the password is overwritten;
   - a new sign-up: the pending user is replaced (§5.1);
   - Google or Apple: the pending user is replaced (rule 3).
6. **Passkeys belong to the signed-in account that registered them** and are never linked by email.

### 5.7 Passkeys (AU6)

- **Relying party:**
  - **Domain:** `rpID` is `PASSKEY_RP_ID`, which defaults to `APP_URL`'s hostname. Choosing the registrable domain (for example `gaff.ie`) lets passkeys work on its subdomains.
  - **Origin:** `origin` is `APP_URL`.
  - **Other deployments:** the test copy has its own rpID, so passkeys made there don't work in production. Vercel preview URLs can't use passkeys.
- **Registration:**
  - **Credential type:** discoverable credentials (`residentKey: 'required'`), so signing in needs no email.
  - **Who can register:** only a signed-in user with a recent sign-in. A `hooks.before` on `/passkey/generate-register-options` checks the session's age (§5.8).
  - **Name:** a default such as "Passkey added Saturday 8 November", which the person can rename.
- **Sign-in:**
  - **Button:** **Sign in with a passkey** calls `authClient.signIn.passkey()`.
  - **Autofill:** the email field has `autocomplete="username webauthn"`. Where `PublicKeyCredential.isConditionalMediationAvailable()` resolves true, the page starts `authClient.signIn.passkey({ autoFill: true })`, so the browser offers passkeys in its autofill.
  - **Without JavaScript or WebAuthn:** both are absent, and nothing else depends on them.
- **The prompt after the first sign-in** is a dismissible dashboard card. It shows only where `isUserVerifyingPlatformAuthenticatorAvailable()` is true and the user has no passkey. Dismissing it sets a cookie, because the prompt is about this device.
- **Client:** `src/lib/auth-client.ts` uses `createAuthClient` from `better-auth/react` with `passkeyClient()`. Only passkey components import it.

### 5.8 Confirm it's you (AU7)

Changing how you sign in needs a session created in the last hour. That covers connecting or disconnecting Google or Apple, adding or removing a passkey, and setting or changing a password.

- Gaff's actions check `session.createdAt` through `requireRecentSignIn()`.
- `session.freshAge = 3600` makes Better Auth's own fresh-only endpoints, such as `unlink-account`, agree.
- A stale session goes to `/confirm?next=/account`, which offers only this account's methods. Success creates a new session, and the action revokes the old one.

Signing out other devices isn't gated: it only protects the person.

### 5.9 Your account (AU7, AU8)

| Section | Data | Actions |
| --- | --- | --- |
| You | `users.name`, `users.email` | Change name (`updateUser`). Changing email is phase 2. |
| Sign-in methods | `accounts` (`credential`, `google`, `apple`, with dates), `passkeys` (name, date, synced or not from `backed_up`) | Connect (`linkSocialAccount`); disconnect (`unlinkAccount`; with `allowUnlinkingAll`, because email codes always work); set a password (`setPassword`, server-only); change it (`changePassword` with `revokeOtherSessions: true`); rename or remove a passkey |
| Signed-in devices | `sessions` for this user, read directly (Better Auth's `list-sessions` is fresh-only): `describeDevice(user_agent)` (for example "Chrome on Mac"), last active (`updated_at`), "This device" | Sign out one (`revokeSession`); sign out all others (`revokeOtherSessions`) |

### 5.10 Invitations and team (AU9, AU10)

Use cases live in `src/server/team/`. Each runs inside `withOrg()` and writes its event in the same transaction (rule 8).

| Use case | Rules | Event |
| --- | --- | --- |
| `inviteMember(member, { email, role })` | Admin only. Not an existing member of this workspace. At most 20 a day per workspace. One pending invitation per email; inviting again resends. The email goes out after the commit. | `member.invited { invitationId, role }` |
| `resendInvitation` | Admin. A new token and expiry; the old link stops working. | `member.invitation_resent { invitationId }` |
| `revokeInvitation` | Admin. | `member.invitation_revoked { invitationId }` |
| `acceptInvitation(user, invitationId)` | Pending and not expired. The user's **confirmed** email equals the invited email, ignoring case. The user has no membership yet (one workspace per person, until AU25). Inserts the membership and marks the invitation accepted, once only. | `member.joined { role, invitationId }` |
| `changeRole(member, userId, role)` | Admin. The workspace keeps at least one admin. | `member.role_changed { from, to }` |
| `removeMember(member, userId)` | Admin. Never the last admin. Deletes the membership, deletes the person's sessions, and emails them. | `member.removed { role }` |

- **The join page** (`/join/[token]`, in the `(auth)` group) shows the invitation's state.
  - **Not signed in:** "Sign in to join" or "Create your account to join". The email is fixed, and `next=/join/<token>`.
  - **Signed in as the invited email:** **Join Halcyon Lettings**, a POST.
  - **Signed in as someone else:** "Sign out and continue".
  - **Mismatched email after Google or Apple:** the explanation from the PRD.
  - The link itself never signs anyone in or accepts anything, so email scanners and forwarded emails can't act on it.
- **Showing whether the invited email already has an account** is fine on this page: whoever holds the link was sent it. To keep it from admins, the "already in another workspace" check happens at acceptance, not when inviting.
- **The welcome page** lists pending invitations for the signed-in user's confirmed email, through a `withSystem()` lookup by email, above "Set up a new workspace". Accepting from there uses the same use case: the confirmed email is the proof, so no token is needed.
- **Hide My Email on the welcome page.** For an Apple relay address, the welcome page adds a short note: colleagues will see the relay address, and connecting Google or a password with their real email from Your account keeps everything on one account.
- **Settings, Team** (`/settings/team`) shows members (name, email, role, "You") and pending invitations. Admins get the invite form and the row actions. Negotiators see the list only.

### 5.11 Signing out

Unchanged: `auth().api.signOut`. Removal from a workspace (§5.10) and a password reset (§5.4) delete sessions on the server, so the next request finds no session.

## 6. Limits (AU12)

**Today's gap.** Better Auth's rate limiter runs in its HTTP router (`onRequest`). Calls through `auth().api.*`, which is how every Gaff server action reaches it, skip the limiter. So today's `requestSignInLink` has no limit, whatever the comment in `auth.ts` says.

**The fix:**

- **One limiter, ours** (`src/server/auth/limits.ts`). `consume(scope, identifier, max, windowSeconds)` is a single atomic upsert on `auth_limits`. The key is `sha256(scope | identifier)`, so no network address or email is stored.
- **Wired once.** A Better Auth `hooks.before` middleware runs it for every auth endpoint. Hooks run for in-process `auth().api` calls and HTTP requests alike, so the OAuth callback and passkey endpoints are covered too.
- **Better Auth's own limiter is off.** It covers only HTTP and keeps plain network addresses.
- **The network address** is the first entry of `x-forwarded-for`, which Vercel sets, or `local` when there's none.

| Action | Per network address | Per email |
| --- | --- | --- |
| Sign in with a password | 5 a minute | 10 failures in 15 minutes pauses password sign-in for 15 minutes; codes still work |
| Create an account | 3 a minute | 3 in 10 minutes |
| Send a code (any purpose) | 3 a minute | 5 an hour; extra sends are skipped without saying so |
| Check a code | 10 a minute | 5 tries per code (`allowedAttempts`) |
| Start Google or Apple; callbacks | 10 a minute | |
| Passkey sign-in | 10 a minute | |
| Join page | 30 a minute | |
| Invitations | | 20 per workspace a day |

**Counting failures.** The failure counter is a `hooks.after` on `/sign-in/email` that counts `INVALID_EMAIL_OR_PASSWORD` answers. With `GAFF_ENV=test`, limits are multiplied by 100 instead of switched off, so end-to-end runs still exercise the code. Integration tests check the real numbers.

## 7. Emails (AU11)

- **Where they live.**
  - **Sending:** `src/server/auth/emails.ts` sends through `emailSender()` from `gaffSender()`, as today's sign-in email does.
  - **Words:** `src/copy/operator-emails.ts`.
  - **When:** in the background through `advanced.backgroundTasks` (Next.js `after()`), so a response never waits for the provider and never shows by its timing whether an email went out.
- **Templates:** sign-in code; confirm email; reset code; account exists; password changed; method added (Google, Apple or passkey); invitation; removed from a workspace.
  - Code emails put the code in the subject and the first line.
  - Each email says how long the code lasts and that nobody from Gaff will ask for it.
- **Idempotency key** for each send: purpose plus a hash of the code or event, so a provider retry sends once.
- **Apple Hide My Email.** The sending domain (`MAIL_FROM_DOMAIN`) is registered with Apple's Private Email Relay (§11). Otherwise relay addresses silently drop our mail.

## 8. Security review

| Threat | Mitigation |
| --- | --- |
| Credential stuffing, password spraying | Per-address and per-email limits; breached passwords refused; at least 12 characters; passkeys and Google or Apple offered first |
| Account enumeration | Same answers and timing for known and unknown emails (Better Auth's generic duplicate sign-up, reset and code answers, background sending, password hashing for unknown emails); join-page lookups limited |
| Pre-account hijacking (an attacker registers the victim's email first) | §5.6 rules 1, 3 and 5; codes bound to the browser that signed up (§5.1) |
| Linking through an address the provider doesn't host | Email authority (§5.6 rule 2) |
| OAuth CSRF, code injection | `state` in the database and a signed cookie; PKCE; ID token checks (Better Auth) |
| Open redirects | Better Auth checks `callbackURL` against `trustedOrigins`; Gaff's `next` must be a relative path |
| Session theft | HTTP-only, `Secure`, `SameSite=Lax` cookies; HSTS (as now); sessions listed and revocable; reset and removal delete sessions |
| CSRF on forms | Next.js checks the origin of server actions; Better Auth checks origins on its own routes |
| Email bombing, sending costs | Per-address code cap; per-network-address limits |
| Guessing codes | 6 digits, 5 tries, 10 minutes, 10 checks a minute per address: about 1 in 200,000 per code |
| Link scanners, forwarded emails | Codes instead of sign-in links; invitations need the invited, confirmed email and a POST |
| Phishing | Passkeys are phishing-resistant; code emails warn never to share the code |
| Secrets | `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` and `APPLE_PRIVATE_KEY` are sensitive Vercel variables, never logged; Apple's client secret is generated and renewed automatically |
| Personal data in logs (rule 8) | Better Auth logger at `warn` through `redactingLog`, which replaces email addresses and long tokens; never log codes or passwords |

## 9. Privacy, events and retention

| Data | Where | Why | Deleted |
| --- | --- | --- | --- |
| Name, email | `users` | Who the operator is | By the nightly job: unconfirmed after 7 days; no workspace and not signed in for 30 days (unless an invitation waits, or decisions refer to them; see AU24) |
| Password hash (scrypt) | `accounts` | Password sign-in | When removed, or with the user |
| Google or Apple subject ID | `accounts` | Recognise the identity | When disconnected, or with the user |
| Provider tokens | Not kept | Gaff doesn't call Google or Apple after sign-in | `databaseHooks.account.create.before` and `update.before` null `accessToken`, `refreshToken` and `idToken` |
| Passkey public key and name | `passkeys` | Passkey sign-in | When removed, or with the user |
| Session token, network address, browser | `sessions` | Stay signed in; recognise devices | When the session ends; expired rows nightly |
| Codes, OAuth state, challenges (hashed) | `verifications` | Flows in progress | Minutes; expired rows nightly |
| Invitation email | `invitations` | Invite a colleague | 30 days after it's accepted, cancelled or expired (the events keep IDs only) |
| Limit counters (hashed keys) | `auth_limits` | Abuse protection | After a day |
| Sign-in events | `auth_events` | Measures; phase 2 security activity | After `RETENTION_RECORD_MONTHS` (12) |
| Last method used | Browser cookie | "Last used" (AU15) | 30 days |

**Team events** go in the existing `events` table and catalogue (§5.10). They're written in the use case's transaction, with IDs and role codes only.

**Sign-in events** go in the new `auth_events` table, with their own Zod catalogue checked by the existing `assertNoPersonalData`:

| Type | Payload |
| --- | --- |
| `auth.signed_up`, `auth.signed_in`, `auth.method_added`, `auth.method_removed` | `{ method }` |
| `auth.sign_in_failed` | `{ method, reason }`, where `reason` is `wrong_password`, `unconfirmed`, `paused`, `code_invalid`, `code_expired`, `provider_error` or `link_refused` |
| `auth.email_confirmed` | none |
| `auth.password_changed` | `{ how: 'reset' \| 'account' }` |
| `auth.sessions_revoked` | `{ count }` |
| `auth.code_sent` | `{ purpose }` |

`method` is `password`, `email_code`, `google`, `apple` or `passkey`.

They're written from Better Auth's database hooks and `hooks.after`:

- Where Better Auth runs a transaction (sign-up, a new OAuth user, a reset), the hook writes through Better Auth's current adapter, so the event joins that transaction.
- Elsewhere it's written straight after Better Auth's own write, and a failure is logged but never blocks a sign-in. **This is a deliberate, narrow exception to rule 8's "same transaction" wording, for the CTO to accept.** These are measures, not the letting record, and a lost one can't change a renter's chances.

**Housekeeping (AU14).** `sweepAuth(now)` in `src/server/auth/sweep.ts` runs from the existing daily job after `sweepPersonalData`. It deletes the rows marked "nightly" above and logs counts only.

## 10. Configuration

New variables, validated in `src/lib/env.ts` in the same style as the existing stand-ins:

| Variable | Meaning | Rules |
| --- | --- | --- |
| `SOCIAL_SIGN_IN` | `stand_in` (local identity provider, §14) or `live` | Defaults to `stand_in` outside production. Production refuses `stand_in`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client | Required when `live` |
| `APPLE_CLIENT_ID` | Apple Services ID, for example `ie.gaff.signin` | Required when `live` |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign Apple's client secret (the key is the .p8 file's PEM) | Required when `live` |
| `PASSKEY_RP_ID` | Passkeys' domain | Defaults to `APP_URL`'s hostname; must be that hostname or a parent of it |
| `PASSWORD_BREACH_CHECK` | `pwned_passwords` or `stand_in` | Production requires `pwned_passwords` |

**Breached-password check:**

- **Port and adapters:** port `src/ports/password-breach.ts`. The live adapter calls `https://api.pwnedpasswords.com/range/<first 5 of SHA-1>` with `Add-Padding: true` and a 2-second timeout. The stand-in refuses a short fixed list, for tests.
- **When the service is down:** the adapter lets the password through and logs a warning. Better Auth's `haveIBeenPwned` plugin isn't used, because it refuses every password when the service is down, which would block sign-ups.

`.env.example`, `docs/deploy.md` and the Vercel project get the new variables.

## 11. Setting up Google and Apple

**Google (founders, about 30 minutes, then brand verification):**

1. In Google Cloud, create a project for Gaff. Configure the Google Auth Platform's branding: external users, app name "Gaff", support email, logo, home page, privacy notice and terms links, and Gaff's domain as an authorised domain.
2. Scopes: `openid`, `email`, `profile`. These are non-sensitive, so no security assessment is needed. Publish the app (testing mode is limited to listed test users) and submit brand verification so the name and logo show.
3. Create an OAuth client of type "Web application". Authorised redirect URIs: `https://<production domain>/api/auth/callback/google` and `https://<test copy domain>/api/auth/callback/google`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel for both environments.

**Apple (founders, about an hour, after enrolment):**

1. Enrol in the Apple Developer Program as an organisation (needs a D-U-N-S number; $99 a year).
2. Create an App ID with Sign in with Apple. Then create a Services ID (the `APPLE_CLIENT_ID`) with Sign in with Apple, configured with:
   - the domains: production and the test copy;
   - the return URLs: `https://<domain>/api/auth/callback/apple`.
   Apple accepts neither `localhost` nor `http`, so local development uses the stand-in.
3. Create a key with Sign in with Apple. Download the .p8 once and keep it in the founders' password manager. Note the Key ID and the Team ID.
4. Under "Sign in with Apple for Email Communication", register `MAIL_FROM_DOMAIN` and `no-reply@<MAIL_FROM_DOMAIN>`. SPF must pass, and DKIM is recommended. Resend's records cover both.
5. Set the `APPLE_*` variables in Vercel.

## 12. Code layout

```text
src/domain/auth/                pure rules, unit-tested first
  email-authority.ts            is the provider authoritative for this email?
  password-rules.ts             12–128 characters, not the email address; messages
  invitations.ts                status (pending, expired, accepted, revoked); can this user accept?
  team-rules.ts                 the last admin stays; allowed role changes
  safe-next.ts                  relative paths only
  devices.ts                    "Chrome on Mac" from a user agent
  sign-in-errors.ts             provider and Better Auth codes → message keys
src/server/auth/
  auth.ts                       configuration (§3)
  providers.ts                  live Google and Apple; stand-in generic OAuth providers
  identity.ts                   providerIdentity(): pending replacement and linking trust (§5.6)
  apple-client-secret.ts        ES256 client secret with node:crypto
  emails.ts                     every auth email (§7)
  limits.ts                     consume(), the hooks, the failure pause (§6)
  pending.ts                    the signed gaff.pending cookie
  auth-events.ts                catalogue and recording (§9)
  member.ts                     as now, plus requireRecentSignIn()
  sweep.ts                      sweepAuth()
src/server/team/                invitations.ts, members.ts, queries.ts (§5.10)
src/ports/password-breach.ts    and src/adapters/password-breach/ (pwned-passwords, stand-in)
src/app/(auth)/                 sign-in (+ /code), sign-up (+ /confirm), forgot-password (+ /code),
                                confirm, join/[token], welcome (pending invitations)
src/app/(workspace)/account/    Your account
src/app/(workspace)/settings/team/
src/app/dev/sign-in-provider/   the stand-in identity provider (DEV_TOOLS only)
src/lib/auth-client.ts          browser client, for passkeys only
src/ui/                         SocialButton, PasswordField, CodeField, TextDivider, PasskeyButton
src/copy/operator-emails.ts     the new emails
src/db/schema/                  auth.ts (passkeys, authLimits, authEvents, users.lastSignedInAt);
                                organisations.ts (invitations)
```

The ADR-0007 lint rule is untouched: nothing here creates a `PersonDecision`.

## 13. Screens and components (AU13)

Accessibility follows WCAG 2.2 AA. For 3.3.8, Accessible Authentication, paste and password managers work everywhere and there are no puzzles. For 3.3.7, Redundant Entry, the email carries from step to step in `gaff.pending`. Every page gets an axe check (§14).

- **Layout:** the `(auth)` layout stays: one centred card, comfortable density (48px controls). The workspace header's name links to **Your account**, and Settings links to **Team**.
- **SocialButton:**
  - **Style:** the secondary button (`surface-1`, `border-strong`, `ink`, `radius-md`, full width), labelled "Continue with Google" and "Continue with Apple". Both are the same size and weight, as Apple's guidelines ask.
  - **Marks:** the official ones as inline SVG. Google's "G" keeps its colours. Apple's logo uses `currentColor`, so it's black in the light theme and white in the dark, both of which Apple allows. The marks are brand assets, not styling: the button itself uses tokens only, and no new colour pairs are needed.
- **PasswordField:** a text field with a **Show** toggle (`aria-pressed`, 44px). It sets `autocomplete="current-password"` or `"new-password"` and `passwordrules="minlength: 12; maxlength: 128;"`, and its hint reads "At least 12 characters. A short sentence works well."
- **CodeField:** one input (not six), with `inputmode="numeric"`, `autocomplete="one-time-code"` and a large type style. Spaces and dashes in a pasted code are ignored.
- **PasskeyButton:** a client component. It renders nothing without WebAuthn.
- **"Last used":** a neutral status pill on the button, read on the server from the `lastLoginMethod` cookie.
- **Errors:** a `danger` notice at the top with field errors, as on today's sign-in form. Success states use `role="status"`.
- **One primary button per view:** **Sign in**, **Create account**, **Continue**, **Join Halcyon Lettings**. Everything else is secondary or quiet.

## 14. Testing

Tests are named with AU IDs and use synthetic data only.

**Unit** (`src/domain/auth/*.test.ts`): email authority (Gmail, `hd`, other domains, Apple's domains and relay); password rules; invitation states and acceptance; the last-admin rule; safe `next`; device descriptions; error mapping; the Apple client secret's shape, signed with a test key.

**Integration** (real Postgres, Better Auth in-process through `auth().api` with test headers):

| Area | Checks |
| --- | --- |
| AU1, AU2 | Sign-up creates an unconfirmed user and a hashed code. Confirming signs in. A duplicate confirmed email answers the same and sends "account exists". A duplicate unconfirmed email is replaced. A code bound to another sign-up is refused. |
| AU3 | A code sign-in creates a user, and removes an unconfirmed user's password. |
| AU4 | Using stand-in claims: an authoritative email links; a non-authoritative one is refused; a pending local user is replaced; an Apple relay address makes a new account; tokens and photos aren't stored; an identity already linked elsewhere is refused on explicit linking. |
| AU5 | A reset deletes sessions, creates a password for a Google-only user, and emails; an unknown email gets the same answer and no email. |
| AU9, AU10 | RLS (another workspace sees nothing); hashed tokens; expiry; one pending invitation per email; acceptance only with the matching confirmed email; one workspace per person; the last admin; removal deletes sessions; event payloads hold IDs only. |
| AU12 | Windows and maximums; the per-email pause; the code cap; **in-process calls are limited** (regression test for today's gap). |
| AU14, AU16 | The sweep deletes exactly the right rows; events are written and pass `assertNoPersonalData`. |

**End to end** (Playwright, axe on every new page, screenshots):

- **Accounts and sign-in:** sign-up with a password, code, welcome; password sign-in, including a wrong password; code sign-in; reset.
- **Google and Apple, through the stand-in:**
  - Google, as a new account and as a link.
  - Apple, through its form post, including Hide My Email.
- **Passkeys:** add one, then sign in with it, using Chrome's virtual authenticator through a CDP session (`WebAuthn.addVirtualAuthenticator`).
- **Your account:** connect, disconnect, devices, sign out others.
- **Teams:**
  - inviting, then joining with a password;
  - a Google email mismatch;
  - joining from the welcome page;
  - removal signs the person out.
- **Without JavaScript:** sign-in and sign-up once with `javaScriptEnabled: false`.

`tests/e2e/support.ts` changes one helper: `signIn()` uses an email code from the development outbox. That keeps the 27 existing journeys working.

**The stand-in identity provider** (`SOCIAL_SIGN_IN=stand_in`) follows the codebase's pattern of stand-ins (outbox, fake SMS, fake AI, the check page):

- **What it is:** a small OpenID Connect provider served by Gaff under `/dev/sign-in-provider/[google|apple]/` when `DEV_TOOLS` is on, with authorise, token, JWKS and discovery endpoints.
- **The tester's page:** the authorise page lets a tester pick an identity: email, name, confirmed or not, a Workspace `hd`, or Hide My Email.
- **How Better Auth uses it:** through `genericOAuth`, with provider IDs `google` and `apple`, PKCE, and `responseMode: 'form_post'` for Apple. Better Auth serves generic providers through the same `signInSocial` call and `/api/auth/callback/:id` route as the live ones, so the start action, the callback, the account rows, the linking rules (`providerIdentity()` is shared) and the sessions are the code that runs in production.
- **What it doesn't exercise:** Google's and Apple's own endpoints. Those are checked by hand on the test copy.

**By hand, on the test copy with real Google and Apple, before launch:**

- **Google and Apple:**
  - a new account;
  - a link to a password account;
  - a non-Gmail Google account refused, then connected from Your account;
  - Apple's name kept from the first time;
  - mail arriving through Hide My Email;
  - cancelling at the provider.
- **Passkeys** on an iPhone, an Android phone, Windows and a Mac.
- **Browsers:** Safari, Chrome, Firefox and Edge.

## 15. Rollout and migration

1. Apply the migration (it only adds).
2. **Existing operators** (the test copy, and any early pilot) need nothing:
   - Their users are already confirmed, because the magic link set `email_verified`.
   - They sign in with an email code, or with Google or Apple on an authoritative address, and can add a password or passkey.
   - Old sign-in links last 15 minutes, so removing the plugin strands nobody.
3. **Releasing:**
   - **The order of work** is the build order below, on the test copy first. Real Google and Apple go live there before production.
   - **What shows:** the Google and Apple buttons appear when their variables are set (or with the stand-in), and passkeys appear where the browser supports them. No feature flags are needed.

## 16. Build order

One requirement at a time, each tested in order: the domain rules, then the use case with integration tests, then the screen with E2E and axe. `pnpm check` and `pnpm test:e2e` pass, and `docs/status.md` is updated.

1. Foundations: migration, env validation, `limits.ts`, `pending.ts`, `auth-events.ts`, the redacting logger, the config refactor. No visible change.
2. `feat(AU12)`: limits on every auth call. This closes today's gap first.
3. `feat(AU3)`: email codes replace sign-in links. The E2E helper switches here.
4. `feat(AU1, AU2)`: create an account with a password, confirmed by code.
5. `feat(AU3)`: password sign-in and the per-email pause.
6. `feat(AU5)`: reset by code.
7. `feat(AU1, AU3, AU4)`: Google and Apple, the stand-in, the linking rules.
8. `feat(AU6)`: passkeys.
9. `feat(AU7, AU8)`: Your account, and confirm it's you.
10. `feat(AU9)`: invitations, the join page, the welcome page.
11. `feat(AU10)`: team management.
12. `feat(AU11)`: security emails.
13. `feat(AU14)`: housekeeping in the nightly job.
14. `feat(AU15, AU16)`: "Last used" and sign-in events.

## 17. Phases 2 and 3

**Phase 2:**

- **Two-step verification (AU20):** Better Auth's `twoFactor` plugin (TOTP, backup codes, trusted devices for 30 days). A workspace's requirement is enforced in `requireMember()`. A passkey sign-in with user verification counts as both steps.
- **Change email (AU23):** `emailOTP`'s `requestEmailChangeEmailOTP` and `changeEmailEmailOTP`. Both need an authoritative session.
- **Delete an account (AU24):**
  - `decisions.decided_by` refers to `users`, so a deleted member becomes a tombstone. Their name is kept for the record's 12 months (Q3), and their email, methods and sessions go.
  - Needs the solicitor's view on how long an operator's own staff record is kept.
- **Several workspaces (AU25):** an active organisation on the session (`session.additionalFields`), read by `findMember()`.

**Phase 3 (renters, with Q25 profiles):**

- **Identity:** the same Better Auth instance and `users` table. A person's role comes from their links: a membership makes them an operator; `renter_profiles.user_id` makes them a renter. One person can be both, for example a negotiator who rents.
- **Access:** renter pages under `/me` use `requireRenter()`. Workspace pages keep `requireMember()`, and tests prove neither opens the other.
- **Methods:** email code, Google, Apple and passkeys. Renter sign-in screens offer no password.
- **What stays:** private links for every letting step.
- **Retention:** per Q25 (on request, or 2 years without use).
- **Open:** one identity or two separate realms (more isolation, twice the surface). Recommendation: one identity, decided with the solicitor's view on Gaff as controller of profiles.

## 18. Risks

| Risk | Mitigation |
| --- | --- |
| A Better Auth upgrade changes linking or plugin behaviour | Versions pinned; `@better-auth/passkey` pinned to the same version; the AU4 integration tests encode the linking rules |
| Apple's quirks (name once, relay mail, form post, client secret) | Each handled above, and on the manual checklist |
| Google brand verification takes days | Start as soon as the domain is chosen; until then the app shows its domain instead of the name |
| Slow code emails | Resend after 60 seconds; "check your spam" hint; passkeys, Google and Apple reduce reliance on email |
| Passkey gaps on older devices | Always optional, never the only method |
| A busier sign-in card | One primary button, secondary methods, "Last used"; checked in the founder's end-to-end test |

## 19. Documents to update once this is accepted

- **`CLAUDE.md` rule 10:** add Google and Apple (identity, operator sign-in) and Pwned Passwords (receives no personal data) to the approved list, once the founders approve. In "Architecture", operators sign in with Better Auth (Google, Apple, password, passkeys, email codes).
- **ADRs:**
  - ADR-0013: "Operator sign-in superseded by ADR-0015". Its renter and landlord part stays.
  - `docs/adr/README.md`: ADR-0015 accepted.
- **`docs/architecture.md`:** the Sign-in row; `passkeys`, `invitations`, `auth_limits` and `auth_events` in the data model; Google, Apple and Pwned Passwords in Services and providers.
- **`docs/launch-checklist.md`:** Google's OAuth client and branding; Apple's enrolment, Services ID, key and email relay; the new variables; the manual pass in §14.
- **`docs/open-questions.md`:**
  - Q27: approvals for Google, Apple and Pwned Passwords.
  - Q28: one workspace per person until phase 2.
  - Q29: renter sign-in (phase 3).
- **`docs/testing-guide.md`:** signing in locally with an email code from the outbox, the stand-in Google and Apple, and passkeys with Chrome's WebAuthn panel.
- **`docs/status.md`:** progress per AU requirement.

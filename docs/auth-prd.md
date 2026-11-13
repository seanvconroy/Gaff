# Sign-in and accounts: product requirements

Draft, 8 November 2026, for Sean to agree. The technical design is in [auth-tech-spec.md](auth-tech-spec.md), and the decision record is [ADR-0028](adr/0028-sign-in-methods.md) (proposed). Requirement IDs start with **AU**, so they don't clash with the main PRD's R1 to R31.

## Summary

Operators sign in to Gaff today with a one-time link sent by email, and nothing else. This project gives them the ways in people expect from good software, keeps them safe, and lets an agency bring its whole team.

- **Who:** operators. That means letting agents, their negotiators, and landlords letting their own homes. Renters and landlords keep their private links with no account, as the PRD promises (R9, R19). Renter sign-in comes later, with renter profiles (Q25, phase 3).
- **Ways in:** Google, Apple, email and password, a passkey (Face ID, Touch ID or Windows Hello), or a 6-digit code sent by email.
- **One person, one account:** whichever way someone signs in, they reach the same account. Gaff links methods by confirmed email when it's safe, and asks first when it isn't.
- **Teams:** an admin invites colleagues by email, and each person signs in as themselves.
- **Built on Better Auth**, which Gaff already uses. Accounts stay in Gaff's own database in Ireland. No new identity service holds operators' data.

## Why now

- **Email links are slow and fragile.** Every sign-in means a trip to the inbox. A link opened in another browser signs in the wrong browser. Email security scanners (common in Microsoft 365) can open a link first and use it up.
- **People expect choices.** Some want a password and a password manager. Others live in Google or on an iPhone and want one tap.
- **Agencies have teams, but Gaff has no way to add a colleague.** [ADR-0013](adr/0013-sign-in-operators-links-for-renters.md) promised invitations, but they aren't built, so every sign-up creates a new workspace. A shared login would break the record of who decided what (Principle 1, ADR-0007) and is unsafe.
- **ADR-0013 asks for passkeys or two-step sign-in before a wider rollout.** Passkeys come in this phase and two-step verification in phase 2.
- **Today's sign-in form has no rate limit.** It calls the sign-in library from a server action, which skips the library's limiter, so anyone could send sign-in emails to any address over and over. This project closes that.

## Goals and success measures

| Measure | Target | How it's measured |
| --- | --- | --- |
| Sign-up completion | At least 80% of started sign-ups reach a confirmed account | Sign-in events (AU16) |
| Sign-in success | At least 95% of returning operators are in within two attempts | Sign-in events |
| Strong sign-in | At least half of active operators use a passkey, Google or Apple after their first month | Sign-in methods on accounts |
| Invitations | At least 90% accepted within 7 days | Invitations table |
| Help needed | No sign-in support requests in a typical pilot month | Founders' support log |
| Account takeovers | None | Incident log |

## Users

| Who | What they need from sign-in |
| --- | --- |
| Admin: the agency owner or the landlord who set up Gaff | Get in fast; invite colleagues; remove someone who leaves, at once |
| Negotiator: invited by an admin | Join with a few taps, on a phone or a laptop, with whatever they already use |
| Portfolio landlord: a one-person workspace | The same as an admin, without the team features getting in the way |
| Renter (phase 3) | Optional: get back to their own Gaff profile without a password. Never needed for a letting step. |

## Principles

1. **One person, one account.** The confirmed email address is who you are. Google, Apple, a password and passkeys are keys to the same door.
2. **Fast for people coming back.** One tap where the device allows it (passkey, Google, Apple). Gaff remembers which way you used last.
3. **Safe by default.** Gaff never links accounts on a guess. It never says whether an email has an account. It uses codes instead of links, refuses passwords known from data breaches, and tells you by email when something about your sign-in changes.
4. **Works for everyone.** Every way in works on a phone and a laptop, with password managers and screen readers. That means WCAG 2.2 AA, including 3.3.8 Accessible Authentication: paste and autofill always work, and there are no puzzles.
5. **No new home for operators' data.** Accounts stay in Gaff's database in Ireland (rule 10). Google and Apple only confirm who someone is.
6. **Plain words.** Every screen and email says what happens next, in Gaff's voice.

## Phases

| Phase | What | When |
| --- | --- | --- |
| **1: this project** | AU1 to AU16: Google, Apple, password, passkeys and email codes; linking; password reset; your account; team invitations; protection against abuse | Before the first pilot with more than one person in an agency |
| **2: before a wider rollout** | AU20 to AU26: two-step verification, sign-in activity, change of email, deleting an account, one person in several workspaces, sign-in rules per workspace | Before Gaff goes beyond the pilots (ADR-0013) |
| **3: renters** | AU30 to AU33: renters sign in to their own profile | With the renter profiles slice (Q25) |

## How it works for people

### Ann sets up Gaff

1. Ann opens Gaff and chooses **Create an account**.
2. She taps **Continue with Google**, or enters her work email and a password.
   - With a password, Gaff emails her a 6-digit code. She types it in on the same screen, from her phone or her laptop, and her email is confirmed.
   - With Google or Apple, there's no code. They've confirmed her email.
3. She lands on **Set up your workspace** (today's welcome page). Her name is filled in if Google or Apple gave it.
4. Then she lands on her dashboard. A one-time card offers: "Sign in faster next time. Add a passkey to use Face ID, Touch ID or Windows Hello."

### Ann comes back

- On her own laptop, the browser offers her passkey as soon as she taps the email field. One touch and she's in.
- Or she taps **Continue with Google**, marked **Last used**.
- Or she types her email and password. Her password manager fills both.
- Or she taps **Email me a code instead** and types the code.

### Ann forgets her password

1. **Forgot your password?** asks for her email.
2. Gaff says: "If there's a Gaff account for ann@halcyon.ie, we've sent a code to it. It works for 10 minutes." Gaff says the same whether or not the account exists.
3. She enters the code and a new password. She's signed in, every other device is signed out, and Gaff emails her to say the password changed.
4. Someone who only ever used Google can do the same to add a password.

### Ann invites Liam

1. In **Settings, Team**, Ann enters liam@halcyon.ie and chooses **Negotiator**.
2. Liam gets an email: "Ann Power invited you to join Halcyon Lettings on Gaff."
3. Ann sees the invitation as pending. She can send it again or cancel it. It expires after 7 days.

### Liam joins

1. Liam opens the link. The page says who invited him, to which workspace, and as what.
2. He continues with Google using liam@halcyon.ie, or creates a password for liam@halcyon.ie and confirms the code.
3. Once he's signed in as liam@halcyon.ie, he taps **Join Halcyon Lettings** and lands on the dashboard.
4. If his Google account uses a different email, Gaff says the invitation is for liam@halcyon.ie and offers to continue with that email instead. After joining, he can connect any Google or Apple account from **Your account**.
5. If Liam signs up without the link, the welcome page shows the pending invitation first, so he doesn't create a second workspace by mistake.

### Ann's phone is stolen

On her laptop, in **Your account, Signed-in devices**, she signs the phone out. Or she signs out everywhere else in one tap.

### Liam leaves the agency

Ann removes him in **Settings, Team**. He's signed out everywhere at once and can no longer reach Halcyon Lettings. His past decisions stay in the record under his name.

## One person, one account

This is what "seamless across the options" means in practice. The rule: **a sign-in method joins an existing account only when Gaff is sure the same person controls that email.**

| Ann first used | Later she… | What happens |
| --- | --- | --- |
| Password, email confirmed | Continues with Google, on a Gmail or Google Workspace address that matches | She's signed in to the same account, and Google is added to her sign-in methods. Gaff emails her to say so. |
| Password, email confirmed | Continues with Google, on a Google account with that email that isn't Gmail or Workspace | Gaff asks her to sign in her usual way first, then connect Google from **Your account** (once). Google can't vouch for emails it doesn't host. |
| Password, never confirmed | Continues with Google or Apple | The unconfirmed sign-up is dropped, and she's signed in with Google or Apple. Nobody had proved the email, so nothing is lost. |
| Password, never confirmed | Creates an account again | The old unconfirmed sign-up is replaced, and a new code goes out. |
| Google | Creates an account with the same email and a password | She sees "Check your email". The email says she already has an account, with links to sign in or reset a password. Nothing changes until she does. |
| Google | Uses **Forgot your password?** | She sets a password. Now both work. |
| Google or Apple | Taps **Email me a code instead** | She's signed in. A confirmed email always works. |
| Apple with **Hide My Email** | Continues with Google using her real email | Two separate accounts, because the emails differ. To use both on one account, she connects the other from **Your account** while signed in. The welcome page explains this to anyone who signs up with a hidden email. |
| Anything | Uses a passkey | She's signed in. A passkey belongs to one account. |

## Requirements: phase 1

| ID | Requirement | Priority |
| --- | --- | --- |
| AU1 | Create an account with Google, Apple, or email and password. Creating an account never needs more than the email, and a password if one is chosen. Name and workspace are asked on the welcome page, as now. | Must |
| AU2 | A password account is confirmed with a 6-digit code before it can be used. The code is typed on the screen where the person started, so it works from any device's inbox. A new code can be sent after 60 seconds. | Must |
| AU3 | Sign in with Google, Apple, email and password, a passkey, or a 6-digit email code. The email code replaces today's sign-in link, and it also creates an account for a new email, as today's link does. | Must |
| AU4 | One person, one account. Methods join an account only by the rules in "One person, one account". Gaff never links on a guess, and never says whether an email has an account. | Must |
| AU5 | Reset a forgotten password with an emailed code. Every other device is signed out, and the person gets an email saying the password changed. | Must |
| AU6 | Passkeys. Add one from a prompt after the first sign-in, or from **Your account**. Sign in with one tap, from a button or from the browser's autofill on the email field. Rename or remove passkeys. | Must |
| AU7 | **Your account**: name and email; sign-in methods (connect or disconnect Google and Apple, set or change a password, passkeys). Email codes always work for a confirmed email, so any other method can be removed. Changing a method needs a sign-in in the last hour, otherwise Gaff asks the person to confirm it's them. | Must |
| AU8 | **Signed-in devices**: each device and browser, when it was last active, and which one this is. Sign out one, or all the others. | Must |
| AU9 | **Team invitations.** An admin invites by email as admin or negotiator. The person joins with any method, signed in as the invited email. Admins can resend or cancel. Invitations expire after 7 days and work once. For now, one person belongs to one workspace. | Must |
| AU10 | **Team management.** Admins change roles and remove people. Removing someone signs them out everywhere. A workspace always keeps at least one admin. Everyone can see who's on the team; only admins change it. | Must |
| AU11 | **Security emails** when a password is set, changed or reset; when Google, Apple or a passkey is added; and when someone tries to create an account with an email that already has one. Each says what happened, when, and what to do if it wasn't you. | Must |
| AU12 | **Protection against abuse.** Limits per network address and per email on sign-in, sign-up, codes and resets, enforced in Gaff's own server code. Codes expire after 10 minutes and allow 5 tries. Repeated wrong passwords for one email pause password sign-in for that email for 15 minutes, while email codes still work, so nobody can lock someone out. Passwords seen in data breaches are refused. | Must |
| AU13 | **Accessible on a phone and a laptop.** WCAG 2.2 AA, including 3.3.8 (paste and password managers work, codes can be pasted, no puzzles) and 3.3.7 (the email is never asked twice). Every form works without JavaScript, except passkeys, which appear only where the browser supports them. | Must |
| AU14 | **Housekeeping by jobs (rule 9).** Expired codes, sessions and invitations, unconfirmed sign-ups after 7 days, and accounts that never joined or created a workspace after 30 days without use are deleted by the nightly job. Gaff keeps only the name and email from Google and Apple: no photo, and no access tokens. | Must |
| AU15 | **"Last used"** marks the method a person used last on this device. | Should |
| AU16 | **Sign-in events**, with no personal data: sign-ups, sign-ins and failures by method, and changes to methods. These measure the goals above, and phase 2 shows them as security activity. | Must |

## Screens

Every auth screen uses today's single centred card ([design-system.md](design-system.md)). The email-and-password action is the one primary button. Google, Apple and passkey buttons are secondary, with the official Google and Apple marks.

| Screen | What's on it |
| --- | --- |
| **Sign in** `/sign-in` | Continue with Google · Continue with Apple · Sign in with a passkey (only where supported) · "or use your email" · Email (the browser offers passkeys here too) · Password, with Show · Forgot your password? · **Sign in** · Email me a code instead · "New to Gaff? Create an account" |
| **Create an account** `/sign-up` | Continue with Google · Continue with Apple · "or use your email" · Work email · Password (at least 12 characters), with Show · **Create account** · terms and privacy line · "Already have an account? Sign in" |
| **Enter your code** | "We've sent a 6-digit code to ann@halcyon.ie. It works for 10 minutes." · one code field (paste and the phone's code autofill work) · **Continue** · Send a new code (after 60 seconds) · Use a different email · "Can't find it? Check your spam folder." |
| **Forgot your password** | Email → code and new password → signed in |
| **Confirm it's you** | Shown before changing how you sign in when your last sign-in was more than an hour ago. It offers only the methods this account has. |
| **Join a workspace** `/join/…` | Who invited you, to which workspace, as what, and until when · the sign-in or create-account options for the invited email · **Join Halcyon Lettings** once you're signed in as that email |
| **Welcome** (today's) | Pending invitations for your email first ("Join Halcyon Lettings"), then "Set up a new workspace" |
| **Your account** | Name and email · Sign-in methods (Google, Apple, password, each passkey) · Signed-in devices |
| **Settings, Team** | People with their role · pending invitations · invite form (email, role) · change role · remove |

When signing in with Google or Apple goes wrong, the person comes back to **Sign in** with one plain line:

- **Cancelled:** "Signing in with Google was cancelled."
- **Can't link yet:** "You already have a Gaff account for this email. Sign in another way, then connect Google from Your account."
- **Too slow, or another browser:** "That took too long or opened in another browser. Try again."
- **Anything else:** "Something went wrong with Google. Try again, or use your email."

## Emails

All come from Gaff's own address, in Gaff's voice, and the words live in `src/copy/operator-emails.ts`.

| Email | When | Subject |
| --- | --- | --- |
| Sign-in code | Email me a code instead | Your Gaff code: 482913 |
| Confirm your email | After creating a password account | Confirm your email for Gaff: 482913 |
| Password reset code | Forgot your password | Your Gaff password reset code: 482913 |
| Account already exists | Someone tries to create an account with this email | You already have a Gaff account |
| Password changed | A password is set, changed or reset | Your Gaff password was changed |
| Sign-in method added | Google, Apple or a passkey is added | Google was connected to your Gaff account |
| Invitation | An admin invites someone | Ann Power invited you to join Halcyon Lettings on Gaff |
| Removed from a workspace | An admin removes someone | You've left Halcyon Lettings on Gaff |

Each code email says how long the code works, that nobody from Gaff will ask for it, and what to do if you didn't ask for it.

## Rules and limits

| Rule | Value |
| --- | --- |
| Code | 6 digits; 10 minutes; 5 tries; a new code after 60 seconds; at most 5 code emails to one address an hour |
| Password | 12 to 128 characters; anything allowed, including spaces and emoji; no rules about mixing character types; refused if seen in a data breach; never the email address itself |
| Session | 14 days, extended each day it's used (as today); ends when the person signs out or is removed, or when their password is reset |
| Recent sign-in | Within the last hour, for changing sign-in methods |
| Invitation | 7 days; works once; at most 20 sent per workspace per day |
| Password attempts | 5 a minute from one network address; after 10 wrong passwords for one email in 15 minutes, password sign-in for that email pauses for 15 minutes (codes still work) |
| Unconfirmed sign-up | Deleted after 7 days |
| Account with no workspace | Deleted after 30 days without use, unless an invitation is waiting |

## Security and privacy

- **No guessing who has an account.** Sign-in, sign-up, reset and code screens look and take the same whether or not the email has an account.
- **Codes, not links, for signing in.** A code can't be used up by an email scanner, and it works when the email is read on another device. Invitation links never sign anyone in: a forwarded invitation can't make Bob into Liam.
- **Hashed at rest:** passwords (scrypt), email codes and invitation tokens. Session cookies are signed. Gaff doesn't store Google or Apple access tokens.
- **Minimal data:** Gaff keeps only the name and email from Google and Apple. A network address and browser are kept only on a live session, so someone can recognise their own devices.
- **Logged without personal data (rule 8):** sign-in events and team changes hold IDs, method codes and dates only.
- **Deleted on schedule (rule 9):** see AU14.
- **Approved vendors (rule 10):** Google and Apple act for the person signing in. They confirm who someone is and pass Gaff a name and email; Gaff sends them nothing about lettings. They still need the founders' approval and a line in the operators' privacy notice. The breached-password check sends only the first 5 characters of a hash of the password, which reveals nothing; it's listed for approval too.
- **Gaff people decide (rule 1) is unchanged.** Every decision is still made by a signed-in member, and now each person has their own login, so the record says who.

## Edge cases

- **Hide My Email (Apple).** Allowed. Colleagues see the relay address, and Gaff's emails reach the person through Apple. Gaff registers its sending domain with Apple so they arrive. The welcome page says so, and suggests connecting Google or a password with their real email from **Your account**. An invitation needs the invited email, so someone hiding their email joins with email first, then connects Apple from **Your account**.
- **Shared mailboxes** (lettings@agency.ie). Each person needs their own account. The Team page says "Invite each person by their own email."
- **Someone in two agencies.** One workspace per person for now. The invitation page explains this, and phase 2 adds a workspace switcher.
- **Lost access to their email.** They can still sign in with a passkey, Google, Apple or a password. If they have none, their admin invites their new email. Gaff staff don't act for operators (Q13).
- **Mistyped email at sign-up.** The code never arrives. The code screen offers "Use a different email".
- **Existing operators (the test copy and early pilots).** Nothing to do. Their accounts keep working. They sign in with an email code, or with Google or Apple on the same email, and can add a password or passkey.

## Out of scope

- Single sign-on (SAML), user provisioning (SCIM) and Microsoft sign-in. Sean decided against Microsoft for now on 8 November 2026; revisit with calendar sync (R31).
- SMS codes: SIM-swap risk and cost.
- Sign-in links: replaced by codes.
- CAPTCHA: only if abuse appears. It would be a new vendor.
- Native apps, usernames, and other social providers.

## Phase 2: before a wider rollout

| ID | Requirement |
| --- | --- |
| AU20 | Two-step verification with an authenticator app, and backup codes. An admin can require it for the team. Passkeys count as two steps. |
| AU21 | Recent security activity on **Your account**, and sign-in activity for admins, from the AU16 events. |
| AU22 | An email when someone signs in on a new device. |
| AU23 | Change your email address, confirmed by a code sent to the new address. |
| AU24 | Delete your account, and offboarding: past decisions stay attributed for the record's 12 months (Q3). |
| AU25 | One person in several workspaces, with a switcher. |
| AU26 | Sign-in rules per workspace, for example "Google only" or "passkeys required". |

## Phase 3: renters

Renter profiles (Q25) need a way back in. Private links stay for every letting step, and a renter never needs an account to enquire, book, apply, sign or pay.

| ID | Requirement |
| --- | --- |
| AU30 | A renter can sign in to their own Gaff profile with an email code, Google, Apple or a passkey. No passwords: fewer resets, and nothing to reuse from other sites. |
| AU31 | Renter and operator access stay apart. A renter account never opens a workspace, and an operator account never opens someone else's profile. |
| AU32 | A renter's account and profile are deleted when they ask, or after 2 years without use (Q25). |
| AU33 | A renter chooses when a profile is used for a letting ("Keep my details for next time"). Signing in never shares anything with an operator by itself. |

The solicitor confirms the data protection position before phase 3 (Gaff is the controller for profiles, Q25).

## Decisions and open questions

**Decided by Sean, 8 November 2026:**

- Operators now; renters in a later phase, with profiles.
- Build on Better Auth, not Clerk. See ADR-0028 for why.
- Google and Apple, not Microsoft, for now.
- Phase 1 includes team invitations, email codes and passkeys. Two-step verification moves to phase 2.

**Open:**

1. **Rule 10 approvals (founders).** Record Google and Apple as approved for operator sign-in, and approve the breached-password check (Have I Been Pwned's Pwned Passwords, which receives no personal data). Recommendation: approve all three.
2. **Operators' privacy notice and terms (solicitor).** Google's and Apple's consent screens need links to both, and the notice should say Google and Apple can be used to sign in.
3. **Apple Developer account (founders).** Enrolling as a company needs a D-U-N-S number and costs $99 a year. Who owns it?
4. **One workspace per person** until phase 2. Recommendation: yes.
5. **Session length.** Keep 14 days, extended with use. Recommendation: keep.

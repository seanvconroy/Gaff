# Sign-in and accounts: product requirements

Asked for by Sean on 8 November 2026, drafted that day, and built from 13 to 14 November 2026 on Sean's instruction to proceed and use best judgement on the open decisions. The technical design is in [auth-tech-spec.md](auth-tech-spec.md), and the decision record is [ADR-0028](adr/0028-sign-in-methods.md). Requirement IDs start with **AU**. The judgement calls to revisit are [Q62 to Q74](open-questions.md#j-sign-in-and-accounts).

> **What changed from the first draft.** The draft was written against `claude/gaff-mvp`, the repository's default branch, which turned out to be 50 commits behind the product. The marketplace, one account per person (ADR-0016) and team invitations (M16) already existed on `claude/epic-ride-0ha68s`, and the build is on that line (Q62). So sign-in is one page for renters, letters and Gaff's staff, not for operators only, and invitations were fitted to it, not built from nothing.

## Summary

Everyone signed in to Gaff with a one-time code or link sent by email, and nothing else. Now there are the ways in people expect from good software, they're safe, and they all reach the same account.

- **Who:** everyone with a Gaff account. That's renters, letters (landlords, agents and their colleagues) and Gaff's own staff: one account per person, for renting, letting or both (M1, ADR-0016). A renter still never needs an account to answer questions, book, apply, sign or pay from their private links (R9, R19).
- **Ways in:** Google, Apple, email and password, a passkey (Face ID, Touch ID, Windows Hello or a security key), or a 6-digit code sent by email.
- **One person, one account:** whichever way someone signs in, they reach the same account. Gaff joins a new way in to an account only when it's sure the same person controls the email, and never on a guess.
- **Teams:** an admin invites colleagues by email, and each person signs in as themselves. An invitation works only for the address it was sent to.
- **Built on Better Auth**, which Gaff already used. Accounts stay in Gaff's own database in Ireland. No identity service holds them.

## Why

- **Email links and codes alone are slow.** Every sign-in meant a trip to the inbox. A link opened in another browser signed in the wrong browser, and email security scanners (common in Microsoft 365) can open a link first and use it up.
- **People expect choices.** Some want a password and a password manager. Others live in Google or on an iPhone and want one tap.
- **A shared login breaks the record.** Each decision about a renter is made by a signed-in person (Principle 1, ADR-0007). Colleagues need their own accounts, and an invitation link that anyone could use was a way onto a team for whoever held it.
- **Gaff's staff need a passkey** (M5), and passkeys didn't exist.
- **The sign-in form had no rate limit.** It called the sign-in library from a server action, which skips the library's limiter, so anyone could send sign-in emails to any address over and over. That's closed.

## Goals and success measures

| Measure | Target | How it's measured |
| --- | --- | --- |
| Sign-up completion | At least 80% of started sign-ups reach a confirmed account | Sign-in events (AU16) |
| Sign-in success | At least 95% of people coming back are in within two tries | Sign-in events |
| Strong sign-in | At least half of active letters use a passkey, Google or Apple after their first month | Sign-in methods on accounts |
| Invitations | At least 90% accepted within 7 days | Invitations table |
| Help needed | No sign-in support requests in a typical pilot month | Founders' support log |
| Account takeovers | None | Incident log |

## Users

| Who | What they need from sign-in |
| --- | --- |
| Renter | Get back to their homes, saved searches and profile quickly, on a phone. Never needed for a step on a private link. |
| Admin: the agency owner, or the landlord who set up the workspace | Get in fast; invite colleagues; remove someone who leaves, at once |
| Agent: invited by an admin | Join with a few taps, on a phone or a laptop, with whatever they already use |
| Gaff staff | A passkey, and nothing weaker, for the tools that see across workspaces (M5) |

## Principles

1. **One person, one account.** The confirmed email address is who you are. Google, Apple, a password and passkeys are keys to the same door.
2. **Fast for people coming back.** One tap where the device allows it: a passkey, Google or Apple.
3. **Safe by default.** Gaff never joins accounts on a guess. It never says whether an email has an account. It uses codes, not links, refuses passwords known from data breaches, and tells you by email when something about your sign-in changes.
4. **Works for everyone.** Every way in works on a phone and a laptop, with password managers and screen readers: WCAG 2.2 AA, including 3.3.8 Accessible Authentication. Paste and autofill always work, and there are no puzzles.
5. **No new home for people's data.** Accounts stay in Gaff's database in Ireland (rule 10). Google and Apple only confirm who someone is.
6. **Plain words.** Every screen and email says what happens next, in Gaff's voice.

## Phases

| Phase | What | State |
| --- | --- | --- |
| **1** | AU1 to AU16: Google, Apple, password, passkeys and email codes; joining them to one account; password reset; "How you sign in"; signed-in devices; team invitations; protection against abuse; housekeeping | **Built**, 14 November 2026, except AU15 and the parts listed under "Not built" |
| **2: before a wider rollout** | AU20 to AU26: two-step verification, sign-in activity, change of email, one person in several workspaces, sign-in rules per workspace | Not started |

Renters were going to be a third phase. They're in phase 1, because a renter's account and a letter's are the same account (Q63).

## How it works for people

### Ann sets up Gaff

1. Ann opens Gaff and chooses **Create an account**.
2. She taps **Continue with Google**, or enters her email and a password.
   - With a password, Gaff emails her a 6-digit code. She types it on the same screen, from her phone or her laptop, and her email is confirmed.
   - With Google on a Gmail or Google Workspace address, or Apple on an iCloud address, there's no code. They host her email, so they can vouch for it.
3. She lands on the welcome page, says what brings her to Gaff, and sets up her workspace.

### Ann comes back

- On her own laptop, the browser offers her passkey as soon as she taps the email box. One touch and she's in.
- Or she taps **Sign in with a passkey**, **Continue with Google** or **Continue with Apple**.
- Or she types her email and password. Her password manager fills both.
- Or she taps **Email me a code instead** and types the code.

### Ann forgets her password

1. **Forgot your password?** asks for her email.
2. Gaff says a code is on its way if there's an account for that address, in the same words whether or not there is one.
3. She enters the code and a new password. She's signed in, every other device is signed out, and Gaff emails her to say the password changed.
4. Someone who only ever used Google or a code can do the same to add a password, or add one under **How you sign in**.

### Ann invites Liam

1. In **Settings, Team**, Ann enters liam@halcyon.ie and chooses **Agent**.
2. Liam gets an email: "Ann Power invited you to Halcyon Lettings on Gaff."
3. Ann sees the invitation under **Invitations waiting**, with the day its link stops working. She can send it again or cancel it.

### Liam joins

1. Liam opens the link. The page says which team, and what he'll be able to do.
2. The invitation is for liam@halcyon.ie, and that address is already filled in. He taps **Email me a code**, or continues with Google, Apple or a passkey.
3. Signed in as liam@halcyon.ie, he taps **Join Halcyon Lettings** and lands on his profile.
4. If he's signed in as someone else, the page says so, and offers **Sign out and use liam@halcyon.ie**. A forwarded link lets nobody else onto the team.

### Ann's phone is stolen

On her laptop, in **How you sign in**, under **Signed-in devices**, she signs the phone out. Or she signs out everywhere else in one tap, and changes her password.

### Liam leaves the agency

Ann removes him in **Settings, Team**. He can no longer reach Halcyon Lettings, from that moment. His past decisions stay in the record. His own Gaff account stays his: he may rent with it (Q71).

## One person, one account

This is what "seamless across the options" means in practice. The rule: **a way to sign in joins an existing account only when Gaff is sure the same person controls that email.**

Google and Apple both say an address is "verified" if they checked it once, even an address they don't run. Only whoever hosts an address knows who controls it today. So Gaff takes Google's word for Gmail and Google Workspace addresses, and Apple's for iCloud addresses and its own Hide My Email addresses, and nobody's word for the rest.

| Ann first used | Later she… | What happens |
| --- | --- | --- |
| A code or a password, email confirmed | Continues with Google, on a Gmail or Google Workspace address that matches | She's signed in to the same account, and Google is added to her ways in. Gaff emails her to say so. |
| A code or a password, email confirmed | Continues with Google, on a Google account with that email which Google doesn't host | Gaff asks her to sign in another way, then connect Google from **How you sign in**, once. |
| Nothing yet | Continues with Google or Apple, on an address they don't host | Gaff asks her to use **Email me a code instead** this first time, then connect it from **How you sign in**. |
| A password, never confirmed | Continues with Google or Apple, on an address they host | The unconfirmed sign-up is dropped, and she's signed in. Nobody had proved the email, so nothing is lost. |
| A password, never confirmed | Creates an account again | The old unconfirmed sign-up is replaced, and a new code goes out. |
| Google | Creates an account with the same email and a password | She sees the same "Confirm your email" as anyone. The email she gets says she already has an account, with links to sign in or choose a password. Nothing changes until she does. |
| Google | Uses **Forgot your password?** | She sets a password. Now both work. |
| Google or Apple | Taps **Email me a code instead** | She's signed in. A confirmed email always works. |
| Apple with **Hide My Email** | Continues with Google using her real email | Two separate accounts, because the emails differ. To use both on one account, she connects the other from **How you sign in** while signed in. |
| Anything | Uses a passkey | She's signed in. A passkey belongs to one account. |
| Anything, signed in | Connects Google or Apple from **How you sign in** | It's joined, whatever address it uses, because she's proved who she is by signing in. |

## Requirements: phase 1

| ID | Requirement | Priority | State |
| --- | --- | --- | --- |
| AU1 | Create an account with Google, Apple, or email and password. Creating an account never needs more than the email, and a password if one is chosen. Name and workspace are asked on the welcome page. | Must | Built |
| AU2 | A password account is confirmed with a 6-digit code before it can be used. The code is typed on the screen where the person started, so it works from any device's inbox. A new code can be sent after 60 seconds. | Must | Built |
| AU3 | Sign in with Google, Apple, email and password, a passkey, or a 6-digit email code. The email code replaces the sign-in link, and it also creates an account for a new email. | Must | Built |
| AU4 | One person, one account. Ways in join an account only by the rules in "One person, one account". Gaff never joins on a guess, and never says whether an email has an account. | Must | Built |
| AU5 | Reset a forgotten password with an emailed code. Every other device is signed out, and the person gets an email saying the password changed. | Must | Built |
| AU6 | Passkeys. Add one from **How you sign in**. Sign in with one tap, from a button or from the browser's suggestions on the email box. Rename or remove passkeys. | Must | Built, without a prompt after the first sign-in (Q72) |
| AU7 | **How you sign in**: add or change a password, connect or disconnect Google and Apple, manage passkeys. Email codes always work for a confirmed email, so any other way in can be removed. Changing a way in needs a sign-in in the last hour; otherwise Gaff asks the person to confirm it's them, with the ways their account already has. | Must | Built |
| AU8 | **Signed-in devices**: each device and browser in plain words, when it signed in and was last used, and which one this is. Sign out one, or all the others. | Must | Built |
| AU9 | **Team invitations.** An admin invites by email as admin or agent. The person joins with any way in, signed in as the invited email. Admins can send an invitation again or cancel it. Invitations work once, for 7 days. For now, one person belongs to one workspace. | Must | Built |
| AU10 | **Team management.** Admins change roles and remove people. A workspace always keeps at least one admin. Everyone can see who's on the team; only admins change it. | Must | Built. Removing someone ends their access at once; it doesn't sign them out of their own account (Q71) |
| AU11 | **Security emails** when a password is set, changed or reset; when Google, Apple or a passkey is added; and when someone tries to create an account with an email that already has one. Each says what happened, when, and what to do if it wasn't you. | Must | Built |
| AU12 | **Protection against abuse.** Limits per network address and per email on sign-in, sign-up, codes, resets, passkeys and invitations, enforced in Gaff's own server code. Codes work for 10 minutes and allow 5 tries. Repeated wrong passwords for one email pause password sign-in for that email for 15 minutes, while email codes still work, so nobody can lock someone out. Passwords seen in data breaches are refused. | Must | Built. The breach check waits for approval (Q65) |
| AU13 | **Accessible on a phone and a laptop.** WCAG 2.2 AA, including 3.3.8 (paste and password managers work, codes can be pasted, no puzzles) and 3.3.7 (the email is never asked twice). Every form works without JavaScript, except passkeys, which appear only where the browser supports them. | Must | Built |
| AU14 | **Housekeeping by jobs (rule 9).** Ended sessions, used-up codes, lapsed invitations and sign-ups nobody confirmed within 7 days are deleted by the nightly job. Gaff keeps only the name and email from Google and Apple: no photo, and no access tokens. | Must | Built. Accounts nobody uses are not deleted yet (Q74) |
| AU15 | **"Last used"** marks the way in a person used last on this device. | Should | Not built: it needs a cookie that isn't strictly necessary (Q72) |
| AU16 | **Sign-in events**, with no personal data: sign-ups, sign-ins and failures by method, and changes to ways in. These measure the goals above, and phase 2 shows them as security activity. | Must | Built |

Marketplace requirements this covers: M1 (amended: passwords are allowed, Q63), M5 (staff passkeys, in production), M6 (passkeys for anyone) and M7 (Google and Apple, brought forward; each still needs approval, Q64).

## Screens

Every sign-in screen is a single centred card ([design-system.md](design-system.md)). The email action is the one primary button. Google, Apple and passkey buttons are secondary, with the official Google and Apple marks.

| Screen | What's on it |
| --- | --- |
| **Sign in** `/sign-in` | Continue with Google · Continue with Apple · Sign in with a passkey (only where the browser can) · "or use your email" · Email (the browser offers passkeys here too) · Password, with Show · Forgot your password? · **Sign in** · Email me a code instead · "New to Gaff? Create an account" |
| **Create an account** `/sign-up` | Continue with Google · Continue with Apple · "or use your email" · Email · Password (at least 12 characters), with Show · **Create account** · "Already have an account? Sign in" |
| **Enter your code** `/sign-in/code`, `/sign-up/confirm` | Where the code went and how long it works · one code box (paste and the phone's code autofill work) · **Continue** · Send a new code (after 60 seconds) · Use a different email |
| **Forgot your password** `/forgot-password` | Email → code and new password → signed in |
| **How you sign in** `/account/security` | Ways to sign in (a code by email, password, Google, Apple) · Passkeys · Signed-in devices. Linked from a workspace's settings, a renter's account page and the staff tools |
| **Confirm it's you** `/account/confirm` | Shown before changing how you sign in when the last sign-in was over an hour ago. It offers only the ways this account has. For Gaff's staff tools it offers a passkey only |
| **Join a team** `/join/…` | Which team and what you'll be able to do · who the invitation is for · the ways to sign in as that email · **Join Halcyon Lettings** once signed in as that email |
| **Settings, Team** | People with their role · invitations waiting · invite form (email, role) · change role · remove |

Google and Apple buttons appear only where they've been set up (Q64). When signing in with one goes wrong, the person comes back to **Sign in** with one plain line:

- **Cancelled:** "Signing in with Google was cancelled."
- **Can't join yet:** "You already have a Gaff account for this email. Sign in another way, then connect Google from “How you sign in”."
- **A new address they don't host:** "Google can’t confirm that email address is still yours. This first time, use “Email me a code instead”. Then connect Google from “How you sign in”."
- **Too slow, or another browser:** "That took too long, or opened in another browser. Try again."
- **Anything else:** "Something went wrong with Google. Try again, or use your email."

## Emails

All come from Gaff's own address, in Gaff's voice. The words live in `src/copy/account-emails.ts`, with the sign-in code in `src/copy/renter-emails.ts` and the invitation in `src/copy/verification.ts`. A solicitor reviews them with the other fixed templates.

| Email | When | Subject |
| --- | --- | --- |
| Sign-in code | Email me a code instead | 482913 is your Gaff code |
| Confirm your email | After creating a password account | 482913 is your code to finish setting up Gaff |
| Password reset code | Forgot your password | 482913 is your code to reset your Gaff password |
| Account already exists | Someone tries to create an account with this email | You already have a Gaff account |
| Password added | A first password is set | A password was added to your Gaff account |
| Password changed | A password is changed or reset | Your Gaff password was changed |
| Way in added | Google, Apple or a passkey is added | Google was connected to your Gaff account |
| Invitation | An admin invites someone, or sends it again | Ann Power invited you to Halcyon Lettings on Gaff |

Each code email says how long the code works, that nobody from Gaff will ask for it, and what to do if you didn't ask for it. The code is in the subject, so it can be read from a notification.

## Rules and limits

| Rule | Value |
| --- | --- |
| Code | 6 digits; 10 minutes; 5 tries; a new code after 60 seconds; at most 5 code emails to one address an hour |
| Password | 12 to 128 characters; anything allowed, including spaces; no rules about mixing character types; never the email address itself; refused if seen in a data breach |
| Session | 14 days, extended each day it's used; ends when the person signs out, signs it out from another device, or resets their password. A browser holds one session |
| Recent sign-in | Within the last hour, for changing how you sign in |
| Staff tools | A passkey sign-in in the last 8 hours, in production (M5) |
| Invitation | 7 days; works once; only for the invited email; inviting an address again replaces its earlier invitation; at most 30 sent by one workspace an hour |
| From one network address, a minute | 5 password tries, 3 sign-ups, 5 codes sent, 10 codes checked, 10 Google or Apple sign-ins, 10 passkey tries |
| For one email | 3 sign-ups in 10 minutes; 5 codes an hour; after 10 wrong passwords in 15 minutes, password sign-in pauses for 15 minutes (codes still work) |
| Unconfirmed sign-up | Deleted after 7 days |

## Security and privacy

- **No guessing who has an account.** Sign-in, sign-up, reset and code screens look and answer the same whether or not the email has an account.
- **Codes, not links, for signing in.** A code can't be used up by an email scanner, and it works when the email is read on another device. An invitation link never signs anyone in, and works only for the invited email: a forwarded invitation can't make Bob into Liam.
- **Passkeys belong to Gaff's own site.** The address of the page that asked is part of what a passkey signs, so a look-alike site can't use one. Gaff holds only the public half.
- **Hashed at rest:** passwords (scrypt), email codes and invitation tokens. Session cookies are signed. Gaff doesn't store Google or Apple access tokens.
- **Minimal data:** Gaff keeps only the name and email from Google and Apple. A network address and browser are kept only on a live session, so someone can recognise their own devices, and the browser is shown in plain words ("Safari on an iPhone"), never raw.
- **Logged without personal data (rule 8):** sign-in events and team changes hold IDs, method codes, counts and dates only. The limiter stores hashes, never an address or an email.
- **Deleted on schedule (rule 9):** see AU14.
- **Approved vendors (rule 10):** Google and Apple act for the person signing in. They confirm who someone is and pass Gaff a name and email; Gaff sends them nothing about lettings. They're built, and stay off until the founders approve them and set them up (Q64). The breached-password check sends only the first 5 characters of a hash of the password, which identifies nobody; it's off until approved too (Q65).
- **People decide (rule 1) is unchanged.** Every decision is still made by a signed-in member, and each person has their own login, so the record says who.

## Edge cases

- **Hide My Email (Apple).** Allowed. The account's address is the one Apple made, and Gaff's emails reach the person through Apple, which needs Gaff's sending domain registered with Apple ([launch-checklist.md](launch-checklist.md)). Apple stays connected to such an account, because nobody knows that address by heart to ask for a code. An invitation needs the invited email, so someone who hides their email joins with a code first, then connects Apple from **How you sign in**.
- **Shared mailboxes** (lettings@agency.ie). Each person needs their own account, invited by their own email.
- **Someone in two agencies.** One workspace per person for now. The invitation page says so, and phase 2 adds a switcher (AU25).
- **Lost access to their email.** They can still sign in with a passkey, Google, Apple or a password. If they have none, their admin invites their new email.
- **Mistyped email at sign-up.** The code never arrives. The code screen offers "Use a different email".
- **A removed passkey that's still on the device.** The device still offers it, and Gaff says it may have been removed from the account. "How you sign in" reminds people to delete it from their device too.
- **Existing accounts.** Nothing to do. They sign in with an email code, or with Google or Apple where those host the address, and can add a password or a passkey.

## Not built, and why

| What | Why | Question |
| --- | --- | --- |
| "Last used" on the sign-in page (AU15) | It needs a cookie that isn't strictly necessary, which needs consent under the cookie rules. Gaff sets only necessary cookies today | Q72 |
| A prompt to add a passkey after signing in | It needs somewhere to remember "not now". Passkeys are added from "How you sign in" | Q72 |
| Invitations shown on the welcome page | The link in the email is the way in. Looking up invitations by email, across workspaces, is new reach for little gain | Q72 |
| An email when someone is removed from a team, or signs in on a new device | Not asked for in phase 1 (the second is AU22) | Q72 |
| Signing a removed person out everywhere | Their account is their own, and may be a renter's | Q71 |
| Deleting accounts nobody uses | A renter's account is kept while they choose to keep it (Q25) | Q74 |
| A terms and privacy line on "Create an account" | The documents for account holders don't exist yet | Q70 |

## Out of scope

- Single sign-on (SAML), user provisioning (SCIM) and Microsoft sign-in. Sean decided against Microsoft for now on 8 November 2026; revisit with calendar sync (R31).
- SMS codes for signing in: SIM-swap risk and cost.
- Sign-in links: replaced by codes.
- CAPTCHA: only if abuse appears. It would be a new vendor.
- Native apps, usernames, and other social providers.

## Phase 2: before a wider rollout

| ID | Requirement |
| --- | --- |
| AU20 | Two-step verification with an authenticator app, and backup codes. An admin can require it for the team. Passkeys count as two steps. |
| AU21 | Recent security activity on **How you sign in**, and sign-in activity for admins, from the AU16 events. |
| AU22 | An email when someone signs in on a new device. |
| AU23 | Change your email address, confirmed by a code sent to the new address. |
| AU24 | Offboarding: what a person who leaves a team is told, and what happens to their part in the record (Q3). |
| AU25 | One person in several workspaces, with a switcher. |
| AU26 | Sign-in rules per workspace, for example "Google only" or "passkeys required". |

A renter deleting their account is already built (M13). The first draft's AU30 to AU33 (a separate renter sign-in) are withdrawn: renters use the same sign-in as everyone.

## Decisions

**Decided by Sean, 8 November 2026:**

- Build on Better Auth, not Clerk. See ADR-0028 for why.
- Google and Apple, not Microsoft, for now.
- Phase 1 includes team invitations, email codes and passkeys. Two-step verification is phase 2.
- "Operators, then renters."

**Decided by the CTO while building, on Sean's instruction of 13 November 2026 to proceed and note the calls to revisit.** Each is in [open-questions.md](open-questions.md#j-sign-in-and-accounts):

| # | The call | Who comes back to it |
| --- | --- | --- |
| Q62 | Built on the marketplace line, not the repository's default branch | Founders: make that line the default |
| Q63 | One sign-in for everyone, with passwords for all; private links and the enquiry sheet keep codes | Founders |
| Q64 | Google and Apple are built and stay off until approved and set up (rule 10) | Founders, solicitor |
| Q65 | The breached-password check is built and stays off until approved (rule 10) | Founders |
| Q66 | Google and Apple join an existing account only for addresses they host | CTO, if support shows friction |
| Q67 | Sign-in events are written beside the library's own writes, not in one transaction (rule 8) | CTO |
| Q68 | Who owns the Apple Developer account | Founders |
| Q69 | The domain passkeys belong to, which can't change later | Founders |
| Q70 | The privacy notice, terms and cookies for account holders | Solicitor |
| Q71 | One workspace per person; a removed person keeps their own account | Founders |
| Q72 | What wasn't built, and why | Founders |
| Q73 | Staff passkeys: in production only, and added by the staff member themselves | Founders |
| Q74 | Accounts nobody uses aren't deleted automatically | Founders, solicitor |

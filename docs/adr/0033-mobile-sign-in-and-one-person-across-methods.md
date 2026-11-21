# ADR-0033: Sign in with a mobile number, and one person however they sign in

- Status: Accepted (Sean, 20 November 2026, open question Q61). Adds to [ADR-0015](0015-sign-in-google-apple-codes-passkeys.md) and changes one row of [ADR-0019](0019-sign-in-hardened.md)'s rule for joining Google or Apple (AU4).
- Date: 2026-11-20

## Context

Sign-in had Google, Apple, a six-digit code by email and passkeys, joined to one person by a verified email (ADR-0015, ADR-0019). Sean asked for the standard Airbnb sets: sign up or sign in with a phone number or an email, each with a one-time code, or with Google or Apple, and have all of them reach the same account. His example: an account made with Google, later opened by signing in with a mobile number Gaff had never seen and giving the same email, which "found" the account.

Two things were missing.

- **No mobile numbers.** A person could not start with their phone number.
- **One dead end.** A Google or Apple account whose address the provider doesn't host (a work address on Microsoft, say) was refused: back to the sign-in screen with a sentence saying to enter the email for a code, then connect the provider from Profile (Q57). Safe, and four steps the person had to work out for themselves.

Two things were already right and stay: nobody is told whether an address has an account before they have proved it is theirs (UX-SI-8, AU4), and nothing is joined on a provider's say-so alone.

Airbnb shows "We've found your account", with the account's email, photo and part of its phone number, as soon as an email is typed. That tells anyone who types an address whether it has an account, and shows them part of its owner's number. Gaff shows the same screen one step later: after the mailbox has said yes.

## Decision

**The email address is what joins a person's ways in.** Every account has one verified email, as before. A mobile number, Google, Apple and passkeys are ways in to the account that has that email. A new way in is joined only when its owner proves the email with a code, in the browser that asked. One rule, for every method.

### Sign in with a mobile number (UX-SI-13)

- **One field, "Email or mobile number".** An email gets a code by email, a number a code by text. Once what's typed is a number without a country code, a "Country code" picker appears below the field, Ireland first; a number typed with a plus is taken as written. The field comes first, then "or", then Google and Apple.
- **The same code store** (`src/server/auth/codes.ts`) with a `channel`: six digits, 10 minutes, five tries, tied to the asking browser, kept only as a keyed hash, deleted after a day. A text carries no button.
- **Sent by Sinch (EU)**, already approved for texts (rule 10, ADR-0010). The text is plain characters, one text long, and ends with the line a phone reads to offer the code on Gaff's own site only (`@host #code`).
- **The number is kept in `sign_in_mobiles`**, one a person and one person a number, as `+353871234567`. It is the person's own, like their passkeys: no organisation column, nothing an operator can read, deleted with the person, in their download, removable on Profile behind "Confirm it's you". It is separate from the mobile a renter confirms to book a viewing, which belongs to that application (ADR-0020).
- **Where it is offered** (`mobileSignInMode`): wherever texts are really sent; locally and in tests with the development tools on, where the text is in the outbox; nowhere else. On the test copy without Sinch the field asks for an email only: a code shown on screen, as booking does there, would let anyone in as any number's owner.

### A number Gaff hasn't seen: the email comes next (UX-SI-14)

The right code by text signs its owner in. For a number nobody has, nobody is signed in and nobody is made yet. One screen follows, "What's your email?", in the same words whoever asks. A code goes to that address, carrying the number (`one_time_codes.joining`), and the email says so and says not to share it. Entering it:

- signs in whoever has the address, or makes a person for it;
- joins the number to them;
- and, if the account was already there, shows **"We've found your account"**: who they're signed in as, what was joined, where to change it, and Continue. A person made a moment ago goes straight on to set up.

The proof that a browser holds a number is the used text code's own row, for 15 minutes. Nothing else is kept, and nothing about the person is in a cookie or an address.

### A number vouches for 180 days

Phone companies hand an unused number to someone new. So a number gets its owner in by itself only if a code by text has signed them in, or joined it to them, within 180 days (`MOBILE_VOUCHES_DAYS`). After that it is treated as a number nobody has: its holder proves an email too, and the number goes to whoever does, with a security email to the person it left. A returning owner is asked for their email code once and carries on.

### Google or Apple that can't vouch for the address (UX-SI-15)

ADR-0019's rule stands: a provider joins someone by email only for an address it hosts. What changes is what happens otherwise. As the provider comes back, Gaff sends the sign-in code to the address the provider named, tied to this browser (which was given its key before it left), carrying the provider's account. The person lands on the code screen, which says why. Entering the code signs in whoever has the address, or makes them, and connects the provider in the same step; "We've found your account" follows if the account was there. Where no code can go (too many already, or a browser that never opened the sign-in screen), the old sentence is shown.

| Who's signing in | The provider hosts the address | It doesn't |
| --- | --- | --- |
| Already connected by this provider | Signed in | Signed in |
| Signed in, connecting it on Profile | Connected | Connected |
| An address someone already has | Joined to them, and signed in | **A code to the address; then joined and signed in** |
| An address nobody has | A new person | **A code to the address; then a new person, connected** |

An address the provider says it never checked is still refused, and nothing is sent.

### What keeps it safe

- **Nothing is joined before the mailbox says yes.** Typing someone's email after proving your own number sends them a code and tells you nothing. The code works only in the browser that asked.
- **A code that adds a way in says so.** The email names what is added (the number's last four digits, or the provider) and says not to share the code. Afterwards the account's owner gets the security email "A mobile number was added…" or "Google was connected…" (AU11), unless the account was made in that same sign-in.
- **A text is the weaker proof, so it does less.** "Confirm it's you" is still a passkey or an email code, never a text: a number that has been taken over can open the account but can't change where tenants pay, remove a member, or change how the person signs in. Gaff's team still need a passkey for `/internal`. A session records the proof that made it (`sms_code` or `email_code`); the funnel and "You used … last time" record the method the person chose.
- **Texts cost money, and numbers can be made to pay for them.** Gaff texts a fixed list of countries (`diallingCodes`: Ireland, the UK, the EU and EEA, Switzerland, the US, Canada, Australia, New Zealand, India, Brazil, South Africa). A number gets three texts in ten minutes and ten a day; a network address three a minute; and all of Gaff `SIGN_IN_TEXTS_PER_HOUR` (300), past which sign-in by mobile answers "enter your email instead" until the hour is out. Only texts really sent count.
- **Rule 3.** A dialling code says where a SIM was sold. It is never shown to anyone who lets a home, never used to rank, and never read as anything about the person.

## Consequences

- One migration: `sign_in_mobiles`, and `channel` and `joining` on `one_time_codes`.
- A new sign-in method, `sms_code`, in the funnel's splits and on sessions.
- The sign-in screen's order changes (the field first), and its field's label where texts are sent.
- The email about a refused Google or Apple sign-in (`sign_in_refused`) is now sent only where no code could be.
- New fixed wording for the solicitor: the text, the two lines the sign-in email gains, the "mobile number added/removed" security email, and the privacy notice's paragraph on mobile numbers and Sinch.
- A mobile number is added by signing in with it, or on Profile while signed in: "Confirm it's you", then a code texted to the number (`add_mobile`, a code for that person and that number together). Either way the number leaves anyone else who had it, who is told.
- Production needs Sinch's settings (it already refuses the fake sender), a sender registered for Ireland, and a spend cap at Sinch (launch checklist).
- A text sign-in is only as safe as the phone number. That is accepted for getting in, and bounded by the 180 days and by what "Confirm it's you" protects. If operators' accounts should need more than a text, that is one condition in `signInWith` (Q61).

## Alternatives considered

- **Better Auth's `phoneNumber` plugin.** It keeps the number on the user, which every session then carries, and has its own code store. Gaff's code store already had the browser tie, the limits and the retention, so texts use it.
- **Showing "We've found your account" before the email is proved**, as Airbnb does. It tells anyone whether an address has an account and shows part of its owner's number.
- **A mobile-only account, with no email.** Everything Gaff sends about a home goes by email, and "Confirm it's you" needs one.
- **Trusting any address Google or Apple calls verified.** That is the takeover ADR-0019 closed: a provider account made with someone else's old work address.
- **Any country, typed with a plus.** Open to anyone running up texts to numbers that pay them.
- **Guessing the country from the number's shape.** A picker is one tap and never wrong.

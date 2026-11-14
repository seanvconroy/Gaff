# 5. Flows for renters, owners and referees

Part of the [UX redesign PRD](README.md). This file specifies every page reached by a private link: the renter's and tenant's pages, the owner's pages and the referee's form. Nobody here needs an account.

Requirement IDs: `UX-PP` (rules for every private page), `UX-RN` (renters and tenants), `UX-OP` (owner pages), `UX-RF` (referees).

## Rules for every private page

These pages are used once or twice, on a phone, by someone who didn't choose Gaff. They have to work with no explanation.

| Part | Content |
| --- | --- |
| Top line | The agency's name (or the landlord's first name), then "with Gaff, an AI assistant". "Talk to a person" on the right |
| The home | The cover photo, the address as the title, one summary line |
| The task | One thing to do or one thing to know, with one primary button |
| What happens next | One or two sentences with a date |
| Footer | The agency's name and PSRA licence number, the privacy notice, "Run with Gaff" |

**UX-PP-1.** Each private page has one task and one primary button, which spans the screen on a phone. `[P2, P11]`

**UX-PP-2.** Every page ends with what happens next and when, in one place, after the task. It isn't repeated in a notice, a card and an email on the same screen. `[P4]`

**UX-PP-3.** The AI disclosure is in the top line of every page and in the first message, in words. "Talk to a person" is on every page. It opens a sheet with how to reach the agency: reply to any email, and the agency's phone number if the agency has chosen to show one. `[rule 6 · R7]`

**UX-PP-4.** Controls are 48px high. Nothing a person must read or act on is smaller than 16px. All of it meets WCAG 2.2 AA. `[P10, P12]`

**UX-PP-5.** The home's summary line fits its stage. Before it's let: "€1,850 a month · 2-bed apartment · From Sunday 13 December". After it's let, "From…" is the tenancy's start date for the tenant, and is dropped for everyone else. `[P4]`

**UX-PP-6.** The home's photos and facts are on the renter's page: up to five facts with icons, then "Show all 14". A renter who can see the answer doesn't need to ask the question. `[P7, P3 · R8]`

**UX-PP-7.** A renter's link always opens the same page, and that page always shows where they stand now. There is one link per renter per home, from first reply to move-in. `[P5, P10]`

**UX-PP-8.** No private page asks anyone to create an account. `[P8 · R9]`

**UX-PP-9.** The owner's and referee's pages use the same frame, with a footer written for them. The renter's line "Reply to any of our emails" is not shown to a referee or an owner. `[P4]`

**UX-PP-10.** Emails and texts follow the same rules: one purpose, one button, the home named by its address in the subject, and a readable link label, never a bare web address. Wording that is fixed today stays fixed. `[P2, P4 · rule 7]`

## Renters

**Jobs:** RJ1 to RJ5.
**Screens replaced:** 23, 24, 27, 28, 29, 30, 34, 35, 37, 42, 43, 44, 46.

### The renter's path

| Moment | The page shows | Primary action | Data collected |
| --- | --- | --- | --- |
| First reply (email) | Fixed wording: this is an AI assistant, a person decides, what's next | Answer a few questions | None new |
| Before answering | The home, and "This home suits" (see [section 6](06-matching-and-fit.md)) | Answer 3 quick questions | None |
| Questions | One question per screen | Next, then Send my answers | Answers to the criteria that were set |
| Answers sent | "Thanks, Aoife." What happens next, with a date | None. "Change my answers" as a link | None |
| Invited | "You're invited to view" | Choose a time | None |
| Choosing a time | Days, then times | Book this viewing | Booking time. A mobile number if they give one |
| Booked | The time, the address | Add to my calendar. "Change" and "Cancel" as links | None |
| On the waiting list | "You're on the waiting list." What that means in one sentence | None | None |
| A place opens | "A place has opened up: Friday 20 November, 6:15pm. It's yours until 8:40pm today." | Take this place | Booking time |
| Not invited yet | "Halcyon Lettings has had a lot of interest. You'll hear by Friday 14 November either way." | None | None |
| After viewing | "Thanks for coming. Would you like to apply?" | Apply | None |
| Applying | Two questions, one per screen | Send my application | How they mainly earn; household take-home income |
| Applied | "Your application is in." What happens next | None | None |
| Chosen for checks | "Halcyon Lettings would like to check a few things before making an offer." | Start | See checks |
| Offer | The terms, the total to pay, the deadline | Accept the offer. "Decline" as a link | The answer |
| Tenancy | The next step of the tenancy | Sign; then pay; then confirm the inventory | Signature; optional PPS number |
| Home let to someone else | "12 Ranelagh Road has been let." When their details are deleted | None | None |

**UX-RN-1.** Data is collected only at the stage shown in the last column. No page asks for a document before the renter is the chosen applicant or the backup. `[rule 2]`

### Questions

**UX-RN-2.** The pre-viewing questions are asked one per screen, each answered with taps:

| Criterion | Question | Control |
| --- | --- | --- |
| Most people | "How many people would live here, including you?" | Number buttons: 1, 2, 3, 4, 5, 6 or more |
| Pets | "Do you have any pets?" Under it: "Assistance dogs don't count as pets." | Yes / No |
| Move-in date | "Could you move in by Sunday 13 December?" | Yes / No, I'd need later. "Later" asks for a date |
| Length of stay | "How long would you like to stay?" | Under a year / A year / Longer |

Only the questions for criteria the operator set are asked. `[P2, P10 · R9, rule 3]`

**UX-RN-3.** The questions take under 45 seconds for someone answering all four. `[P14]`

**UX-RN-4.** Nothing a renter answers ends their path or shows a refusal. Whatever they answer, the last screen is "Thanks" and what happens next. A person decides who views. `[rule 1]`

### Booking a viewing

**UX-RN-5.** Booking follows the pattern people know from Calendly: pick a day, pick a time, confirm. Days with places are a short row. The chosen day's times are a list of large buttons. `[P6 · R12]`

**UX-RN-6.** If one time is on offer (a place from the waiting list), there is no picker. The page states the time and the primary button takes it. `[P7]`

**UX-RN-7.** The confirm step shows the day, time and address, and one optional field: "Mobile number for a text reminder". It is asked once. If they've given it, it's shown with "Change". It is never filled in from the enquiry (Q12). `[P7 · R13]`

**UX-RN-8.** The booked page is a confirmation, and looks like one: the time and address, "Add to my calendar", "Get directions" (which opens the phone's own maps app), then "Change the time" and "Cancel" as quiet links. The form to move a viewing opens only when asked for. `[P1, P3]`

**UX-RN-9.** After cancelling, the page says "Your viewing is cancelled" and offers "Book another time" as a button. It doesn't show the booking form again unasked. `[P3]`

**UX-RN-10.** A place held from the waiting list shows when the hold ends, in words ("until 8:40pm today"), on the page and in the email. `[P10 · R14]`

### Applying

**UX-RN-11.** The application is two questions, one per screen, then a check screen showing their name and email from the enquiry, each with "Change". `[P2, P7 · R16]`

**UX-RN-12.** The income question's helper text is two lines: "After tax, for everyone who'd pay the rent. Include any housing support, such as HAP." The agency's rule is one more line: "Halcyon Lettings looks for 2.5 times the rent. Everyone is asked the same." Nothing asks whether they receive housing support. `[P4 · rule 3, Q17]`

**UX-RN-13.** Phase 2: the check screen has one tick, off by default: "Keep my details for next time". Ticking it starts the optional profile ([section 2](02-accounts-and-sign-in.md)). `[P8 · Q25]`

### Checks

**UX-RN-14.** The checks page asks for a one-time code, sent to the renter's email, before it opens. `[UX-SI-12 · ADR-0013]`

**UX-RN-15.** The three checks are done one at a time. The page shows the three as a short list (done, next, to come) and only the next one's task and button. `[P2, P3 · R18]`

| Check | Screens | Notes |
| --- | --- | --- |
| Your ID | One screen saying what happens and what Gaff keeps (two lines), then the provider's flow | Gaff keeps the result and the name. Never the photos, never a date of birth |
| Your income | The same, then the provider's flow. "I'd rather send payslips" as a link | Gaff keeps the monthly amount |
| Your references | "Have you rented before?" Yes / No. If yes: the last landlord's name and email. Then "Is there an employer we can ask?" Yes / No. If yes: a name and work email | One referee per screen. The opt-out is the first question, not a tick after the fields |

**UX-RN-16.** Each check says, before it starts, who sees the result and when it's deleted, in two lines. `[P4 · R18]`

**UX-RN-17.** A renter can leave between checks and come back to the next one. `[P10]`

**UX-RN-18.** A renter with no previous landlord or no employer loses nothing by saying so. The page doesn't treat either as missing. `[rule 3]`

**UX-RN-19.** Phase 2: a renter who kept an earlier check result on their profile is asked "Use the ID check you did on 3 October?" with Yes as the primary action. It's shared with this operator only if they say yes, and only now, at the checks stage. A renter is never invited to verify before an operator has chosen them. `[P7 · rule 2]`

### The offer

**UX-RN-20.** The offer page shows: the terms; one total, "To pay before you move in: €3,700", with the deposit and first month's rent under it; a line that nothing is paid through Gaff and there are no other fees; the deadline; then Accept as the primary button and Decline as a link. `[P1 · rule 4, R20]`

**UX-RN-21.** Declining asks for no reason. `[P7]`

### The tenancy

**UX-RN-22.** The agreement page shows the home at the top like every other page, has links to jump to each section, and offers a copy to download. To sign, the tenant ticks one box and types their name. That is the signature and is kept as it is (Q23). `[P12 · R22]`

**UX-RN-23.** The payment page shows the total and the account, with copy buttons for the IBAN and the reference. The line asking the tenant to check the details by phone gives the agency's phone number. `[P7 · R23]`

**UX-RN-24.** The PPS number is its own short step after payment: one optional field, two lines of why, and "Skip". It isn't a card under the payment details and isn't repeated on later pages. `[P2, P3 · R24]`

**UX-RN-25.** The inventory is shown room by room. Each item has "Something's not right", which opens a short note to the agency about that item. The page's primary action is "This is a fair record". `[P10 · R25]`

**UX-RN-26.** The tenancy steps on the tenant's page always match the operator's. A step is never shown as open after a later one is done. `[P12]`

### States

| State | What the renter sees |
| --- | --- |
| The link has expired or been withdrawn | "This link has ended." If the home is let, it says so. One line on how to reach the agency |
| The time they chose was just taken | At the time list: "That time has just gone. Here are the others." |
| A hold ran out | "That place has gone to the next person. You're still on the waiting list." |
| The offer's deadline has passed | "This offer has closed." and how to reach the agency |
| Loading | The page's frame at once; the task fades in |
| A send failed | At the button: "That didn't send. Check your connection and try again." Their answers are kept |

## Owners

**Jobs:** OJ1 to OJ3.
**Screens replaced:** 33-landlord-view, 40-landlord-approval.

### Following a letting

Today's page is six phone screens: eight figures, the criteria, the ranking and every event. It becomes one screen that answers "how is it going?".

| Order | Block | Content |
| --- | --- | --- |
| 1 | Where it stands | One sentence: "Viewings are under way. 8 of 14 places are booked." The four-part progress bar |
| 2 | The figures | Up to three, for the current stage. Never a figure that's zero because its stage hasn't come |
| 3 | What's been decided | Decisions only, newest first, each with who decided and why: "14 people invited to view. Chosen by Ann Power on Tuesday 4 November, in ranked order." |
| 4 | Who it suits | The criteria on one line, and one sentence on fairness |
| 5 | More | "See everything that's happened" opens the full record |

**UX-OP-1.** The owner's page fits on about one phone screen before "See everything". `[P1, P3 · R27]`

**UX-OP-2.** Renters appear as "Applicant 1", "Applicant 2". No names, contact details or message text, until the chosen applicant and backup are put forward for approval (Q4). `[rule 2]`

**UX-OP-3.** The record shown to an owner leaves out Gaff's internal steps ("Fixed wording", "Answers drafted"). It keeps enquiries, invitations, viewings, applications and decisions. `[P4]`

**UX-OP-4.** The page says how to reach the agent. `[P10]`

**UX-OP-5.** When the home is let, the page becomes a one-screen summary: let in how many days, the rent, the tenancy's start date, and when it was registered with the RTB. `[P9 · OJ3]`

### Approving the tenant

| # | Screen | Shows | Actions |
| --- | --- | --- | --- |
| 1 | **Approve a tenant for 12 Ranelagh Road** | The preferred applicant's card: name, "Meets 4 of 4", income as a multiple of the rent (never the amount), each check in words | **Approve Aoife** / Decline |
| 2 | **And a backup?** | The backup's card, the same way. One sentence on what a backup is for | **Approve Ciarán** / Decline |
| 3 | **Thanks, Mary** | "Halcyon Lettings will make the offer to Aoife and tell you when she answers." | None |

**UX-OP-6.** Each decision sits on the card of the person it's about. `[P2 · R19]`

**UX-OP-7.** A check that isn't finished says "Still under way". The agent is warned before asking for approval while checks are unfinished, and the owner's page says so in one line at the top. `[P10]`

**UX-OP-8.** Declining takes no reason in writing. The page says "Halcyon Lettings will be in touch", and the agent is told at once. An owner's reasons belong in a conversation with their agent, who is responsible for the decision being lawful. `[rule 3]`

**UX-OP-9.** The approval is recorded as the owner's, as today. `[R19]`

## Referees

**Jobs:** FJ1, FJ2.
**Screen replaced:** 38-referee-form.

| # | Screen | Shows | Primary action |
| --- | --- | --- | --- |
| 1 | **A reference for Aoife Byrne** | Two lines: who's asking and why; that it takes two minutes; who sees the answers and when they're deleted. Then the questions | Send my reference |
| 2 | **Thanks** | "That's everything. Your answers have gone to Halcyon Lettings only." | None |

**UX-RF-1.** The form is one screen of up to four questions, each answered with one tap. Every question's choices are laid out the same way: stacked, full width. `[P2, P12 · R18]`

**UX-RF-2.** The first question is "Did Aoife rent a home from you?" Answering No hides the rest and the button reads "Send". `[P3, P7]`

**UX-RF-3.** There is no free-text field. Fixed choices keep references comparable and keep protected grounds out of them. `[rule 3]`

**UX-RF-4.** A link under the form reads "I can't give this reference". One tap, and the agency is told. The referee isn't reminded again. `[P10]`

**UX-RF-5.** The referee's page never offers an account and never asks for anything about the referee. `[P8]`

**UX-RF-6.** The form takes under two minutes, and the email that leads to it says so in its first line. `[P14 · FJ1]`

## What's deferred

| Item | Until |
| --- | --- |
| "Ask about this home" on the renter's page, answered from the facts | Phase 2 |
| "Keep my details for next time", and the renter's signed-in home | Phase 2 |
| The owner's "Keep your homes in one place" | Phase 2 |
| Reusing a kept check result | Phase 2 |
| WhatsApp as a channel (R30) | Phase 2 |

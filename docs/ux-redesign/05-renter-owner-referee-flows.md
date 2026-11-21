# 5. Flows for renters, owners and referees

Part of the [UX redesign PRD](README.md). This file specifies the renter's side of Gaff from start to finish: finding a home, asking to view, and every step inside a letting through to moving in. It also covers the owner's pages and the referee's form.

A renter can do all of it without an account. A profile makes it faster the second time.

Requirement IDs: `UX-SR` (search), `UX-LS` (a home's page), `UX-AV` (asking to view), `UX-RH` (the renter's home), `UX-PF` (profile and verified identity), `UX-TS` (trust and safety), `UX-PP` (rules for every page inside a letting), `UX-RN` (renters and tenants inside a letting), `UX-OP` (owner pages), `UX-RF` (referees).

## Two ways in, one path after

| The renter starts | What happens | Then |
| --- | --- | --- |
| On Daft or MyHome, as today | Their enquiry is forwarded to Gaff. The first reply arrives by email within five minutes, with a link | The same page, the same steps |
| On Gaff | They find the home, press "Ask to view" and answer the questions there | The same page, the same steps |

Everything from "questions answered" onwards is identical, whichever way they came in.

# Finding a home on Gaff

**Jobs:** RJ1 ("tell me straight away if this home could suit me") and RJ4 ("don't make me type the same things again").
**Screens replaced:** none. This is new.

## The public site

Anyone can open gaff.ie and search. Nothing needs a sign-in until the renter wants something kept.

| Part | Content |
| --- | --- |
| Header | The wordmark. "List a home". "Sign in", or the person's avatar |
| Search | One box, which says what it takes: "Area, road or describe it" |
| Below it | Homes on Gaff now, newest first, as photo cards, beside the map at 900px and up |

**UX-SR-1.** The site opens on the search box and the homes. There is no hero image, no feature tour and no marketing sections. Every line on the screen is the search or its results: no promise line, no line for people letting (the header has "List a home"), and no links under the results (Q60, 20 November 2026). "How results are ordered" is an icon beside the results' heading, the place data's credit is at the foot of the suggestions, and both pages are linked from Help. `[P1, P4]`

**UX-SR-2.** With few homes on Gaff, showing all of them under the search box is the default. An empty search is never the first thing a visitor sees. `[P9, P14]`

## Search

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Search** | One box. The renter types what they want in their own words: "2-bed in Ranelagh under €2,400, from January, no pets". A "Filters" button beside it | Search |
| 2 | **Results** | What Gaff understood, as chips under the box: "Ranelagh · 2 bedrooms · up to €2,400 · from January · no pets". Each chip opens its control. Then the homes | Tap a home |

**UX-SR-3.** The search box takes plain words and turns them into filter chips. Every chip can be tapped to change it, and "Filters" opens all of them as ordinary controls. A renter never has to type a sentence, and never has to use a form. `[P13, P6, P10]`

**UX-SR-4.** A search can use these and nothing else:

| Filter | Control | Matched against |
| --- | --- | --- |
| Where | Place search: counties, towns, Dublin districts, neighbourhoods | The home's address |
| Most rent a month | A number | The rent |
| Bedrooms | 1, 2, 3, 4 or more | Bedrooms |
| Move-in date | A date | Available from |
| How long | Under a year / A year / Longer | Length of stay |
| People | A number | Most people |
| Pets | Yes / No | Pets |
| The home | Furnished, parking, outdoor space, type | The home's facts |

Anything else a renter writes is ignored and not kept ([UX-MT-12](06-matching-and-fit.md#the-renters-side)). `[rule 3]`

"Where" is one of three things, and only one at a time: a place from the index; the part of the map the renter is looking at (UX-SR-8); or areas they drew on it (UX-SR-13). Each is matched against where the home is, and nothing else.

**UX-SR-13.** A renter can draw the area to search on the map (Q60). "Draw", then a loop traced with a finger or the mouse, or a tap for each corner; with a keyboard, Enter gives a square. The area is the search at once, with no Apply. It shows its corners: dragging one reshapes it, the small dot half way along a side pulls out a new corner, and Delete or a double-click takes one away; the arrow keys move the corner in focus. Up to five areas, each removed on its own or all cleared. While there are drawn areas, moving the map looks around and doesn't change the search. A drawn area is in the search's address, so it is shared and saved like any search, and named by the area it is nearest: "Drawn area near Rathgar". `[P6, P10, P13]`

**UX-SR-14.** The search box takes a place, a road, an Eircode area or a sentence, and helps with each as it's typed. The part that could be a place is suggested from Gaff's own place index (places, streets and landmarks, each with where it is); whatever else the words ask for is shown as it is understood ("Search for: 2 bedrooms"). Picking a suggestion searches there with the rest of what was typed; Enter sends the words. A road typed alone, or inside a sentence ("2 bed near Highfield Road under €2,000"), is found. Only the part that could be a place is sent for suggestions, never the sentence, and it is never kept. `[P13, rule 3]`

**UX-SR-15.** When no home is where the renter searched, the empty state is followed by "The nearest homes": up to six homes that fit the rest of what they asked, nearest first, each saying how far it is, within 30 km. `[P9, P14]`

**UX-SR-5.** "Where" is matched against Gaff's own list of Irish places, built from open data. No search is sent to a map or address provider. `[rule 10]`

**UX-SR-6.** A result is a photo-led card: the cover photo, the rent, one line ("2-bed apartment · Ranelagh, Dublin 6"), the date it's free, and a heart to save it. Nothing else. A home's photos can be looked through on its card without opening it (Q62): a swipe, or Previous and Next, with dots for where it has come to; a press on a photo opens the home. The card carries the home's first eight photos and never a floor plan; the rest are on its page. Only the cover loads with the page. `[P4, P12]`

**UX-SR-7.** Homes that fit everything the renter asked come first, newest first. Homes that miss on one point follow under "Close to what you asked", each saying what differs in words: "Up to 2 people. You asked for 3." Gaff never orders homes by anything about the renter except what they asked for, and nobody can pay for position. `[rule 3; P10]`

**UX-SR-8.** On a desktop a map sits beside the list. On a phone a "Map" button swaps the list for it. The list is complete without the map. The whole map is always on the screen (Q62): on a desktop it starts under the navigation, beside the search bar, at exactly the height the screen has left, and stays there as the list scrolls; on a phone it fills the screen under the search, with "List" over its foot and nothing to scroll. A pin's card has the home's photos to look through; on a desktop it sits beside its pin, whole inside the map. The map uses Gaff's own copy of OpenStreetMap ([OQ-7](12-phasing-and-decisions.md#still-open)). When the renter moves the map, the search follows it: the list shows the homes in view, with no button to press, and Back returns to the place they searched (Q60). `[P6, P11]`

**UX-SR-9.** When nothing matches: "No homes match yet. Gaff is new, and homes are added every week." The one primary action is "Tell me when one comes up", which saves the search. Below it, the closest homes. `[P9]`

**UX-SR-10.** A saved search emails the renter when a new home fits: one email a day at most, each home once, with "Stop these" in every email. Saving a search asks for an email if they're not signed in, and nothing more. "Save search" is a chip beside Filters on every search, so a place, a map area or a drawn area is saved with its filters in one press; once saved, the chip says so and opens Saved (Q60). `[P8 · Q25]`

**UX-SR-11.** Searching needs no account and isn't recorded against a person. A search is kept only when the renter saves it. `[rule 2, rule 9]`

**UX-SR-12.** A search's address in the browser can be shared and reopened. It holds the filters and nothing personal. `[P6; rule 8]`

### States

| State | What the renter sees |
| --- | --- |
| Gaff didn't understand the words | The words are used as a place search, and "Filters" is offered: "Try a place, like Ranelagh, or use Filters." |
| Loading | Cards as skeletons, in place |
| A home was let while they looked | Its card goes. Its page says "This home has been let" |

## A home's page

One page per live home, public, built from what the operator entered. The order below is the phone's. On a desktop the same blocks sit in a wide column with the action card fixed on the right.

| Order | Block | Content |
| --- | --- | --- |
| 1 | Photos | A gallery to swipe. Tap for full screen |
| 2 | Title | The address. One summary line: "€1,850 a month · 2-bed apartment · Furnished" |
| 3 | Action | Fixed at the foot of the screen: the rent, **Ask to view**, and a quiet "Call". Under them: "Free. You'll hear back either way." |
| 4 | Highlights | Up to five facts with icons. "Show all 14" |
| 5 | Letting details | Available from; length of stay; most people; pets. Written by Gaff from what the operator set |
| 6 | About this home | The operator's description. Three lines, then "Show more" |
| 7 | BER | The rating, or "BER exempt" |
| 8 | Where it is | The map |
| 9 | Let by | An agency: its name and PSRA licence number. A private landlord: their first name and "Identity verified" |
| 10 | Foot | "Report this listing" |

Save (a heart) and Share sit at the top right.

**UX-LS-1.** Every live letting has a page on Gaff unless its operator has switched that off. `[P7 · Q27]`

**UX-LS-2.** The page is built from the letting. The operator types nothing twice. `[P7]`

**UX-LS-3.** The page has one primary action, "Ask to view". "Call" is a quiet button that shows the lister's number, and on a phone dials it. It's absent if a private landlord gave no number. `[P2 · Q43]`

**UX-LS-4.** The one reassurance line under the action is the only such line on the page. `[P4 · Q46]`

**UX-LS-5.** Letting details are written by Gaff from the four fixed criteria. Where the renter's needs are known, each line shows how it compares, in words: "Up to 3 people. You said 2." `[rule 3 · Q36]`

**UX-LS-6.** The description is the operator's own words, from their advert or typed. Before the page is public, Gaff checks it for wording about who should apply and leaves such lines out, telling the operator why ([UX-LT-6](04-operator-flows.md#adding-a-letting)). `[rule 3]`

**UX-LS-7.** A private landlord is shown by first name only, with "Identity verified". Their surname, email and home address never appear. `[P10; rule 2]`

**UX-LS-8.** The page shows the BER. The law asks for it on any advert for a home to rent. `[OQ-8]`

**UX-LS-9.** The page shows no counters of interest ("12 people looking"), no countdowns and nothing designed to hurry a renter. `[P10]`

**UX-LS-10.** When the home is let, the page says "This home has been let" and offers "See other homes in Ranelagh". It leaves search at once and is removed 30 days later. `[P9]`

**UX-LS-11.** A home's page loads fast, can be shared with a proper preview (photo, address, rent), and can be found by search engines. It holds nothing about any person. `[P9, P14]`

## Asking to view

**Job:** RJ1, RJ2. The renter's equivalent of "one click".

| # | Screen | Asks or shows | Primary action | Skipped when |
| --- | --- | --- | --- | --- |
| 1 | **Who should we reply to?** | Name and email. Or "Continue with Google" or "Apple", which fill both | Next | They're signed in |
| 2 | **A few quick questions** | The home's questions, one per screen ([UX-RN-2](#questions)) | Next | Every answer is already known |
| 3 | **Is this right?** | Their answers on one screen, each with "Change": "2 people · No pets · From 1 January · A year" | Next | There was nothing pre-filled |
| 4 | **Anything to ask about the home?** | One box. "Skip" beside the button | Send |  |
| 5 | **Sent** | "Halcyon Lettings' AI assistant will reply, and a person there decides who views. You'll hear by Friday 14 November either way." If they typed an email: "Check your email to confirm it's you." | Done |  |

**UX-AV-1.** Asking to view never needs an account. A name and an email are enough. `[P8 · R9]`

**UX-AV-2.** A renter with a profile and saved answers asks to view in two taps: "Ask to view", then "Send" on a sheet showing what will be sent. `[P7, P14]`

**UX-AV-3.** What the renter told search is carried in: "You searched for 2 people. Is that right?" Nothing is sent to the operator until the renter confirms it. `[P7]`

**UX-AV-4.** Asking to view collects a name, an email and the answers to that home's questions. It asks for no phone number, no employment, no income and no documents. `[rule 2]`

**UX-AV-5.** There is no "about me" box. The one free-text field is a question about the home, and it goes to the assistant like any other question. `[rule 3 · Q36]`

**UX-AV-6.** An enquiry from a typed email waits until that person opens the link in their first email, which proves the address is theirs. Its place in the order is the moment they pressed Send. Unconfirmed after 24 hours, it's dropped. A signed-in renter's enquiry goes straight in. `[P6]`

**UX-AV-7.** The first reply is the same fixed message a Daft enquiry gets, with the same link to the same page. `[rule 6, rule 7 · R7]`

**UX-AV-8.** An enquiry made on Gaff appears in the letting within seconds and needs no forwarding. The person's row shows where they came from: Gaff, Daft or MyHome. `[P7 · R5]`

**UX-AV-9.** One person, one enquiry per home. Someone who enquired on Daft and then on Gaff is one person in the letting, as today. Pressing "Ask to view" again opens their page. `[R6]`

## The renter's home

A signed-in renter has three destinations ([section 3](03-navigation-and-home.md)).

| Destination | Its one purpose | What's in it |
| --- | --- | --- |
| **Search** | "What's out there?" | The search above, starting from what they're looking for |
| **Saved** | "What did I like?" | Saved homes, and saved searches with their alerts |
| **Enquiries** | "Where do I stand, and what do I need to do?" | Each home they've asked about, with its one next step |

**UX-RH-1.** Enquiries lists every home the renter has asked about. Each row shows the photo, the address, and one line saying where they stand and what's next: "Book a viewing", "On the waiting list", "An offer: answer by Sunday 6pm". Rows that need them come first. `[P5, P1]`

**UX-RH-2.** A renter opens on Enquiries when something needs them, and on Search when nothing does. `[P5]`

**UX-RH-3.** Tapping a row opens that home's page for them: the same page a private link opens ([Inside a letting](#inside-a-letting)). `[P12]`

**UX-RH-4.** A renter who opens a private link while signed in, or signs in from it, has that enquiry added to Enquiries. An enquiry that began on Daft sits beside one that began on Gaff. `[P7]`

**UX-RH-5.** A let or closed home stays in Enquiries, marked, until its details are deleted on the date the page gives. `[rule 9]`

**UX-RH-6.** The avatar opens the account menu: Profile, "Switch to letting" (or "List a home" if they've never let one), Help, Sign out. `[P6 · Q28]`

## Profile

A profile exists so nobody types the same thing twice. It holds only what the person chose to keep.

| Row | Holds | Used when |
| --- | --- | --- |
| Your details | Name, email, mobile if given | Every enquiry and application |
| What you're looking for | The chips from their search | Search opens on them |
| Your answers | People, pets, move-in date, length of stay | Offered on the next "Ask to view" |
| Work and income | How they mainly earn; household take-home income; the date they said so | Offered on the next application |
| Identity | "Verified on 3 October 2026", once it's been done | Offered at the next checks |
| Sign-in | Their methods and passkeys | |
| Your data | "Download my details"; "Delete my profile" | |

**UX-PF-1.** A profile is created when a person signs in. A renter is offered one at the moments it saves them something: saving a home or a search, and "Keep my details for next time" when they apply. `[P8 · Q25]`

**UX-PF-2.** For a person with a profile, what they enter in an enquiry or an application is kept on it, and they can switch that off in Profile. A person without one is offered a single tick, off by default. `[P7 · Q25]`

**UX-PF-3.** Kept details are always offered back for the person to confirm ("Is this still right?"). Nothing is sent to an operator unseen. `[P7; rule 2]`

**UX-PF-4.** A renter's profile has no photo, no description and no free text. No operator can open, browse or search profiles. An operator sees a renter only through an enquiry to their home, and sees only what that stage collects. `[rule 3 · Q36]`

**UX-PF-5.** Income is offered back with its date, for the person to confirm or change. References are asked for afresh each time. `[Q35]`

**UX-PF-6.** "Delete my profile" asks the person to confirm it's them and deletes it at once. One line says what stays: "Homes you've applied for keep your application until that letting ends." `[rule 9]`

**UX-PF-7.** A profile unused for two years is deleted, with an email 30 days before. `[rule 9 · Q25]`

## A verified identity

Verified once, kept on the profile, used in every role (Q35).

| When it's first needed | What happens |
| --- | --- |
| A renter is the chosen applicant or the backup | They do the ID check as one of their checks |
| A private landlord puts their first home live | They do the ID check at the go-live step |

**UX-PF-8.** A person does the identity check once. After it passes, one screen asks: "Keep this, so you never have to do it again?" with "Keep it" as the primary action. `[P7 · Q35]`

**UX-PF-9.** A kept identity has no expiry. It lasts as long as the profile. A person can redo it from Profile ("My name has changed"). `[Q35]`

**UX-PF-10.** Gaff keeps three things: that the check passed, the verified name, and the date. It keeps no image, no document number, no document type, no issuing country and no date of birth. `[rule 3 · Q19, Q35]`

**UX-PF-11.** It works across roles. A person verified as a landlord isn't checked again when they're later a chosen applicant, and the reverse. `[P7 · Q28]`

**UX-PF-12.** An operator sees a renter's verified identity only at the checks stage, for a renter they've chosen, and only when the renter says yes that time: "Use the ID check you did on 3 October?" No operator can see, sort or filter by who is verified before choosing. `[rule 1, rule 2 · Q35]`

**UX-PF-13.** A renter is never invited to verify before an operator has chosen them. There is no "get verified" prompt, badge or reward on the renter's side. `[rule 2 · OQ-5]`

**UX-PF-14.** If the verified name doesn't match the name on an application, the renter is asked to check their name or redo the check. `[P10]`

## Trust and safety

A marketplace has to be safe to enquire on and safe to pay a deposit through.

**UX-TS-1.** A home can be public only if its lister is confirmed: an agency through its licence ([UX-AG-1 to 7](02-accounts-and-sign-in.md#confirming-an-agency)), a private landlord through a verified identity (Q47). `[rule 5]`

**UX-TS-2.** A private landlord's identity check is one step in their first go-live: "One check before your home goes live: confirm it's you. About two minutes, once." It is never asked again. `[P8 · Q47]`

**UX-TS-3.** "Report this listing" is on every home's page. It asks one question with tap answers: It looks like a scam / The details are wrong / It's unfair about who can apply / Something else (with a short note). No account is needed. `[OQ-8]`

**UX-TS-4.** A report goes to Gaff's own team, who answer within one working day. They can hide a listing, which also pauses its enquiries. The lister is told, with the reason. `[OQ-8]`

**UX-TS-5.** Gaff's team has one internal page with three lists: agencies waiting to be confirmed, reported listings, and the funnels ([section 9](09-activation-growth-measures.md#how-its-measured)). That is all they can do. They never run a letting, approve a message or make a decision for an operator (Q13). `[rule 1, rule 5]`

**UX-TS-6.** The account a tenant pays into can't be changed without the operator confirming it's them again, and the tenant is always shown a number to ring to check it ([UX-RN-23](#the-tenancy)). `[rule 5]`

# Inside a letting

## Rules for every page

These pages are used once or twice, on a phone. They have to work with no explanation.

| Part | Content |
| --- | --- |
| Header | The wordmark. "Talk to a person" on the right |
| The home | The cover photo, the address, one summary line, "Let by Halcyon Lettings". Tapping it opens the home's full page |
| The task | One thing to do or one thing to know, with one primary button |
| What happens next | One or two sentences with a date |
| Footer | The lister's name and PSRA licence number; the privacy notice |

**UX-PP-1.** Each page has one task and one primary button, which spans the screen on a phone. `[P2, P11]`

**UX-PP-2.** Every page ends with what happens next and when, in one place, after the task. `[P4]`

**UX-PP-3.** The first message to a renter says they're dealing with an AI assistant, and so does the "Sent" screen of an enquiry made on Gaff. Anything the assistant writes afterwards is marked as from the assistant. "Talk to a person" is on every page, and opens a sheet with the lister's phone number and "Reply to any email". `[rule 6 · R7, Q43]`

**UX-PP-4.** Controls are 48px high. Nothing a person must read or act on is smaller than 16px. All of it meets WCAG 2.2 AA. `[P10, P12]`

**UX-PP-5.** The home's summary line fits its stage. Before it's let: "€1,850 a month · 2-bed apartment · From Sunday 13 December". After, "From…" is the tenancy's start date for the tenant, and is dropped for everyone else. `[P4]`

**UX-PP-6.** A line of caution or legal comfort appears only where the law needs it at that moment or it stops a real mistake. There are four on the renter's whole path: what a check keeps, before it starts; "No other fees" on the offer; "Ring to check these details" on the payment page; and when their details will be deleted, on a closed home. Everything else is behind "How this works" or in the privacy notice. `[P4 · Q46]`

**UX-PP-7.** One link per renter per home, from the first reply to move-in. It always opens the same page, and that page always shows where they stand now. `[P5, P10]`

**UX-PP-8.** No page requires an account. `[P8 · R9]`

**UX-PP-9.** Owners' and referees' pages use the same frame with the agency's name in the header and "Run with Gaff" in the footer. Nothing on them invites the owner or the referee to use Gaff ([Q45](../open-questions.md)). `[P4]`

**UX-PP-10.** Emails and texts follow the same rules: one purpose, one button, the home named by its address in the subject, and a readable link label. Wording that is fixed today stays fixed. `[P2, P4 · rule 7]`

## Renters

**Jobs:** RJ1 to RJ5.
**Screens replaced:** 23, 24, 27, 28, 29, 30, 34, 35, 37, 42, 43, 44, 46.

### The renter's path

| Moment | The page shows | Primary action | Data collected |
| --- | --- | --- | --- |
| First reply (email) | Fixed wording: this is an AI assistant, a person decides, what's next | Answer a few questions (from Daft) or nothing (from Gaff: already answered) | None new |
| Questions | One question per screen | Next, then Send my answers | Answers to the criteria that were set |
| Answers sent | "Thanks, Aoife." Their answers beside the letting details. What happens next, with a date | None. "Change my answers" as a link | None |
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
| Home let to someone else | "12 Ranelagh Road has been let." When their details are deleted. "See other homes in Ranelagh" | None | None |

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

**UX-RN-11.** The application is two questions, one per screen, then a check screen showing their name and email, each with "Change". A renter with a profile sees their last answers and confirms them. `[P2, P7 · R16]`

**UX-RN-12.** The income question's helper text is two lines: "After tax, for everyone who'd pay the rent. Include any housing support, such as HAP." The agency's rule is one more line: "Halcyon Lettings looks for 2.5 times the rent. Everyone is asked the same." Nothing asks whether they receive housing support. `[P4 · rule 3, Q17]`

**UX-RN-13.** A renter without a profile sees one tick on the check screen, off by default: "Keep my details for next time". Ticking it creates their profile with the email they've already confirmed. `[P8 · Q25]`

### Checks

**UX-RN-14.** The checks page opens for a signed-in renter. Anyone else is asked for a one-time code, sent to their email, first. `[UX-SI-12 · ADR-0013]`

**UX-RN-15.** The three checks are done one at a time. The page shows the three as a short list (done, next, to come) and only the next one's task and button. `[P2, P3 · R18]`

| Check | Screens | Notes |
| --- | --- | --- |
| Your ID | If they have a verified identity: "Use the ID check you did on 3 October?" and it's done. If not: one line on what happens and what's kept, then the provider's flow, then "Keep this, so you never have to do it again?" | See [A verified identity](#a-verified-identity) |
| Your income | One line on what's kept, then the provider's flow. "I'd rather send payslips" as a link | Gaff keeps the monthly amount |
| Your references | "Have you rented before?" Yes / No. If yes: the last landlord's name and email. Then "Is there an employer we can ask?" Yes / No. If yes: a name and work email | One referee per screen. The opt-out is the first question, not a tick after the fields |

**UX-RN-16.** Each check says, before it starts, who sees the result and when it's deleted, in one line with "More" for the rest. `[P4 · R18, Q46]`

**UX-RN-17.** A renter can leave between checks and come back to the next one. `[P10]`

**UX-RN-18.** A renter with no previous landlord or no employer loses nothing by saying so. The page doesn't treat either as missing. `[rule 3]`

### The offer

**UX-RN-19.** The offer page shows: the terms; one total, "To pay before you move in: €3,700", with the deposit and first month's rent under it; one line, "No other fees. You pay Halcyon Lettings directly."; the deadline; then Accept as the primary button and Decline as a link. `[P1 · rule 4, R20]`

**UX-RN-20.** Declining asks for no reason. `[P7]`

### The tenancy

**UX-RN-21.** The agreement page shows the home at the top like every other page, has links to jump to each section, and offers a copy to download. To sign, the tenant ticks one box and types their name. That is the signature and is kept as it is (Q23). `[P12 · R22]`

**UX-RN-22.** The payment page shows the total and the account, with copy buttons for the IBAN and the reference. `[P7 · R23]`

**UX-RN-23.** The payment page asks the tenant to ring and check the details before paying, and gives the number to ring. A lister with no number on file is asked for one before they can request payment. `[rule 5 · R23, Q43]`

**UX-RN-24.** The PPS number is its own short step after payment: one optional field, one line of why, and "Skip". It isn't a card under the payment details and isn't repeated on later pages. `[P2, P3 · R24]`

**UX-RN-25.** The inventory is shown room by room. Each item has "Something's not right", which opens a short note to the lister about that item. The page's primary action is "This is a fair record". `[P10 · R25]`

**UX-RN-26.** The tenancy steps on the tenant's page always match the operator's. A step is never shown as open after a later one is done. `[P12]`

### States

| State | What the renter sees |
| --- | --- |
| The link has expired or been withdrawn | "This link has ended." If the home is let, it says so. One line on how to reach the lister |
| The time they chose was just taken | At the time list: "That time has just gone. Here are the others." |
| A hold ran out | "That place has gone to the next person. You're still on the waiting list." |
| The offer's deadline has passed | "This offer has closed." and how to reach the lister |
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
| 4 | Letting details | The criteria on one line |
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

**UX-OP-7.** A check that isn't finished says "Still under way". The agent is warned before asking for approval while checks are unfinished. `[P10]`

**UX-OP-8.** Declining takes no reason in writing. The page says "Halcyon Lettings will be in touch", and the agent is told at once (Q42). `[rule 3]`

**UX-OP-9.** The approval is recorded as the owner's, as today. `[R19]`

## Referees

**Jobs:** FJ1, FJ2.
**Screen replaced:** 38-referee-form.

| # | Screen | Shows | Primary action |
| --- | --- | --- | --- |
| 1 | **A reference for Aoife Byrne** | Two lines: who's asking and why; who sees the answers and when they're deleted. Then the questions | Send my reference |
| 2 | **Thanks** | "That's everything. Your answers have gone to Halcyon Lettings only." | None |

**UX-RF-1.** The form is one screen of up to four questions, each answered with one tap. Every question's choices are laid out the same way: stacked, full width. `[P2, P12 · R18]`

**UX-RF-2.** The first question is "Did Aoife rent a home from you?" Answering No hides the rest and the button reads "Send". `[P3, P7]`

**UX-RF-3.** There is no free-text field. Fixed choices keep references comparable and keep protected grounds out of them. `[rule 3]`

**UX-RF-4.** A link under the form reads "I can't give this reference". One tap, and the agency is told. The referee isn't reminded again. `[P10]`

**UX-RF-5.** The referee's page never offers an account and never asks for anything about the referee. `[P8 · Q45]`

**UX-RF-6.** The form takes under two minutes, and the email that leads to it says so in its first line. `[P14 · FJ1]`

## What's later

| Item | Why it waits |
| --- | --- |
| WhatsApp as a channel (R30) | Already a "Should" in the PRD |
| An owner's own profile, with their homes in one place | The link is enough for one home and one decision |
| A renter verifying before they're chosen | [OQ-5](12-phasing-and-decisions.md#still-open) |
| Notifications from an installed app | After the MVP |

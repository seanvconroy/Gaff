# 4. Flows for people running lettings

Part of the [UX redesign PRD](README.md). This file specifies every flow an agent, an admin or a private landlord uses to run a letting: adding a home, the letting's page at each stage, the calendar, the three decisions, checks, the offer, the tenancy steps and close.

Requirement IDs: `UX-FL` (rules for every flow), `UX-LT` (adding a letting), `UX-LP` (a letting's page), `UX-VW` (viewings), `UX-DC` (decisions, checks and the offer), `UX-TN` (tenancy and close), `UX-ST` (settings). Home, navigation and Inbox are in [section 3](03-navigation-and-home.md).

## The shape every flow shares

These rules apply to every flow below and are not repeated in each.

**UX-FL-1.** A focused task opens full screen, without the navigation. Its header has a close or back control on the left, a segmented progress bar when there's more than one step, and "Save and exit" on the right. Its footer is fixed: Back on the left, one primary button on the right. On a phone the primary button spans the width. `[P2, P10, P11]`

**UX-FL-2.** Everything typed is saved as the user goes. Leaving and returning lands on the same step. `[P10]`

**UX-FL-3.** Errors appear at the field, under it, when the user leaves the field or presses the primary button. There is no error box at the top of a form. On pressing the button with errors, focus moves to the first field that needs attention and a screen reader hears how many there are. An error says what to do, in a sentence. `[P6, P12]`

**UX-FL-4.** Every decision ends on a confirmation screen that says what was done, what Gaff does next, and when. `[P2]`

## Adding a letting

**Job:** AJ2, "Get a new home live in minutes from the advert I've already written", and LJ2 for a private landlord.
**Screens replaced:** 05-new-letting, 05b-new-letting-adverts, 06-new-letting-errors, 10-criteria, 12-rent-check, and the set-up checklist on 08, 11, 13 and 15.

### What changes

| Today | Redesign |
| --- | --- |
| Three form steps with about 20 fields, then four more set-up pages reached from a checklist | One box to paste or describe the home. Gaff fills in the rest for review. Then only the steps still missing an answer |
| Address typed across four fields, Eircode optional | One search field for an Eircode or address |
| "Link to the photos" | Upload photos. Gaff hosts its own copy |
| Viewing times, criteria and comparables all stand between the user and going live | Only what Gaff needs to start answering enquiries. The rest is asked at the stage that uses it |
| An error box above the form, and errors at the fields | Errors at the field only |

### Steps

| # | Screen | Asks or shows | Primary action | Skipped when |
| --- | --- | --- | --- | --- |
| 1 | **Tell Gaff about the home** | One large box: "Paste your advert, or describe the home in your own words." A button to attach a brochure, screenshots or photos. A quiet link: "Fill it in myself" | Continue | Never |
| 2 | **Here's what Gaff found** | A preview laid out like the page renters will see: photos, the address, one summary line, the facts. Anything Gaff is unsure of or couldn't find is marked "Check this" and counted at the top ("3 things to check"). Tap anything to change it | Looks right | "Fill it in myself" was chosen |
| 3 | **Where is it?** | One field: "Eircode or address". Results appear as the user types. Picking one fills the full address | Next | The address in step 2 was confirmed |
| 4 | **Rent and date** | "Rent a month" and "Available from" | Next | Both confirmed in step 2 |
| 5 | **The home** | Type of home and bedrooms as taps. Bathrooms, furnishing, BER and parking offered, not required | Next | Confirmed in step 2 |
| 6 | **Photos** | A drop area and "Choose photos". Uploaded photos as a grid to reorder. The first is the cover | Next (or "Skip for now") | Photos were attached in step 1 |
| 7 | **Letting details** | Four rows, each off until tapped: available from, length of stay, most people, pets. One house rule to switch on: no smoking indoors. A preview of the line renters will see | Next (or "Nothing to add") | Never |
| 8 | **Has this home been let before?** | The rent check, one question per screen. Most people answer one to three | Next | Never |
| 9 | **Ready to go live** | The home's page as renters will see it, and "On gaff.ie" with "Change". Anything still to do first, each asked once: a number renters can call (agencies); "Confirm it's you" (private landlords) | Start taking enquiries | Never |

After step 9 one more screen asks a single question: "Is it advertised anywhere else?" with Daft, MyHome and No as choices. Daft or MyHome leads to [Forwarding enquiries](#forwarding-enquiries), if it isn't already set up. Then the user lands on the letting's page.

**UX-LT-1.** Adding a letting starts with one input that accepts pasted text, typed description, and attached files (PDF, Word, images). There is one primary button. `[P7, P13, P2 · R1]`

**UX-LT-2.** Gaff reads what was given and fills in: address, Eircode, rent, available-from date, type, bedrooms, bathrooms, furnishing, BER, parking, lease length if stated, and a list of other facts a renter might ask about. `[P7, P13]`

**UX-LT-3.** Gaff never invents a value. A field it can't find is left empty and marked "Check this". A field it found shows, on tap, the words it came from ("From your advert: 'gas fired central heating'"). `[P13 · rule 7]`

**UX-LT-4.** The review screen (step 2) is a preview of the home, not a form. Each item is edited in a sheet opened by tapping it. `[P1, P2]`

**UX-LT-5.** After the review, the user sees only the steps that still need an answer. A complete import goes from step 2 to step 7. `[P7, P3]`

**UX-LT-6.** If pasted or uploaded text says who the home would suit ("professionals only", "no HAP", "would suit a working couple"), Gaff leaves that line out of the facts and the description, and says so once, on the review screen: "Gaff left out 1 line. Adverts can't say who a home suits. Why?" The link explains in three sentences. `[rule 3 · R2]`

**UX-LT-7.** Text the user types or pastes is treated as information, never as instructions to the assistant. Names, phone numbers and email addresses are removed before text goes to the model. `[rule 7]`

**UX-LT-8.** If the user pastes a Daft or MyHome link, Gaff keeps it to match enquiries to this home and does not fetch the page: the portals' terms don't allow it (Q31). The screen says: "Got it. Gaff will use this link to match enquiries. Paste the advert's text too, and Gaff will fill in the details." `[P7 · R6, Q31]`

**UX-LT-9.** The address step is one search field that accepts an Eircode or a typed address and returns the full postal address. A link, "Enter it myself", opens the manual fields. An address without an Eircode is accepted. `[P6, P7]`

**UX-LT-10.** Photos are uploaded by drag and drop, by choosing files, or from a phone's library. Gaff stores its own copy, removes location and camera data, and resizes for display. Up to 30 photos. They can be reordered by dragging, and by "Move earlier" and "Move later" in each photo's menu. There is no warning line about rights: the terms cover it (Q46). `[P6, P10]`

**UX-LT-11.** "Letting details" offers only the four fixed criteria. Each is a row that's off until tapped, then asks for one value. There is no free text. One house rule can be switched on below them, "No smoking indoors": it's shown to renters and isn't used to rank anyone. The preview shows the line renters will see, such as "No pets (assistance dogs always welcome)". A link, "Why only these?", explains in three sentences. `[rule 3 · R2, Q36]`

**UX-LT-12.** The rent check never asks for the rent again. It asks one question per screen, and asks a question only when an earlier answer makes it apply. A first-time letting is one tap. `[P2, P7 · R3]`

**UX-LT-13.** The rent check's result is its own screen: either "You can set the rent at market level" or "The rent cap applies", with one sentence of why. If the asking rent is above what the rules allow, the screen's one action is to change the rent, in a field on that screen, with the most the rules allow shown. "About these rules" holds the detail and the rules version. `[P1, P3 · R3]`

**UX-LT-14.** A letting needs exactly these to go live: an address, a rent, an available-from date, a type and bedroom count, a finished rent check, and a confirmed lister (an agency's confirmation, or a private landlord's verified identity). To be shown on Gaff it also needs a BER and one photo. Nothing else blocks go-live. `[P8 · Q47]`

**UX-LT-15.** Going live is a person's decision, recorded as today (`confirm_setup`). `[rule 1 · R27]`

**UX-LT-16.** A letting can also be started from an enquiry. When enquiries arrive for a home Gaff doesn't know, Today says "New enquiries for 12 Ranelagh Road. Set it up?" Accepting opens step 1 with the address and advert link filled in from the enquiry email. `[P7, P9 · R6]`

### Showing the home on Gaff

**UX-LT-21.** A home that goes live is shown on gaff.ie, where renters can find it and ask to view ([section 5](05-renter-owner-referee-flows.md#a-homes-page)). This is on unless the operator switches it off at the go-live step or later in Home. A home that isn't shown still runs on Gaff, taking enquiries from Daft and MyHome. `[P7 · Q27]`

**UX-LT-22.** The home's page is made from what's already there: photos, address, rent, facts, letting details, the description and the BER. Going live asks for nothing extra except a missing BER or a first photo. `[P7, P8]`

**UX-LT-23.** A home that was let through Gaff before can be let again in one step. "Let it again" opens the review screen with everything filled in from last time: photos, facts, letting details, and the last rent and its date for the rent check. The operator changes what's new and goes live. `[P7 · AJ2]`

**UX-LT-24.** Any live letting has "Send a test enquiry" in its menu until its first real enquiry arrives. It shows the operator what a renter gets. `[P9]`

### What's deferred, and to when

| Asked today at set-up | Now asked | Why then |
| --- | --- | --- |
| Viewing times | Offered right after go-live, and prompted on Today once people have answered | Not needed for Gaff to reply to enquiries |
| Owner's name and email | Prompted once after go-live. Required at the offer | Needed for the owner's approval |
| Advert links | Read from the pasted advert or the first enquiry. Asked only if matching fails | Gaff can usually find them |
| Three comparable rents | Gaff finds them if it can (Q41). Otherwise a task on the letting from go-live. Required before the offer is sent | The offer states the rent, and the tenant's rent pack needs them |
| Where tenants pay | The payment step of the first tenancy | Not needed until money is requested |
| A number renters can call | Agencies: once, at their first go-live. Private landlords: optional then, and required before they request payment | Renters can ring if they'd rather (Q43), and a tenant must be able to check bank details by phone |

### The import route, and portal terms

Daft's and MyHome's terms restrict automated collection from their sites, so Gaff doesn't fetch adverts from them (Q31). Daft's advertiser terms say the advertiser owns the adverts they post, so an operator can give Gaff their own advert. Every route below is one of those two things: the operator handing over their own material, or Gaff reusing what it already holds.

| Route | In the MVP | Notes |
| --- | --- | --- |
| Paste the advert's text | Yes | The operator copies their own words |
| Upload a brochure, screenshots or photos | Yes | |
| Describe the home in their own words | Yes | |
| Start from the first forwarded enquiry | Yes | The email was sent to the operator |
| Let a home again | Yes | Everything from the last time, to review (UX-LT-23) |
| Paste a link and Gaff fetches the advert | No | Only with the portal's written permission |
| A feed from the portal or the agent's software | Later | Needs a partnership |

### States

| State | What the user sees |
| --- | --- |
| Reading the advert | The review screen's layout appears at once and fills in as Gaff reads: "Reading your advert…". Typically under ten seconds |
| Gaff couldn't read it | "Gaff couldn't make that out. Paste the text, or fill it in yourself." Both as buttons. What was typed is kept |
| Address not found | Under the field: "We can't find that. Check the Eircode, or enter the address yourself." |
| A photo fails to upload | That photo's tile says "Didn't upload" with "Try again". The others carry on |
| A fact Gaff can't share | At that fact: "Gaff can't share this with renters. Homes can't be refused to people who get HAP. Remove it, or describe the home instead." |
| Returning to a draft | Lettings shows it under "Setting up" with "Continue" |

## Forwarding enquiries

A home shown on Gaff gets enquiries with no set-up at all. An operator who also advertises on Daft or MyHome sends those enquiries to Gaff with one forwarding rule. Most pilot operators will, so this short flow, done once per account, decides whether they see the product work.

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Where do your Daft enquiries arrive?** | Choice cards: Gmail, Outlook or Microsoft 365, Something else | Next |
| 2 | **Forward them to Gaff** | Your Gaff address with a copy button, and three numbered steps for the chosen mail service, with a button that opens its forwarding settings | I've done that |
| 3 | **Confirming** | Gaff waits for the mail service's confirmation email, reads the code or link from it, and shows it with a copy button | Send a test enquiry |
| 4 | **It works** | Gaff sends a made-up enquiry through the rule and shows the reply it would send | Done |

**UX-LT-17.** Forwarding set-up is a guided flow with steps specific to the user's mail service. `[P10, P9 · R5]`

**UX-LT-18.** Gaff reads the confirmation code or link out of the mail service's confirmation email and presents it. The user never opens "Needs attention" to hunt for it. `[P7]`

**UX-LT-19.** The flow ends with a test enquiry the user can see answered. This is the product's first "it works" moment and is offered again from the setup checklist until done. `[P9, P14]`

**UX-LT-20.** A letting that's advertised on Daft or MyHome with no forwarding in place says so as its one task. It never sits silently waiting. `[P5]`

## A letting's page

**Jobs:** AJ1, LJ1, LJ2.
**Screens replaced:** 08-letting-overview, 11, 13, 15, 16-timeline, 18-enquiries, and the header on every letting screen.

### What changes

| Today | Redesign |
| --- | --- |
| "Step 1 of 9", a nine-segment stage bar, and up to seven tabs that change by stage | One status line in words, a four-part progress bar, and three fixed views |
| A five-row checklist and three summary cards repeating it | Three blocks: what needs you, what's happening, what's next |
| Tabs for Enquiries, Shortlist, Attendance, Applications, Tenancy | One **People** view that shows the right list for the stage |
| Timeline is a tab, and the owner's link hides on it | **History** and "Share with the owner" are in the page's menu |

### Layout

| Part | Content |
| --- | --- |
| Header | Back to Lettings. The cover photo, small. The address as the title. One status line. A menu (⋯) |
| Progress | Four parts: **Set up, Find, Choose, Sign**. The current part is filled. Its label reads, for example, "Find · Viewings" |
| View switch | **Overview** (default), **People**, **Home** |
| Overview | Three blocks, in order: Needs you; What's happening; What's next |

The nine stages remain in the data and the record. People see four parts, because nine is more than anyone can hold and most of them pass without the user doing anything.

| Part shown | Stages inside it |
| --- | --- |
| Set up | 1 Set up |
| Find | 2 Enquiries, 3 Shortlist, 4 Viewings |
| Choose | 5 Applications, 6 Checks, 7 Offer |
| Sign | 8 Tenancy set-up, 9 Close |

**UX-LP-1.** A letting's page shows three blocks and no more: **Needs you** (one task, with the page's one primary button, or "Nothing needs you" with what Gaff is doing); **What's happening** (up to three figures for the current stage, and the last three things that happened); **What's next** (one sentence). `[P1, P2, P5]`

**UX-LP-2.** The page has three views that never change: Overview, People, Home. No view appears or disappears by stage. `[P3, P12]`

**UX-LP-3.** Progress is shown as four named parts. "Step n of 9" is not shown anywhere. `[P10, P4]`

**UX-LP-4.** No fact appears twice on the page. `[P4]`

**UX-LP-5.** The menu holds: See it on Gaff; Change the home's details; Share with the owner; Share with a colleague; History; Stop taking enquiries; Close this letting. A closed letting's menu has "Let it again". `[P3]`

**UX-LP-6.** History is the full record (today's Timeline): every message, booking and decision, newest first, with a filter for decisions only. It opens from the menu and from "See everything" under What's happening. `[P3 · R27]`

### The page at each stage

| Stage | Needs you | What's happening | What's next |
| --- | --- | --- | --- |
| 1 Set up | "Finish setting up. 2 steps left." **Continue** | Nothing | "When it's live, Gaff answers every enquiry within minutes." |
| 2 Enquiries | Usually nothing: "Gaff is answering enquiries." Otherwise one of: Send your enquiries to Gaff; Add viewing times; Approve 3 answers | Enquiries · Answered the questions · Meet everything you asked | "Next, you choose who views. Do it whenever you're ready." |
| 3 Shortlist | "23 people have answered. 14 places to fill." **Choose who views** | The same three figures | "Gaff invites the people you choose and tells everyone else where they stand." |
| 4 Viewings | Before the day: nothing. On the day: **Mark who came** | Places booked · On the waiting list · Next viewing | "After each viewing, Gaff invites the people who came to apply." |
| 5 Applications | "6 people have applied." **Choose an applicant** | Came to view · Applied | "Gaff checks only the person you choose and one backup." |
| 6 Checks | Usually nothing: "Gaff is checking Aoife and Ciarán." If a check needs you: **Review the checks** | Each person's checks: done of total | "When the checks are back, you make the offer." |
| 7 Offer | One of: **Ask Mary to approve**; **Make the offer**; or nothing: "Aoife has until Sunday 15 November, 6pm to answer." | Owner's answer · Offer status | "When Aoife accepts, Gaff tells everyone else and prepares the tenancy." |
| 8 Tenancy | The next tenancy step, one at a time: **Send the agreement**, **Sign the agreement**, **Ask for the deposit and first month's rent**, **Mark the payment received**, **Register with the RTB**, **Hand over the keys** | Steps done of total · Start date | The step after this one |
| 9 Close | **Finish this letting** | Days to let · Time saved | "Gaff deletes other applicants' details on Sunday 13 December." |

**UX-LP-7.** When a rent check, a failed send or a lapsed licence blocks progress, it is the Needs you task. A blocking problem is never left in a lower card behind a "To do" label. `[P5]`

### People

**UX-LP-8.** People is one list of everyone who enquired about this home. Each row shows a name, one line saying where they stand, and a status. Filter chips change with the stage. `[P1, P3 · R6, R10]`

| Stage | Chips | The one line per person |
| --- | --- | --- |
| Enquiries | All · Answered · Not yet | "Meets 4 of 4" or "Hasn't answered yet" |
| Shortlist and viewings | Invited · Waiting list · Others | "Booked Friday 20 November, 6pm" |
| Applications onwards | Applied · Chosen · Others | "Applied. Income meets your rule" |

**UX-LP-9.** Tapping a person opens a sheet with what they've told Gaff so far, how they fit what was asked and why, what's happened, and a link to their conversation in Inbox. It shows only what their stage has collected. `[P3 · rule 2]`

**UX-LP-10.** On a phone the list is cards. On a desktop it's a table with the same content. Neither scrolls sideways. `[P11]`

**UX-LP-15.** People has one box: "Ask about who's enquired". An operator can type "Who can move in before Christmas?" and Gaff turns it into filter chips on the four answers. The same chips can be set by tapping. Asked about anything else, Gaff says: "Gaff can sort people only by what you asked everyone: move-in date, length of stay, number of people and pets." It never names a best person. `[P13 · rule 1, rule 3, Q36]`

### Home

**UX-LP-11.** Home shows the home as renters see it, with "Change" on each part: photos, description, facts, letting details, viewing times (which opens Calendar on this home), the rent check, comparable rents, where it's advertised (Gaff, Daft, MyHome), and the owner. `[P1]`

**UX-LP-12.** Facts can be changed at any time; today they can't be edited after creation. A changed fact is used in answers from then on. `[P10 · R8]`

**UX-LP-13.** Letting details can be changed until invitations are sent. After that the page says why they're locked: "You've invited people on these, so they can't change now. That keeps it fair." `[rule 3 · R2]`

**UX-LP-14.** If Gaff can read the RTB's Rent Register ([OQ-2](12-phasing-and-decisions.md#still-open)), it suggests three comparable homes and the operator confirms them. If it can't, they're entered one home at a time: the area and type start filled in from this home, and the user types the rent, the bedrooms and, if they have it, the date. A button opens the RTB's register in a new tab. `[P7, P2 · R4, Q41]`

## Viewings and the calendar

**Job:** AJ3.
**Screens replaced:** 07-viewing-times, 31-attendance-phone.

### What changes

| Today | Redesign |
| --- | --- |
| A list of times and a form below it, ten controls on screen | A calendar with one primary action, "Add a time" |
| One page per letting | One calendar across every home, filtered to a home when opened from it |
| US-format date and time inputs | A date picker and time choices in Irish format |
| Attendance is a tab on the letting | Attendance opens from the viewing itself, on the day |

### Layout

| | Desktop (900px and up) | Phone |
| --- | --- | --- |
| View | A week, 8am to 9pm, today marked | A strip of the week's days, and the chosen day's viewings as a list |
| A viewing time | A block: the address, "6 of 8 booked" | A row: the time, the address, "6 of 8 booked" |
| Add | "Add a time" in the header. Dragging across the grid also starts one | "Add a time" as the screen's one button, fixed above the tab bar |
| Move around | Previous week, Today, Next week | Swipe the day strip, or tap its arrows |

### Adding a time

One sheet. It opens with the last settings used for this home.

| Field | Control | Default |
| --- | --- | --- |
| Home | A picker | The home it was opened from. Hidden if the user has one home |
| Day | A date picker | The next day without a viewing |
| From, until | Two time pickers in 15-minute steps | 6pm to 7pm |
| How people view | Two choice cards: **One at a time** / **Open viewing** | The last used |
| Length of each visit, or most people at once | One picker, whichever applies | 15 minutes, or 10 people |

A line under the fields updates as they change: "4 places, Thursday 19 November, 6pm to 7pm". Primary action: **Add**.

**UX-VW-1.** Viewing times are shown and edited on a calendar. `[P6 · R1, R12]`

**UX-VW-2.** The calendar has one primary action, "Add a time". Everything else about a viewing time is reached by tapping it. `[P2, P3]`

**UX-VW-3.** Adding a time is one sheet with at most five fields and sensible defaults, so the common case is: pick a day, press Add. `[P7]`

**UX-VW-4.** When a home has people waiting and no viewing times, Gaff suggests two ("Thursday 6pm to 7pm and Saturday 11am to 12pm?") with one tap to add each. The suggestion comes from when renters most often book, and never from anything about the people waiting. `[P7, P9]`

**UX-VW-5.** Dragging on the desktop grid is a shortcut. Everything it does can be done with "Add a time". `[P10]`

**UX-VW-6.** Tapping a viewing time opens a sheet: who's booked and when, places left, the waiting list count, and a menu with "Change" and "Cancel this time". Cancelling a time with bookings says who'll be told and that they'll be offered the other times. `[P3 · R12, R14]`

**UX-VW-7.** A new time that overlaps another viewing the same person leads shows a warning at the time fields. It doesn't block. `[P10]`

**UX-VW-8.** Each viewing time has "Add to my calendar", which downloads a standard calendar file. Two-way sync with Google and Microsoft calendars comes later. `[P6 · R31]`

**UX-VW-9.** All dates and times are in Irish format and Irish time, as everywhere in Gaff. No screen uses the browser's built-in date or time control. `[P12]`

### On the day

**UX-VW-10.** From 15 minutes before a viewing, its sheet and Today both offer "Mark who came". The screen is a list of who's booked, in time order, each with two large buttons: **Came** and **Didn't come**. One tap each. A mark can be changed. `[P2, P10 · R15]`

**UX-VW-11.** The attendance screen shows nothing else: no stage bar, no tabs, no navigation. One line at the top says how many are left to mark. `[P1]`

### States

| State | What the user sees |
| --- | --- |
| No viewing times yet | The empty calendar, with one line ("No viewings yet. Add a time and renters book themselves.") and "Add a time" |
| A full viewing | "8 of 8 booked · 3 waiting" |
| A past viewing, unmarked | The block is marked "Mark who came" |
| Loading | The grid at once, blocks fading in |

## The first decision: who views

**Job:** AJ3, and principle 1 of the product: a person decides.
**Screens replaced:** 25-shortlist, 26-shortlist-decided.

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Choose who views** | Everyone who enquired, in ranked order, each with a tick, a name and "Meets 4 of 4". The top people are ticked, up to the number of places. People who haven't answered come last, under a divider. A fixed line: "14 places · 14 chosen" | Next |
| 2 | **Check and send** | "You're inviting 14 people. The next 10 go on the waiting list. 19 others will be told they'll hear by Friday 14 November either way." Each of the three parts has "Change" or "See the message" | Send invitations |
| 3 | **Invitations sent** | The three counts, and "Gaff will tell you as people book." | Done |

**UX-DC-1.** The order is the existing ranking: criteria met, then time of enquiry. Tapping a row shows the reason in words. The explanation of how ranking works is one line with "How Gaff ranks" behind it, and appears once. `[P3, P4 · R10]`

**UX-DC-2.** Gaff pre-ticks the top people up to the places available. The person can change any tick. Nothing is sent until they press "Send invitations". `[rule 1 · R11]`

**UX-DC-3.** The waiting list defaults to the next ten people, or everyone left if fewer. It is never larger than the number of people. `[P7]`

**UX-DC-4.** If the person ticks fewer people than there are places, step 2 says so: "3 places won't be offered. Invite more?" `[P10]`

**UX-DC-5.** If there are no viewing times yet, the flow starts with adding one. `[P7]`

**UX-DC-6.** The wording of each message is fixed and can be read, not edited, from step 2. `[rule 7 · Q6]`

## The second decision: who is offered the home

**Jobs:** AJ4, OJ2.
**Screens replaced:** 36-applicants-side-by-side, 39-operator-check-results, 41-make-offer.

Today one page holds three forms with three save buttons: choose applicants, add the owner's details, make the offer. It becomes three focused tasks, each appearing on Today when it's due.

### Choosing an applicant

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Choose an applicant** | A card per applicant, in shortlist order: name, "Meets 4 of 4", income against the rule in words with its status, how they earn, when they applied. Side by side on desktop, up to three across, then scrolling. Stacked on a phone | Tap **Choose** on a card |
| 2 | **Add a backup?** | The other applicants as a list, and "No backup" as an equal choice | Next |
| 3 | **Check and confirm** | "Gaff will ask Aoife and Ciarán for an ID check, an income check and references. It tells them what each is for. Neither is told who's first." | Start the checks |

**UX-DC-7.** Applicant cards show only what applications collect: criteria answers, self-declared income against the rule, and how they mainly earn. A card never says "Didn't answer the questions" for a criterion that wasn't set. `[P4 · rule 2, R17]`

**UX-DC-8.** An applicant below the income rule is shown in the warning style with the reason in words. Nobody is hidden, greyed out or sorted down for it. `[rule 1; design system voice]`

**UX-DC-9.** Choosing can be changed until an offer is made, as today. `[R17]`

### Checks

**UX-DC-10.** While checks run, the operator has nothing to do and the page says so. Each person's checks appear on their card in People, in words: "ID verified", "Income confirmed: 2.8 times the rent", "Previous landlord: rented from them, rent always on time, would rent to them again". `[P5 · R18]`

**UX-DC-11.** When every check for the preferred applicant is back, Today shows one task: "The checks are back for Aoife". It opens a single screen with the results and one primary action, "Continue to the offer". `[P5, P2]`

**UX-DC-12.** A check that didn't pass is shown in the warning style with a plain reason and two actions: "Ask Aoife about this" and "Choose someone else". It is never an automatic refusal. `[rule 1 · R18]`

**UX-DC-13.** A check waiting more than three days on the renter or a referee shows who it's waiting on and "Send a reminder". `[P5]`

### The owner's approval (agencies)

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Who owns this home?** | Name and email. Shown only if Gaff doesn't have them | Next |
| 2 | **Ask Mary to approve** | What Mary will see: the chosen applicant and backup, by name, with their results in words. A quiet link: "Mary has already approved" | Send to Mary |

**UX-DC-14.** The owner's details are asked for at this step if missing, and nowhere earlier as a requirement. `[P8 · R19]`

**UX-DC-15.** "Mary has already approved" records the operator's confirmation with the offer, as today (Q22). It is asked once, here, and not again as a tick inside the offer. `[P4]`

**UX-DC-16.** While waiting, the letting says "Waiting for Mary · sent 2 hours ago", with "Remind Mary". Mary's answer arrives on Today. `[P5]`

### Making the offer

| # | Screen | Asks or shows | Primary action |
| --- | --- | --- | --- |
| 1 | **The offer** | The terms, already filled in, as a summary with "Change" on each: rent; deposit (one month's rent, the most allowed); move-in date (the available-from date); time to answer (48 hours); "If Aoife says no or doesn't answer, offer it to Ciarán" (on) | Next |
| 2 | **Check and send** | The message Aoife will get, in its fixed wording, with the terms in it | Send the offer to Aoife |
| 3 | **Offer sent** | "Aoife has until Sunday 15 November, 6pm. Gaff will tell you as soon as she answers." | Done |

**UX-DC-17.** The offer opens pre-filled. In the common case the person reads it and presses two buttons. `[P7 · R20]`

**UX-DC-18.** The deposit can't exceed one month's rent. The field accepts an amount typed with or without a comma or a euro sign. `[rule 4]`

**UX-DC-19.** The offer can't be sent until: the owner has approved (agencies), three comparable rents are recorded, and the preferred applicant's checks are back or the person confirms they're going ahead without them. If something's missing, step 1 names it and links to it. `[P5 · R4, R19]`

**UX-DC-20.** Offering to the backup automatically is on only if the person leaves it on at step 1. That is the person's decision in advance, as today (Q20). `[rule 1]`

## The third decision: what is signed

**Job:** AJ5.
**Screens replaced:** the tenancy tab, 45-rtb-pack, and the operator's side of 43, 44 and 46.

The letting's page shows one tenancy step at a time as its task. The full list of steps, with what's done, is under What's happening.

| Step | Task on the page | The focused screen | Asks for, first time only |
| --- | --- | --- | --- |
| 1 | Send the agreement | The agreement, filled in from the offer, to read. "Use our own agreement" behind a link | The owner's name, if missing |
| 2 | Sign the agreement | Appears when the tenant has signed. The agreement and one field to type a name. "We signed on paper" behind a link | Nothing |
| 3 | Ask for the deposit and first month's rent | Amounts, a pay-by date and a reference, filled in | Where tenants pay: a name and an IBAN, with re-confirmation that it's them. A number the tenant can ring, if there isn't one |
| 4 | Mark the payment received | One button | Nothing |
| 5 | Register with the RTB | Everything the RTB's form needs, in two columns, each value with a copy button; the deadline; a button to the RTB's site; then "I've registered it" | Nothing |
| 6 | Hand over the keys | The move-in checklist and the inventory, room by room | Nothing |

**UX-TN-1.** Each tenancy step is one focused screen with one primary action. `[P2 · R22 to R25]`

**UX-TN-2.** Where tenants pay is asked for at step 3 of the first tenancy and remembered. It is not in set-up. `[P8 · R23]`

**UX-TN-3.** The RTB screen lays values out as label and value pairs in two columns, each with a copy button. The tenant's PPS number is hidden until "Show" is pressed. The screen has a way back to the letting and ends with "I've registered it". `[P6, P10 · R24]`

**UX-TN-4.** The inventory is added one item at a time: room, item, condition as three taps (Good, Fair, Poor), an optional note and a photo. Each condition has its own icon. `[P2, P12 · R25]`

### Close

| # | Screen | Shows | Primary action |
| --- | --- | --- | --- |
| 1 | **Finish this letting** | What's done, and anything still open (the RTB registration) | Finish |
| 2 | **Let** | "12 Ranelagh Road is let. 9 days from first enquiry. You usually take 30." and "About 5 hours of your time saved." When other applicants' details will be deleted | One of: Add your next letting; Send Mary the summary; Invite a colleague |

**UX-TN-5.** Closing ends on a results screen that states the days to let and the time saved against the user's usual. This is where results live. `[P9, P14 · R28]`

**UX-TN-6.** The results screen offers exactly one next action, chosen in this order: send the owner the summary (agency, owner hasn't seen it); invite a colleague (agency with one member); add your next letting. `[P9]`

**UX-TN-7.** "Your usual" is asked at the first close, as two questions with tap answers, if it wasn't set during a pilot's onboarding. It is not a settings section. `[P8 · Q15]`

## Settings

**Screens replaced:** 17-gaff-address.

Reached from the account menu. A list of rows, each opening one page with one save.

| Row | Holds | Who |
| --- | --- | --- |
| Enquiries | The Gaff address and the forwarding flow | Admins and private landlords |
| The assistant | "Check Gaff's answers before they go": on or off, with one line on what each means | Admins and private landlords |
| Income rule | 2, 2.5 or 3 times the rent | Admins and private landlords |
| Where tenants pay | Name and IBAN. Shown once it's been set | Admins and private landlords |
| Agreement | Gaff's standard agreement or your own | Admins and private landlords |
| Team | Members and invites | Admins (agents can view) |
| The agency | Name renters see, the number they can call, licence, confirmation status | Admins |

**UX-ST-1.** Settings is a list of rows. Each opens a page with one subject and one save button. `[P2, P12]`

**UX-ST-2.** "Approve before send" is renamed in the product to "Check Gaff's answers before they go". `[P10 · R29]`

**UX-ST-3.** "Your usual times" is removed from Settings. `[P3]`

# 10. Screen inventory and feedback map

Part of the [UX redesign PRD](README.md). The first table maps each point of the founder's feedback to the requirement that answers it. The second maps every current screenshot (01 to 46, and the design checks) to its new flow and screen.

Screenshot names are those in the attached "Gaff: every screen of the user journey" (13 November 2026) and in `tests/e2e`.

## The founder's feedback, point by point

| Screen | Feedback | Answer | Where |
| --- | --- | --- | --- |
| 01-sign-in | Replace email-link-only sign-in; balance conversion and security | Google, Apple, or a six-digit email code. A passkey offered after the first sign-in. Re-confirmation for three sensitive actions | UX-SI-1 to 5, UX-SI-10 |
| 01-sign-in | Let users choose their method; make it familiar | Three standard choices on one screen; last-used method shown | UX-SI-1, UX-SI-6 |
| 01-sign-in | Remove the product description | No tagline in sign-in or set-up | UX-SI-7 |
| 02-welcome | Rethink the account model: an individual profile, switching between renting and letting, nothing repeated | One person, one profile. Roles follow what you do. Stored-once table. Requirements apply only at the action that needs them | UX-AC-1 to 5, UX-AC-11 to 13 |
| 02-welcome | Agency account: sign-up, invites, roles, leaving | Agency found on the PSRA register; Admin and Agent roles; invite, removal and handover flows | UX-AG-1 to 17 |
| 02-welcome | Owners: profile or link, how invited, what they see | The link stays; a profile is optional from Phase 2. Comparison table with a private landlord | UX-OW-1 to 4 |
| 02-welcome | Look at how Daft does accounts | Comparison table | [Section 2](02-accounts-and-sign-in.md#how-this-compares-with-daft) |
| 02-welcome | Separate flows and home screens for individuals and agencies, on one system | First run branches at one question. Today differs by user | UX-AC-6 to 8; [section 3](03-navigation-and-home.md#how-today-differs-by-user) |
| 02-welcome | One question per step, with progress | First run is one question per screen, four at most | UX-AC-6 |
| 03-welcome-error | The PSRA field is a different size | One control height, three standard widths, no one-off sizes | UX-DS-13, UX-DS-14 |
| 03-welcome-error | Could Gaff find the licence from the agency's name? How is the person confirmed? | Lookup on the public register. Three layers of confirmation: the licence, the first admin (checked once by Gaff), every other member (by an admin) | UX-AG-1 to 5 |
| 02-welcome | Consider a conversational set-up | Not a chat for set-up. One conversational turn for adding a letting | [Section 2](02-accounts-and-sign-in.md#should-set-up-be-a-conversation); [section 7](07-ai-in-the-experience.md#conversational-set-up-the-recommendation) |
| 04-dashboard-empty | Too many navigation items; design four or five | Four: Today, Lettings, Calendar, Inbox | UX-NV-1 to 4 |
| 04-dashboard-empty | Home is what needs attention | Today. Approvals, Questions and Needs attention stop being places | UX-NV-2, UX-HM-1 to 7 |
| 04-dashboard-empty | Keep the clear empty-state action; add a setup checklist and prompts | Checklist with one next step; one prompt at a time | UX-HM-7, UX-GR-1 to 6 |
| 04-dashboard-empty | How home differs by user | Table by user | [Section 3](03-navigation-and-home.md#how-today-differs-by-user) |
| 05-new-letting | Replace the long form with a short staged flow, with save and exit | Nine short steps, most skipped after import. Saved as you go | UX-FL-1, UX-FL-2, UX-LT-5 |
| 05-new-letting | One click where possible: import from a link, text or a document | "Tell Gaff about the home": paste, describe or upload. Link fetching held for legal review | UX-LT-1 to 8; [import routes](04-operator-flows.md#the-import-route-and-portal-terms) |
| 05-new-letting | Best-in-class address lookup | One Eircode-or-address search field | UX-LT-9 |
| 05b-new-letting-adverts | Linking to photos feels odd | Upload; Gaff hosts its own copy | UX-LT-10 |
| 06-new-letting-errors | One best-practice error pattern | At the field only; no box at the top | UX-FL-3, UX-DS-18 |
| 05, 05b | Cut and defer fields | Six things needed to go live; a table of what's deferred to when | UX-LT-14; [deferred table](04-operator-flows.md#whats-deferred-and-to-when) |
| 05 | Remove the vertically centred side menu | No sidebar. Flows hide navigation | UX-NV-3, UX-NV-6 |
| 05b | What the letter is looking for | Matching on the home and the terms, never on who the renter is | [Section 6](06-matching-and-fit.md) |
| 07-viewing-times | Redesign as a calendar | A week on desktop, a day list on a phone | UX-VW-1 |
| 07-viewing-times | Ten calls to action down to one | "Add a time". The rest opens from a viewing | UX-VW-2, UX-VW-3 |
| 08-letting-overview | Redesign around what matters at this stage | Three blocks: needs you, what's happening, what's next. Three fixed views. Four-part progress | UX-LP-1 to 6 |

## Every current screen, mapped

"Removed" is what goes. "Merged" is what moves into something else. "New" is what the new screen adds.

### Sign-up and home

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 01-sign-in | Sign-in | The tagline; "work email" wording; the emailed link as the only route | | Google, Apple, six-digit code, passkey prompt |
| 02-welcome | First run, steps 1 and 2 | "Set up your workspace"; the business-name field for landlords; the tagline | | One question per screen; the "looking for a home" route |
| 03-welcome-error | First run, steps 3 and 4: Which agency? Is this your agency? | The typed licence field and its error | | Register lookup; "being confirmed" state |
| 04-dashboard-empty | Today, first visit | The sidebar; five nav items | Lettings list moves to its own destination | Setup checklist |
| 09-dashboard-with-letting | Today | "Step 1 of 9", the stage meter, "Your time in Gaff", the time-counting note | "All lettings" moves to Lettings | Viewings today; "While you were away" |
| 32-dashboard | Today | As above; the three-line row of time figures | Rows for approvals and questions open Inbox conversations | Ordering rule; grouped counts |
| design-dashboard-light | Today, light | Navy sidebar, cream ground, serif title | | New look |
| design-dashboard-dark | Today, dark | | | Reviewed after the pilots start |
| design-dashboard-phone | Today, phone | "Sign out" in the top bar; a five-item bar with a wrapping label | | Four-tab bar; avatar menu |

### Setting up a letting

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 05-new-letting | Add a letting, steps 1 to 4 | Four address fields; the three-step indicator; the sidebar | Address into one search; rent and date into one step | "Tell Gaff about the home"; "Here's what Gaff found" |
| 05b-new-letting-adverts | Add a letting, step 6 (photos); owner prompt after go-live | "Link to the photos"; advert links as fields; owner fields at set-up | Advert links are read from the advert or the first enquiry | Photo upload; "Let the owner follow along" |
| 06-new-letting-errors | Add a letting, step 5; the error pattern | The error box at the top | | Errors at the field; the lawful-wording message with an alternative |
| 07-viewing-times | Calendar; Add a time | The list-and-form page; "Continue setting up"; browser date and time controls | Per-home page into one calendar | Week and day views; suggestions; defaults |
| 08-letting-overview | A letting, Overview, at Set up | "Step 1 of 9"; nine-part bar; the five-row checklist; the duplicate summary cards | Key facts and viewing times move to Home | Needs you / What's happening / What's next |
| 10-criteria | Add a letting, step 7: Who it suits | The separate page; selects with no "off" state | | Rows that are off until tapped; the renter's preview |
| 11-overview-with-criteria | A letting, Overview | The success notice; duplicate cards | | Toast for "Saved" |
| 12-rent-check | Add a letting, step 8 | The asking-rent field; all questions on one page | | One question per screen |
| 13-rent-over-cap | The rent check's result screen | The result in a lower card; the "To do" label over a blocking problem; the rules version in view | | Change the rent on the same screen |
| 14-comparables | A letting, Home: comparable rents | Fifteen fields on one page | | One home at a time, area and type filled in; required before the offer, not at set-up |
| 15-ready-to-go-live | Add a letting, step 9: Ready to go live | The checklist with the button under it; the contradiction about comparables | | The renter's preview |
| 16-timeline | History, from the letting's menu | The Timeline tab | "Share with the landlord" moves to the menu and a prompt | A decisions-only filter |

### Enquiries and answers

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 17-gaff-address | Forwarding enquiries (flow); Settings | Five sections with four save buttons; "Your usual times"; bank details up front | The Gaff address moves into the forwarding flow | Steps per mail service; test enquiry |
| 18-enquiries | A letting, People | The Enquiries tab; contact details in the table | | Filter chips; a sheet per person |
| 19-needs-attention | Inbox, "Which home is this about?" | The destination; "Show the email" to find a code | Into Inbox | Homes as choices; the confirmation code read out |
| 20-first-reply | The first-reply email (not a product screen; a development outbox) | Bare web addresses in the message | | A button; the same fixed wording |
| 21-approvals | Inbox, a conversation with a draft | The destination; the outlined main button | With 22, into one thread | Send, Edit, Don't send in the reply box |
| 22-questions | Inbox, the same conversation | The destination; the two radio cards | With 21 | One tick: "Remember this for 12 Ranelagh Road" |

### Renters before a viewing

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 23-renter-questions | The renter's page; Questions | The select for number of people | | Photos and facts; "This home suits"; one question per screen |
| 24-renter-thanks | Answers sent | The repeated paragraph | | Their answers beside what the home suits |
| 25-shortlist | Choose who views, step 1 | The tab; the ranking explained three times; the waiting-list number field | | Pre-ticked top people; a fixed count line |
| 26-shortlist-decided | Invitations sent; then People | The empty Invite column; the page with no next step | | A warning when places would go unoffered |
| 27-renter-choose-time | Choosing a time | | | Days, then times; a confirm step |
| 27-renter-choose-time-dark | The same, dark | | | |
| 28-renter-booked | Booked | The always-open "Change to another time" form; the repeated reminder line | | The address; add to calendar; directions |
| 29-renter-cancelled | Cancelled | The booking form shown again unasked | | "Book another time" as a button |
| 30-renter-place-offered | A place has opened up | "Choose a time" with one choice | | "Take this place"; the hold's end in words |

### Viewing day, owners and closing

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 31-attendance-phone | Mark who came, from the viewing or Today | The stage bar, the cut-off tabs, the nav on this screen | The Attendance tab into Calendar | A count of who's left to mark |
| 33-landlord-view | The owner's page | Eight figures; the per-applicant ranking table; internal events; six screens of length | The full record behind "See everything" | One sentence on where it stands; decisions only; how to reach the agent |
| 34-renter-closed | Home let to someone else | "Available from"; the offer to talk about a closed letting | | (Phase 2) Keep my details |

### Applications, checks and the offer

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 35-renter-apply | Applying | The four-line hint | | One question per screen; a check screen with "Change" |
| 36-applicants-side-by-side | Choose an applicant, steps 1 to 3 | The tab; radios under each card; "No backup" as a stray control; noise for unset criteria | | Choose, then backup, then confirm |
| 37-renter-checks | Checks | Three buttons on one page; opt-outs after the fields | | A one-time code to open; one check at a time; "Have you rented before?" first |
| 38-referee-form | A reference | Mixed layouts; the renter's footer | | "I can't give this reference"; a "Thanks" screen |
| 39-operator-check-results | The checks are back (one screen); then Ask the owner; then The offer | Three forms on one page; the stale "Next, Gaff asks…" line; the approval asked twice | | Each becomes a task on Today when it's due |
| 40-landlord-approval | Approving the tenant | Radios away from the cards; "Not done yet" four times | | One person per screen; "Still under way" |
| 41-make-offer | The offer, steps 1 to 3 | The error box; the comma-rejected deposit | | Terms filled in; a preview of the message |
| 42-renter-offer | The offer | | | One total to pay |

### Tenancy

| Screenshot | New flow and screen | Removed | Merged | New |
| --- | --- | --- | --- | --- |
| 43-tenant-agreement | The agreement | The doubled title | | The home at the top; section links; a copy to download |
| 44-tenant-payment | Paying | The PPS card under payment; the date repeated four times | | The agency's phone number; PPS as its own step |
| 45-rtb-pack | Register with the RTB | Alternating plain lines; the PPS number in view | | Two columns with copy buttons; a link to the RTB; "I've registered it"; a way back |
| 46-tenant-inventory | The inventory | The PPS card again; an open payment step after move-in | | "Something's not right" on each item |

### Current screens with no screenshot

| Screen | New flow and screen |
| --- | --- |
| The tenancy tab (operator) | A letting at stage 8: one step at a time |
| The operator's agreement page and rent pack | Tenancy steps 1 and 2; the rent pack is generated with the agreement |
| Close a letting | Finish this letting; the results screen |
| Privacy notice | Unchanged, restyled |

## Screens that are new

| Screen | Flow | Section |
| --- | --- | --- |
| The six-digit code; the passkey prompt | Sign-in | 2 |
| Which agency? Is this your agency? | First run | 2 |
| Team; Invite your team; Remove a member | Agencies | 2 |
| The account menu and context switcher | Navigation | 2, 3 |
| Lettings (as its own list) | Navigation | 3 |
| Calendar | Viewings | 4 |
| Inbox and a conversation | Navigation | 3 |
| Tell Gaff about the home; Here's what Gaff found | Adding a letting | 4 |
| Where do your enquiries arrive? and the test enquiry | Forwarding | 4 |
| People; a person's sheet; Home | A letting | 4 |
| Check and send (for invitations and the offer) | Decisions | 4 |
| The results screen | Close | 4 |
| The owner's summary after the home is let | Owners | 5 |
| "This home suits" and fit beside answers | Matching | 6 |

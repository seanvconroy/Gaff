# 3. Information architecture: navigation and home

Part of the [UX redesign PRD](README.md). This file sets the navigation for each kind of user, on phone and desktop, and specifies the home screen ("Today").

Requirement IDs here start `UX-NV` (navigation) and `UX-HM` (home). Each ends with the principles it serves and any requirement in `docs/prd.md` it carries.

## What changes

| Today | Redesign |
| --- | --- |
| Five destinations: Lettings, Approvals, Questions, Needs attention, Settings. Three are inboxes the user must check one by one. | Four destinations: **Today, Lettings, Calendar, Inbox**. Plus the account menu. |
| A navy sidebar. On form pages its items sit in the vertical middle. | A top bar on desktop and a bottom tab bar on phone. No sidebar. |
| The home page is the list of lettings, with "Needs you today" above it. | Home is **Today**: what needs you, and nothing else competing with it. |
| "Sign out" has a permanent place in the phone's top bar. | Sign out is in the account menu. |
| Settings is a top-level destination. | Settings is in the account menu. |

## Navigation for people running lettings

The same four destinations serve an agency agent, an agency admin and a private landlord. What differs is what each one shows.

| Destination | Its one purpose | What's in it |
| --- | --- | --- |
| **Today** | "What needs me now?" | Decisions and tasks waiting, today's viewings, the setup checklist, a one-line account of what Gaff did |
| **Lettings** | "How is each home doing?" | Every home, its stage in words, one line on what's happening. "Add a letting" lives here and on Today's empty state |
| **Calendar** | "When are the viewings?" | Viewing times across every home. Add times. On the day: who's coming, and mark who came |
| **Inbox** | "Who do I need to answer?" | Every conversation with renters, owners and referees, by home. Drafts to approve, questions only you can answer, and emails Gaff couldn't place are all here, under one "Needs you" filter |
| **Account menu** (avatar) | Everything else | Switch between agency and personal; profile; agency settings; team; help; sign out |

**UX-NV-1.** The product has exactly four top-level destinations for anyone running lettings: Today, Lettings, Calendar, Inbox. Nothing else is added to the bar. `[P1, P5, P10]`

**UX-NV-2.** Approvals, Questions and Needs attention stop being destinations. Their items appear in Today as things that need you, and are handled in Inbox. `[P5, P3 · R8, R29]`

**UX-NV-3.** On screens 900px wide or more, navigation is a top bar: wordmark on the left, the four destinations in the centre, the account avatar on the right. It stays at the top when the page scrolls. There is no sidebar. `[P11, P12]`

**UX-NV-4.** Below 900px, navigation is a bottom tab bar with the four destinations, each an icon above a one-word label that never wraps. The account avatar sits at the top right of each top-level screen. The bar respects the phone's safe area. `[P11, P10]`

**UX-NV-5.** Today and Inbox show a count badge when something needs the user. The two badges never count the same item twice: Today's badge is the total; Inbox's badge counts conversations needing a reply. `[P5]`

**UX-NV-6.** Focused tasks hide the navigation. Adding a letting, choosing who views, making an offer and every other step-by-step flow open full screen with their own header (close or back, progress, "Save and exit"). The user returns to where they started. `[P2]`

**UX-NV-7.** A private landlord with one home sees the same four destinations. Lettings opens straight on that home's page, with no list of one. `[P1, P10]`

**UX-NV-8.** The account menu holds, in this order: the person's name and current context with a switcher (if they have more than one, see [section 2](02-accounts-and-sign-in.md)); Profile; Agency settings and Team (agency contexts only; admins can change them, agents can view the team); Help; Sign out. `[P3]`

Why a top bar and not a sidebar: with four destinations a sidebar spends a column of every desktop screen on four words. A top bar gives the calendar and the letting page their full width, matches the phone's tab bar one for one, and removes the layout that put the menu in the vertical middle of the page. It is also the pattern Airbnb uses for hosts, which this market already knows.

### Navigation by user

| User | Phone | Desktop | Notes |
| --- | --- | --- | --- |
| Agency agent | Bottom tabs: Today, Lettings, Calendar, Inbox | Top bar, same four | Today and Lettings default to "Mine" |
| Agency admin | Same | Same | Today and Lettings have a "Mine / Everyone" switch. Team and agency settings in the account menu |
| Private landlord | Same | Same | No "Mine / Everyone". With one home, Lettings opens that home |
| Renter, no account | No navigation. One page per home, reached by private link | Same | The page is the status of their application and its one next step |
| Renter with a profile (Phase 2) | Bottom tabs: Homes, Viewings, Inbox, Profile | Top bar, same four | Phase 3 adds Search as the first tab |
| Owner, no account | No navigation. One page per home, by private link | Same | |
| Owner with a profile (Phase 2) | One list, "Your homes", then the same page per home | Same | No tab bar until they have a second role |
| Referee | No navigation. One form | Same | Never has an account |

### Moving between roles

A person can hold more than one role: an agent who also lets their own flat, a landlord who is also renting. The account menu lists each context they have, and tapping one switches to it. The destinations change to that context's set. This is Airbnb's "Switch to hosting", placed in the menu because most Gaff users have one context and should never see a switcher. Detail is in [section 2](02-accounts-and-sign-in.md).

## Today: the home screen

Today answers one question: what needs me? It has at most four blocks, in a fixed order, and each appears only when it has something in it.

| Order | Block | Shows | Appears when |
| --- | --- | --- | --- |
| 1 | **Setup checklist** | A progress ring ("2 of 4") and the next unfinished step with one button | Until setup is complete, then never again |
| 2 | **Needs you** | One row per thing waiting on this person, most urgent first | Anything is waiting |
| 3 | **Viewings today** | Each viewing today: time, address, how many are booked | There's a viewing today |
| 4 | **While you were away** | One line: what Gaff did since the last visit ("Gaff answered 38 enquiries and booked 12 viewings since Tuesday") | Gaff did something since the last visit |

**UX-HM-1.** Today is the default screen after sign-in for anyone running lettings. `[P5]`

**UX-HM-2.** "Needs you" lists every item waiting on this person across all their homes. Nobody has to open another destination to learn that something is waiting. `[P5 · R28]`

**UX-HM-3.** Each "Needs you" row says, in one line, what the task is and which home (by address), and in a second line why now (a deadline, or how long someone's been waiting). The whole row is one target. Tapping it opens the focused task directly, not the page that contains it. `[P1, P2, P10]`

**UX-HM-4.** Rows are ordered by this rule, and the rule is the same for everyone:

| Rank | Kind | Example row |
| --- | --- | --- |
| 1 | Something with a deadline today | "Mark who came · 4 Harbour View" / "Viewings finished at 7pm" |
| 2 | A decision only a person can make | "Choose who views · 12 Ranelagh Road" / "23 people have answered. 14 places" |
| 3 | A renter waiting on a reply | "Approve 3 answers · 12 Ranelagh Road" / "Waiting 20 minutes" |
| 4 | A question only you can answer | "Aoife asked about the garden · 12 Ranelagh Road" |
| 5 | Email Gaff couldn't place | "1 email Gaff couldn't match to a home" |
| 6 | Setup to finish on a home | "Finish setting up · 9 Canal View" / "2 steps left" |
| 7 | A date coming up | "Register with the RTB by Wednesday 13 January · 12 Ranelagh Road" |

`[P5, P9]`

**UX-HM-5.** Items of the same kind for the same home are one row with a count ("Approve 3 answers"), never three rows. `[P4]`

**UX-HM-6.** There is one primary button on Today at most: the next step of the setup checklist while it's showing; otherwise none. "Needs you" rows are the actions. "Add a letting" is a quiet button in the header of Lettings, and the primary button only in the empty state. `[P2]`

**UX-HM-7.** When nothing needs the user, Today says so in one line ("You're all caught up") and offers one next most valuable action, chosen in this order: finish setup; add a letting (if none is live); invite a colleague (agency, if they're the only member); add viewing times for a home that has none; otherwise nothing. `[P5, P9]`

**UX-HM-8.** "While you were away" is one sentence built from counts only. It links to nothing. Its job is to show the work Gaff did. `[P9, P13]`

**UX-HM-9.** The note about counting the user's time, and the link to "Your usual times", leave the home screen. Results (time and days saved) are shown when a letting closes, and under each closed home in Lettings. `[P4, P3 · R28]`

**UX-HM-10.** Today never shows a renter's contact details or message text in a row. Rows name the renter by first name only where a name helps ("Aoife asked about the garden"). `[P4]`

### How Today differs by user

| | Agency agent | Agency admin | Private landlord | Renter with a profile (Phase 2) |
| --- | --- | --- | --- | --- |
| Screen name | Today | Today | Today | Homes |
| Scope | Homes they lead | "Mine" by default; "Everyone" shows all homes, with each row's lead agent | Their own homes | Homes they've enquired about |
| Needs you | Their tasks | Theirs, plus in "Everyone": anything waiting more than one working day on any agent | Their tasks | Their one next step per home ("Book a viewing", "Answer by Sunday") |
| Setup checklist | Add a letting; Forward enquiries (if they do it themselves) | Add a letting; Forward enquiries; Confirm the agency; Invite your team | Add your home; Forward enquiries | None |
| Empty state action | Add a letting | Add a letting, then Invite your team | Add your home | "When you enquire about a home run with Gaff, it appears here" |
| Results | On close | On close, and a monthly line for the agency | On close | None |

**UX-HM-11.** An admin's "Everyone" view is read-first. It shows each waiting item with its lead agent's name. An admin can open and do any task, and the record shows who did it. `[P5 · DJ1]`

### States

| State | What the user sees |
| --- | --- |
| First visit, nothing set up | Greeting by first name. The setup checklist with its first step, "Add your first letting", as the primary button. Nothing else. |
| Loading | The page frame at once, with skeleton rows where "Needs you" will be. No spinner on its own. |
| All caught up | One line and, at most, one suggested action (UX-HM-7). |
| Offline or failed to load | "We couldn't load this. Check your connection." with "Try again". Anything already loaded stays on screen. |

## Lettings

A list of homes. Its job is to find a home and see how it's doing at a glance.

**UX-NV-9.** Each row shows: the home's cover photo (or a house icon), the address, one status line in words ("Viewings · 8 of 14 booked"), and a small "needs you" dot if anything on Today belongs to it. Nothing else. `[P4, P1]`

**UX-NV-10.** Rows group under three headings, shown only when they have homes: **Live**, **Setting up**, **Let**. Closed homes more than 12 months old drop off with their record. `[P3]`

**UX-NV-11.** The row no longer shows "Step 2 of 9", the nine-segment meter, time in Gaff or the usual time. `[P4, P10]`

**UX-NV-12.** On desktop the list is a grid of photo-led cards, three across. On a phone it's one column. Same component. `[P11, P12]`

## Calendar

Specified in [section 4](04-operator-flows.md#viewings-and-the-calendar). In short: a week on desktop and a day list on a phone, showing every viewing time across every home, with one primary action, "Add a time".

## Inbox

One place for every conversation.

**UX-NV-13.** Inbox is a list of conversations, newest first, each showing who, which home, the last line and when. Two filter chips: **Needs you** (default when anything is waiting) and **All**. `[P6, P5]`

**UX-NV-14.** A conversation opens as a thread, like any messaging app. Messages Gaff sent are marked as sent by the assistant. A draft waiting for approval sits at the bottom of the thread, in the reply box, already written, with "Send" as the primary button and "Edit" and "Don't send" beside it. `[P6, P13 · R29]`

**UX-NV-15.** When one email asks two things and Gaff can answer only one, the user sees one conversation with one draft. The part Gaff couldn't answer is marked in the draft ("Gaff doesn't know: is there a garden?") with a field to answer it. Sending answers both. Today, this is split across Approvals and Questions. `[P2, P7 · R8]`

**UX-NV-16.** After answering a question Gaff didn't know, a single tick, on by default, reads "Remember this for 12 Ranelagh Road". It replaces the two full-width radio cards. `[P4, P7 · R8]`

**UX-NV-17.** An email Gaff couldn't match to a home appears as a conversation with one question at the top: "Which home is this about?" and the user's live homes as choices, plus "It's not an enquiry". Where the email is a forwarding confirmation from Gmail or Outlook, Gaff reads out the confirmation code or link and shows it with a copy button, instead of asking the user to find it in the raw email. `[P7, P10 · R5, R6]`

**UX-NV-18.** Inbox is also where an operator writes to a renter or an owner themselves. A message a person writes is sent as written and marked as theirs. `[P6]`

## What's deferred

- Search across homes and people (Phase 2, once pilots have enough homes to need it).
- Notification settings beyond on and off for email (Phase 2).
- The renter's and owner's signed-in navigation (Phase 2; see [section 12](12-phasing-and-decisions.md)).

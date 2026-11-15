# 9. Activation, growth and measures

Part of the [UX redesign PRD](README.md). This file specifies the setup checklist, the prompts that guide people to the actions that matter, the growth loops, and the funnel and target for each key flow.

Requirement IDs: `UX-GR` (activation and growth), `UX-ME` (measures).

## Activation

Someone letting a home is **activated** when their first letting is live and Gaff has answered a real enquiry for it. A renter is activated when they've asked to view a home. Everything in a first session points at one of those.

### The setup checklist

A card at the top of Today until it's complete ([pattern](08-design-system-direction.md#checklists)). The steps differ by who's signed in. Each is done in its own flow and ticks itself. Renters have no checklist: their first screen is search.

| Step | Agency admin | Agency agent | Private landlord | Done when |
| --- | --- | --- | --- | --- |
| Add your first letting | 1 | 1 | 1 ("Add your home") | A letting is live, or ready and held only by the agency being confirmed |
| Send your Daft and MyHome enquiries to Gaff | 2, if they advertise there | Not shown | 2, if they advertise there | The test enquiry through the forwarding rule is answered |
| Invite your team | 3 | Not shown | Not shown | One invite is sent, or "It's just me" is chosen |

**UX-GR-1.** The checklist has at most three steps, shows one next step with one button, and can't be dismissed. `[P9, P2]`

**UX-GR-2.** The checklist never includes anything that isn't needed yet: bank details, an agreement template, calendar sync, a profile photo. A private landlord's identity check isn't on it either: it is one step inside going live. `[P8]`

**UX-GR-3.** A first letting ends with a test enquiry the user watches being answered. That is the moment the product proves itself, and it happens in the first session, before any real enquiry. `[P9, P14 · R5]`

**UX-GR-4.** An agent who joins by invite has no checklist. Their Today opens on what needs them, or on "Add a letting". `[P8]`

### Prompts, and when they appear

One prompt at a time. A prompt is a single card or line with one action, shown at the moment it's useful. Declined prompts wait at least 14 days.

| Prompt | Shown to | When | Where |
| --- | --- | --- | --- |
| Add your first letting | Everyone running lettings | No lettings | Today, as the checklist's first step |
| Set it up? (a home Gaff doesn't know) | Everyone running lettings | Enquiries arrive for an unknown home | Today |
| Add viewing times | The letting's lead | People have answered and there are no times | Today and the letting |
| Let the owner follow along | Agency members | Just after a letting goes live with no owner on it | The letting, once |
| Invite your team | Admins | Checklist; and when a sole admin has a live letting | Today |
| Share with a colleague | Agency members | Always available | The letting's menu |
| Sign in faster next time (passkey) | Everyone | After the first successful sign-in on a capable device | A sheet, once |
| Gaff can answer more if you add… | The letting's lead | The same unknown question has been asked five times | Inbox |
| Stop checking every answer? | Admins and private landlords | 20 drafts in a row were sent without edits | Today, once |
| Add your next letting | Everyone running lettings | A letting has just closed | The results screen |
| Send Mary the summary | Agency members | A letting has just closed and the owner hasn't seen it | The results screen |
| Keep my details for next time | Renters without a profile | Applying; and when a letting ends for them | The renter's page |
| Tell me when one comes up | Renters | A search finds nothing, or they've searched the same thing twice | Search |

**UX-GR-5.** No screen shows more than one prompt. If two apply, the one higher in this table wins. `[P2, P9]`

**UX-GR-6.** A prompt is never a banner across the top of the product and never a pop-up that blocks a task. `[P4]`

## Growth loops

Each loop is part of a flow that already has to exist. None adds a screen whose only purpose is growth.

| Loop | How it works | Built into | Measure |
| --- | --- | --- | --- |
| **Homes bring renters** | Every live letting has a page on Gaff that can be shared and found. Agents share the link; renters land on Gaff, see other homes and save a search | A home's page; search | Visits that begin on a home's page; share of them that search or save |
| **Saved searches** | A renter who finds nothing leaves an email and what they want. Gaff tells them when a home fits. That list of waiting renters is also what makes Gaff worth listing on | "Tell me when one comes up" | Saved searches; alerts that lead to an enquiry |
| **Renter profile** | A renter keeps their details and a verified identity. Their next enquiry is two taps and their next checks are faster. Agents get applicants who are ready sooner | "Keep my details"; "Keep this" after a check | Profiles kept; enquiries and checks that reuse one |
| **Renter experience** | Every renter hears back, books in two taps and is told the outcome. Renters come to prefer homes let this way, and agents hear it | Every renter page and message | Renter completion rates; renters who meet Gaff on a second home |
| **Agent to colleagues** | One agent starts. Lettings are visible to the agency, colleagues cover for each other, and inviting them is one field | Invites; "Share with a colleague"; the removal flow that makes handover safe | Members per agency; share of agencies with two or more active members by their second letting |
| **Agent to owner** | The owner follows the letting and approves the tenant on a page that shows the work being done, then gets a results summary. Owners expect the same from their next agent | The owner's page and summary | Share of agency lettings with an owner invited; owners who open the page |
| **Results** | Every closed letting ends with days to let and hours saved, in a form worth forwarding | The results screen | Summaries sent; referrals named at sign-up |

**UX-GR-7.** Gaff isn't white-label. A renter's pages and emails carry Gaff's wordmark with the lister's name ("Let by Halcyon Lettings"). An owner's and a referee's pages carry the agency's name, with "Run with Gaff" as one quiet line in the footer. `[P9, P4 · Q45]`

**UX-GR-8.** Nothing on a referee's or an owner's page promotes Gaff beyond that footer line. A referee is doing a favour, and an owner is the agency's client: Gaff never prompts an owner to let directly. `[P4 · FJ1, Q45]`

**UX-GR-9.** No loop uses a renter's, owner's or referee's contact details for anything but the letting they're part of. A person hears from Gaff about something else only if they opted in. `[rule 9 · Q25]`

## Measures

### The pilot measures, kept

| Measure | Target | Source |
| --- | --- | --- |
| Agent time per letting | At least 3 hours less than their usual | Active minutes in Gaff against their baseline (Q15) |
| Days from first enquiry to signed tenancy | At least 30% fewer than their usual | Dates in the record |
| First reply to an enquiry | Within 5 minutes, for 100% | Message log |

The redesign should improve the first by cutting the time spent finding and doing each task, and the second by cutting the wait before each decision.

### A funnel and a target for each key flow

Targets are hypotheses. The first job is to record a baseline for each on the current product, then set the target against it.

| Flow | Funnel | Measure | Target |
| --- | --- | --- | --- |
| **Sign-in** | Screen opened → method chosen → signed in | Completion; split by method | 90% of people who choose a method finish. Median under 30 seconds |
| **First run** | Signed in → set-up finished | Completion; time | 90%. Median under 60 seconds for a landlord, 2 minutes for an agency |
| **Adding a letting** | Started → draft reviewed → live | Share going live within 24 hours; active time from start to live | 75%. Median under 3 minutes with import, under 6 without (R1 allows 10) |
| **Import** | Something pasted or uploaded → review confirmed | Share of lettings started by import; fields changed on review | 70% use import. Two or fewer fields changed |
| **Forwarding** (operators who also advertise on Daft or MyHome) | Flow opened → rule in place → test answered | Completion on the first day | 80% |
| **Activation** | Signed up → first real enquiry answered | Share; time | 60% within 7 days |
| **On Gaff** | Letting live → shown on Gaff | Share of live lettings shown on Gaff | 90% |
| **Inviting a team** | Admin activated → invite sent → invite accepted | Share of agencies; acceptance | Half of agencies send one by their second letting. 70% accepted |
| **Home** | Today opened → first tap | Share of visits where the first tap is a "Needs you" row; time to clear an item | 70%. 80% of items cleared within 4 working hours |
| **First decision** | Live → who views decided | Time; time spent in the decision flow | Median under 48 hours from enough answers. Under 2 minutes in the flow |
| **Offer** | Checks back → owner approved → offer sent | Time at each step | Owner answers within 24 hours for 80%. Offer sent within 4 working hours of approval |
| **Search** | Search made → a home opened | Share of searches with at least one home that fits; share that open a home | 70% find a fit. 50% open a home |
| **Asking to view** | Home opened → "Ask to view" pressed → sent → email confirmed | Completion from press to sent; confirmation; time | 75% of those who press finish. 85% confirm. Under 60 seconds new, under 10 with a profile |
| **Saved search** | No result → search saved → alert opened → asked to view | Share of empty searches saved | 30% |
| **Profile** | Offered → kept | Share of applicants who keep their details; share of passed ID checks kept | 40%. 70% |
| **Where enquiries come from** | All enquiries, by source | Share made on Gaff | Rising month on month. No target yet |
| **Renter: questions** | First reply delivered → page opened → answers sent | Completion; time | 80% of those who open. Under 45 seconds |
| **Renter: booking** | Invitation delivered → opened → booked | Completion; no-shows | 85% of those who open. No-shows below each pilot's baseline |
| **Renter: applying** | Invited to apply → opened → sent | Completion | 85% of those who open |
| **Renter: checks** | Asked → all three done | Completion within 48 hours | 80% |
| **Renter: offer** | Offer delivered → answered before the deadline | Share answered | 95% |
| **Referee** | Request delivered → opened → sent | Completion within 3 days; time | 75%. Median under 2 minutes |
| **Owner** | Link sent → opened → approval given | Time to approve | 80% within 24 hours |

### Quality measures

| Measure | Target | How |
| --- | --- | --- |
| People who aren't confident with software can use it | 5 of 5 add a letting and choose who views unaided | Moderated tests with five landlords or agents the founders pick for it, before the pilots and after each phase |
| Clicks to the most common task | From Today to finishing an approval: 2 taps | Counted in end-to-end tests |
| Calls to action per screen | One primary on every screen | A check in design review and in end-to-end tests |
| Accessibility | No WCAG 2.2 AA failures | axe in every end-to-end test, as today |
| Errors | Under 5% of form submissions hit a validation error | Counted |

### How it's measured

**UX-ME-1.** Each funnel step writes an event with IDs, codes, numbers and dates only, in Gaff's own database, as use cases do today. No names, contact details or free text. `[rule 8 · ADR-0006]`

**UX-ME-2.** The MVP adds no analytics vendor. Funnels are queries on Gaff's own events, shown on Gaff's internal page ([UX-TS-5](05-renter-owner-referee-flows.md#trust-and-safety)). A product analytics service would be a new vendor handling usage data and needs the founders' approval first. `[rule 10]`

**UX-ME-3.** Operators are told their time in Gaff is counted, as today (Q15). The note moves from the home screen to the results screen and the privacy information. `[P4]`

**UX-ME-4.** Renters' pages record only that a step was reached and when. Searches are counted, not kept against a person. Nothing about a renter's device, location or behaviour is kept beyond that. `[rule 2]`

**UX-ME-5.** Baselines for every funnel are recorded on the current product before the first redesigned screen ships, so each change can be judged. `[P14]`

**UX-ME-6.** Any test of two versions (the order of sign-in methods, import first or form first) is decided on its funnel's measure, with a stated minimum sample. Pilots are small, so most early decisions come from the moderated tests, not from A/B tests. `[P14]`

### Baselines

No baseline has been taken yet. There are no numbers here until someone has run the current product from start to finish.

How a baseline is taken:

1. Put your email in `STAFF_EMAILS` and sign in with it.
2. Run the current flows end to end, before any redesigned screen ships: sign in and set up, add a letting and go live, send an enquiry, answer as the renter, decide who views, book, apply, choose applicants, do the checks and references, approve as the owner, make and accept the offer, sign, take payment and finish.
3. Open `/internal/funnels`. Each funnel shows how many reached each step, the share of the step before, and the median time between steps.
4. Copy the numbers into the table below, with the date.

The numbers are to be copied into this note before the first redesigned screen ships (UX-ME-5). There is no production traffic yet, so a baseline is the founders' own test run. Read the times as the baseline. Read the counts as proof that each step is recorded.

What the page can't show yet:

- **Draft reviewed** (adding a letting). Today, reviewing and going live are one step.
- **Home** (Today opened, first tap). It isn't recorded until Today is rebuilt.
- **Flows that aren't built**: import, forwarding, on Gaff, inviting a team, search, asking to view, saved search and profile. Their steps are listed and show dashes.
- **Active time.** Times are from one step to the next by the clock, not minutes of use.

| Funnel | Date | Reached at each step | Share of the step before | Median time |
| --- | --- | --- | --- | --- |
| To be filled in | | | | |


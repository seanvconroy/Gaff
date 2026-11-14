# 9. Activation, growth and measures

Part of the [UX redesign PRD](README.md). This file specifies the setup checklist, the prompts that guide people to the actions that matter, the growth loops, and the funnel and target for each key flow.

Requirement IDs: `UX-GR` (activation and growth), `UX-ME` (measures).

## Activation

A new account is **activated** when its first letting is live and Gaff has answered a real enquiry for it. Everything in the first session points at that.

### The setup checklist

A card at the top of Today until it's complete ([pattern](08-design-system-direction.md#checklists)). The steps differ by who's signed in. Each is done in its own flow and ticks itself.

| Step | Agency admin | Agency agent | Private landlord | Done when |
| --- | --- | --- | --- | --- |
| Add your first letting | 1 | 1 | 1 ("Add your home") | A letting is live, or ready and held only by agency confirmation |
| Send your enquiries to Gaff | 2 | 2, if the agency's aren't already forwarded | 2 | The test enquiry is answered |
| Confirm your agency | Shown as "We're confirming Halcyon Lettings", ticks itself | Not shown | Not shown | Gaff confirms |
| Invite your team | 3 | Not shown | Not shown | One invite is sent, or "It's just me" is chosen |

**UX-GR-1.** The checklist has at most four steps, shows one next step with one button, and can't be dismissed. `[P9, P2]`

**UX-GR-2.** The checklist never includes anything that isn't needed yet: bank details, an agreement template, calendar sync, a profile photo. `[P8]`

**UX-GR-3.** "Send your enquiries to Gaff" ends with a test enquiry the user watches being answered. That is the moment the product proves itself, and it happens in the first session, before any real enquiry. `[P9, P14 · R5]`

**UX-GR-4.** An agent who joins by invite has no checklist if the agency's enquiries are already forwarded. Their Today opens on what needs them, or on "Add a letting". `[P8]`

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
| Keep my details for next time | Renters | Applying; and when a letting ends for them | The renter's page (Phase 2) |

**UX-GR-5.** No screen shows more than one prompt. If two apply, the one higher in this table wins. `[P2, P9]`

**UX-GR-6.** A prompt is never a banner across the top of the product and never a pop-up that blocks a task. `[P4]`

## Growth loops

Each loop is part of a flow that already has to exist. None adds a screen whose only purpose is growth.

| Loop | How it works | Built into | Measure |
| --- | --- | --- | --- |
| **Agent to colleagues** | One agent starts. Lettings are visible to the agency, colleagues cover for each other, and inviting them is one field | Invites; "Share with a colleague"; the removal flow that makes handover safe | Members per agency; share of agencies with two or more active members by their second letting |
| **Agent to owner** | The owner follows the letting and approves the tenant on a page that shows the work being done, then gets a results summary. Owners talk to other owners and expect the same from their next agent | The owner's page and summary | Share of agency lettings with an owner invited; owners who open the page |
| **Renter experience** | Every renter hears back, books in two taps and is told the outcome. Each page says "Run with Gaff". Renters come to prefer homes let this way, and agents hear it | Every renter page and message | Renter completion rates; renters who meet Gaff on a second home |
| **Renter profile** (Phase 2) | A renter keeps their details. Their next application through Gaff is pre-filled. Agents get applicants who are ready sooner | "Keep my details for next time" | Profiles kept; applications that reuse one |
| **Results** | Every closed letting ends with days to let and hours saved, in a form worth forwarding | The results screen | Summaries sent; referrals named at sign-up |

**UX-GR-7.** "Run with Gaff" is one quiet line in the footer of every private page and email. It links to a one-page explanation of what Gaff is, written for the person reading it. `[P9, P4]`

**UX-GR-8.** Nothing on a referee's or an owner's page promotes Gaff beyond that footer line. A referee is doing a favour, and an owner is the agency's client: Gaff never prompts an owner to let directly (OQ-15). `[P4 · FJ1]`

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
| **Forwarding** | Flow opened → rule in place → test answered | Completion on the first day | 80% |
| **Activation** | Signed up → first real enquiry answered | Share; time | 60% within 7 days |
| **Inviting a team** | Admin activated → invite sent → invite accepted | Share of agencies; acceptance | Half of agencies send one by their second letting. 70% accepted |
| **Home** | Today opened → first tap | Share of visits where the first tap is a "Needs you" row; time to clear an item | 70%. 80% of items cleared within 4 working hours |
| **First decision** | Live → who views decided | Time; time spent in the decision flow | Median under 48 hours from enough answers. Under 2 minutes in the flow |
| **Offer** | Checks back → owner approved → offer sent | Time at each step | Owner answers within 24 hours for 80%. Offer sent within 4 working hours of approval |
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

**UX-ME-2.** Phase 1 adds no analytics vendor. Funnels are queries on Gaff's own events, shown on a simple internal page for the founders. A product analytics service would be a new vendor handling usage data and needs the founders' approval first. `[rule 10]`

**UX-ME-3.** Operators are told their time in Gaff is counted, as today (Q15). The note moves from the home screen to the results screen and the privacy information. `[P4]`

**UX-ME-4.** Renters' pages record only that a step was reached and when. Nothing about a renter's device, location or behaviour is kept beyond that. `[rule 2]`

**UX-ME-5.** Baselines for every funnel are recorded on the current product before the first redesigned screen ships, so each change can be judged. `[P14]`

**UX-ME-6.** Any test of two versions (the order of sign-in methods, import first or form first) is decided on its funnel's measure, with a stated minimum sample. Pilots are small, so most early decisions come from the moderated tests, not from A/B tests. `[P14]`

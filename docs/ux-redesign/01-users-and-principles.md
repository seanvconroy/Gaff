# 1. Users, jobs and design principles

Part of the [UX redesign PRD](README.md). This file says who Gaff is for, what each person is trying to get done, and the fourteen principles every screen is held to.

## Words used in this PRD

| Word | Meaning | Shown in the product? |
| --- | --- | --- |
| Person | One human with one Gaff profile and one sign-in | No. The product says "you" |
| Agency | A business account with members | Yes, by its own name |
| Member | A person who belongs to an agency, as an admin or an agent | "Admin", "Agent" |
| Private landlord | A person letting their own home, with no agency | "Landlord" |
| Operator | Whoever runs a letting: an agency member or a private landlord. The old "workspace" user | No. Internal word only, as in the code today |
| Owner | The property owner, when an agency lets their home | "Owner" (today's screens say "landlord") |
| Renter | Anyone who enquires about, views or applies for a home | Never as a label; the product says "you" |
| Tenant | The renter who accepted the offer | "Tenant", from the offer onwards |
| Referee | A previous landlord or employer asked for a reference | No |
| Private link | A page reached by an unguessable link, with no sign-in | No |

## Users and their jobs

Six kinds of user. The first four can pay or decide; all six must find Gaff effortless. Jobs are in the user's own words, most important first. Each flow in this PRD names the job it serves.

### The individual, renting

Uses a phone. Often anxious, often applying for many homes at once. Never pays.

| # | Job | Served by |
| --- | --- | --- |
| RJ1 | "Tell me straight away if this home could suit me, and what happens next." | Fit summary, status page ([5](05-renter-owner-referee-flows.md), [6](06-matching-and-fit.md)) |
| RJ2 | "Let me book a viewing in a couple of taps, and change it without ringing anyone." | Booking |
| RJ3 | "Don't ask me for documents unless I'm the one you're choosing." | Staged data, checks |
| RJ4 | "Don't make me type the same things again for the next home." | Optional profile (Phase 2) |
| RJ5 | "Tell me the outcome either way, and let me reach a person when it matters." | Status page, outcomes |

### The individual, letting their own home (private landlord)

Lets a home once every year or two. Not a professional. Often not confident with software. Worried about getting the law wrong.

| # | Job | Served by |
| --- | --- | --- |
| LJ1 | "Get a good tenant signed without it taking over my evenings." | The whole flow; Today |
| LJ2 | "Tell me exactly what to do next, and keep me inside the law." | One next action per screen; rent check; fixed criteria |
| LJ3 | "Deal with the flood of enquiries for me." | AI replies; shortlist |
| LJ4 | "Don't make me learn a system." | Familiar patterns; no jargon |
| LJ5 | "Let me show I chose fairly if I'm ever asked." | History |

### The agency agent

Runs five to thirty lettings at once, mostly from a phone between viewings. Already has the advert written on Daft.

| # | Job | Served by |
| --- | --- | --- |
| AJ1 | "Tell me what needs me now, across all my homes." | Today |
| AJ2 | "Get a new home live in minutes from the advert I've already written." | Import |
| AJ3 | "Fill the viewings without phone tag or no-shows." | Calendar, booking, reminders |
| AJ4 | "Pick the tenant and get the owner's yes quickly." | Applicants, owner approval, offer |
| AJ5 | "Get it signed, paid, registered and off my desk." | Tenancy steps |

### The agency admin

Owns or manages the agency. Often also an agent, so they have every agent job too.

| # | Job | Served by |
| --- | --- | --- |
| DJ1 | "Know every letting is on track without asking each agent." | Today, "Everyone" view |
| DJ2 | "Get my team in within minutes, and take someone off the day they leave." | Invites, removal |
| DJ3 | "Keep the agency safe: licence, fair letting, a record we can stand over." | Agency confirmation, History |
| DJ4 | "Show our owners the work we do for them." | Owner page |
| DJ5 | "See what it saves us." | Results on Today and at close |

### The owner (an agency lets their home)

Checks in occasionally, on a phone. Has one decision to make: approve the tenant.

| # | Job | Served by |
| --- | --- | --- |
| OJ1 | "Know my home's letting is moving, without ringing the agent." | Owner page |
| OJ2 | "Approve the tenant quickly, and feel sure about it." | Approval |
| OJ3 | "Know it was done properly: rent rules, registration." | Close summary |

### The referee

A previous landlord or an employer. Did not ask to be involved. Opens one email, once.

| # | Job | Served by |
| --- | --- | --- |
| FJ1 | "Let me do this in two minutes on my phone, and be done." | Reference form |
| FJ2 | "Tell me why I got this and who sees my answer." | One line at the top |

## Design principles

Fourteen principles. Each has a short name (P1 to P14) used to trace requirements, what it means in Gaff, and a test a reviewer can apply to any screen. When two principles pull apart, the lower number wins.

| # | Principle | What it means in Gaff | The test |
| --- | --- | --- | --- |
| P1 | **Design for the job** | Every screen starts from one job in the tables above. Content that doesn't serve that job is cut or moved behind a tap. | Can you name the job this screen serves? Does everything on it serve that job? |
| P2 | **One thing at a time** | One task per screen. One primary button. One question, or one small group of related questions, per step. Progress always visible. | Is there exactly one filled button? Could a step be split? |
| P3 | **Progressive disclosure** | Show what's needed now. Explanations, rare actions, advanced settings and later stages wait behind "Show more", a menu, or the stage that needs them. A home being set up shows nothing about applications or tenancy. | Is anything here only needed later, rarely, or once? |
| P4 | **Kill the fluff** | Every word earns its place. No marketing lines inside the product, no heading that repeats the one above it, no permanent explainer boxes. A screen's helper copy is two lines at most. | Delete each sentence in turn. Did the screen get worse? |
| P5 | **The product tells you what needs you** | Home is the list of what needs you. There is no separate tab to check. When nothing needs you, Gaff says so and offers the next most valuable thing to do. | From Home, can the user see everything waiting on them without opening anything else? |
| P6 | **Don't reinvent the wheel** | Use the pattern people already know: Google, Apple and passkey sign-in; address search; Calendly-style booking; a messaging inbox; drag-and-drop upload; errors at the field. | Would someone who uses Airbnb, Gmail and Calendly know how this works without being told? |
| P7 | **Remove steps relentlessly** | For each thing we ask, first try to look it up, infer it, import it or pre-fill it for the user to confirm. Aim for moments that surprise: paste an advert, see a finished letting. | Did the user type anything Gaff already knew or could have found? |
| P8 | **Shortest time to value; defer the hard parts** | People get in and do something useful before Gaff asks for anything costly. Licence details, bank details, identity checks, documents and payment are asked for at the step that needs them, not before. | Is anything on this screen not needed for the very next step? |
| P9 | **Guide people to the actions that matter** | At each key moment the one action Gaff most wants is in front of the user: add your first letting, forward your enquiries, invite a colleague. A short setup checklist shows progress. Growth loops are part of the flow, not banners. | Does the empty or finished state offer one clear next action? |
| P10 | **Simple enough for people who aren't tech-savvy** | No jargon. No gestures that aren't also buttons. Large targets. Save and exit everywhere. Undo instead of "Are you sure?" where the action can be undone. | Could a landlord who lets one home every two years finish this alone, on a phone? |
| P11 | **One adaptive system** | Every component works on a phone and a desktop and adapts between them. Nothing is desktop-only. The same components can be built natively later. | Does this work one-handed at 360px wide? |
| P12 | **Consistent, premium craft** | One component set, with fixed sizes, spacing and states. No one-off controls. The look is modern, clean and calm, in the class of Airbnb and Revolut, with Gaff's own identity. | Is every control on this screen a standard component at a standard size? |
| P13 | **AI-native where it helps, never for show** | AI is used where it removes real work: import, drafting, answering, summarising. Simple choices stay as taps. Every AI pattern names the problem it solves. | Is this faster than a form or a tap? If not, it's a form or a tap. |
| P14 | **Optimise for conversion** | Every field, word and click costs users. Each key flow has a funnel, a measure and a target. | Which measure in [section 9](09-activation-growth-measures.md) does this step move? |

### Two principles the redesign keeps from today

These are already in `docs/design-system.md` and stay as they are.

- **Always say what happens next, and when.** Every screen and message ends with the next step.
- **Fair and visible.** Show why someone is where they are, in plain words.

### What the principles rule out

A short list of things the current product does that no redesigned screen may do.

| Today | Why it goes | Principle |
| --- | --- | --- |
| A tagline under the sign-in card and on set-up | Marketing copy inside the product | P4 |
| Five navigation items, three of them inboxes | The user has to check each one | P5 |
| A letting page with a step line, nine-stage bar, tabs, a five-row checklist and three summary cards that repeat the checklist | No focus; the same fact shown twice | P1, P3 |
| An error box at the top of the form and errors at the fields | Two patterns for one job | P6, P12 |
| Three save buttons on one page (applications, owner details, offer) | Three tasks on one screen | P2 |
| Bank details in Settings from day one | Asked long before they're needed | P8 |
| Typing an address, a rent already on the advert, fifteen comparable-rent fields | Gaff could find, import or pre-fill them | P7 |
| "Step 1 of 9 · Set up", "approve-before-send", rule version strings | Our words, not the user's | P10 |
| A PSRA field narrower than the fields around it | A one-off control size | P12 |

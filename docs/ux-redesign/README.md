# Gaff UX redesign: product requirements

Agreed with the founder on 14 November 2026. Ready to build.

This PRD redesigns Gaff's user experience end to end, for both sides of a letting: the people running it, and the people looking for a home. It is written to be designed and built from, and split into numbered files so each part can be handed to a different agent.

**To build it, start at [BUILD.md](BUILD.md).** It is seven sentences to paste, in order.

**Status.** The founder answered every question this PRD raised. The answers are recorded as Q27 to Q48 in [`docs/open-questions.md`](../open-questions.md) and summarised in [section 12](12-phasing-and-decisions.md). `docs/prd.md` carries the scope change. The product rules in `CLAUDE.md` are unchanged.

## Summary

### The problem

Gaff works from first enquiry to signed tenancy, but using it is hard work. In the founder's words: "It's clunky, cognitive overload, and it adds friction instead of making things simple and seamless."

Five things cause that:

1. **Too much on every screen.** A letting's page has a step line, a nine-part bar, tabs, a five-row checklist and three cards repeating it. The offer page has three forms and three save buttons.
2. **No focus.** Three separate inboxes to check. A blocking problem sits in a lower card under "To do".
3. **Solved problems solved again.** An emailed sign-in link, a typed address, a list where a calendar belongs.
4. **Below a premium bar.** Cream on cream, a heritage serif for every title, controls of different sizes, a menu in the middle of the page.
5. **Friction with no purpose.** Typing what Gaff could find. Bank details asked on day one.

And one gap: renters can only meet Gaff through a link in an email. There is nowhere to look for a home.

### The goal

Gaff should feel as simple as the best consumer products, in the class of Airbnb and Revolut, with its own identity. Every screen starts from one job, shows one thing to do, and says what happens next. Gaff does the work and asks people only for what it can't find and for the decisions that are theirs.

The MVP is one product for both sides: an agency or a landlord adds a home and runs it to a signed tenancy, and a renter finds that home on Gaff, asks to view, and gets all the way to the keys.

### The twelve changes that matter most

| # | Change | Section |
| --- | --- | --- |
| 1 | One profile per person, with several roles. An agent can look for a home on the same profile. Nobody needs an account to rent | [2](02-accounts-and-sign-in.md) |
| 2 | Sign in with Google, Apple or a six-digit code, with a passkey after | [2](02-accounts-and-sign-in.md#sign-in) |
| 3 | An agency is found on the public register by name. Nobody types a licence number | [2](02-accounts-and-sign-in.md#confirming-an-agency) |
| 4 | Four destinations for letting (Today, Lettings, Calendar, Inbox), three for renting (Search, Saved, Enquiries). Home is what needs you | [3](03-navigation-and-home.md) |
| 5 | Add a letting by pasting the advert. Gaff fills in the rest for review | [4](04-operator-flows.md#adding-a-letting) |
| 6 | Only what's needed stands between a new home and going live. Everything else is asked at the step that needs it | [4](04-operator-flows.md#whats-deferred-and-to-when) |
| 7 | A letting's page shows three things: what needs you, what's happening, what's next | [4](04-operator-flows.md#a-lettings-page) |
| 8 | Viewings on a calendar, with one action | [4](04-operator-flows.md#viewings-and-the-calendar) |
| 9 | Every live home has a page on Gaff. Renters search in their own words and ask to view in a few taps | [5](05-renter-owner-referee-flows.md#finding-a-home-on-gaff) |
| 10 | A verified identity is checked once, kept on the profile and reused in every role | [5](05-renter-owner-referee-flows.md#a-verified-identity) |
| 11 | Matching on the home and the terms of the let, never on who the renter is. Gaff says who meets what was asked and never recommends a person | [6](06-matching-and-fit.md) |
| 12 | A new look: a white ground, ink for actions, a refined Atlantic blue, one type family, one control size, one design for phone and desktop. The wordmark stays | [8](08-design-system-direction.md) |

### What success looks like

| Measure | Target |
| --- | --- |
| A new agency goes from sign-in to a home ready to go live | Under 5 minutes, with import |
| A letting is added | Under 3 minutes of the user's time with import; under 6 without |
| From Today, an agent finishes the most common task | 2 taps |
| A renter asks to view a home they've found | Under 60 seconds the first time; 2 taps with a profile |
| Renters who open the questions finish them | 80%, in under 45 seconds |
| Five people who aren't confident with software add a letting and choose who views, unaided | 5 of 5 |
| Every screen | One primary action; no WCAG 2.2 AA failures; the same flow on a phone and a desktop |
| The pilot measures | At least 3 hours saved per letting; homes let at least 30% faster; first reply within 5 minutes |

The full set of funnels and targets is in [section 9](09-activation-growth-measures.md#measures). They are hypotheses until baselines are taken.

## What's in each file

| # | File | Contains |
| --- | --- | --- |
| | [BUILD.md](BUILD.md) | The founder's guide: what to paste, in what order, and what to try after each wave |
| 1 | [Users, jobs and principles](01-users-and-principles.md) | Each user's jobs in their own words, ranked. The fourteen design principles and a test for each |
| 2 | [Accounts, roles and sign-in](02-accounts-and-sign-in.md) | The account model with a diagram; sign-in; first run; agencies, roles, invites and leaving; owners; switching roles; the comparison with Daft |
| 3 | [Navigation and home](03-navigation-and-home.md) | Navigation for each user on phone and desktop; Today; Lettings; Inbox |
| 4 | [Flows for people running lettings](04-operator-flows.md) | Adding a letting and import; showing it on Gaff; forwarding; a letting's page at each stage; the calendar; the three decisions; checks; the offer; tenancy; close; settings |
| 5 | [Flows for renters, owners and referees](05-renter-owner-referee-flows.md) | Finding a home: the public site, search, a home's page, asking to view, the renter's home, profile, a verified identity, trust and safety. Then every page inside a letting, the owner's pages and the reference form |
| 6 | [Matching and fit](06-matching-and-fit.md) | What can be matched within the fair-letting rules, for both sides |
| 7 | [AI in the experience](07-ai-in-the-experience.md) | Each AI-led interaction, the problem it solves, and how the rules are kept |
| 8 | [Design system direction](08-design-system-direction.md) | Colour, type, the wordmark, sizes, components, motion, patterns, one design; what changes from `docs/design-system.md` |
| 9 | [Activation, growth and measures](09-activation-growth-measures.md) | Setup checklists; prompts; growth loops; a funnel and target per flow |
| 10 | [Screen inventory](10-screen-inventory.md) | The founder's feedback point by point; every current screenshot mapped to its new screen; the screens that are new |
| 11 | [Compliance and vendors](11-compliance-and-vendors.md) | How each constraint is kept; every vendor and where its approval stands; what must be true before real users |
| 12 | [Decisions, scope and what's still open](12-phasing-and-decisions.md) | What the founder decided; what the MVP is; what comes later; nine open questions, none blocking the build |
| 13 | [Work packages](13-work-packages.md) | The MVP in 28 packages and five waves, with the rules a build session follows |

### Where to start

| You are | Read |
| --- | --- |
| The founder, ready to build | [BUILD.md](BUILD.md) |
| The founder, checking what was decided | [12](12-phasing-and-decisions.md), then [10](10-screen-inventory.md) to see each piece of feedback answered |
| A build session | `CLAUDE.md`, then [13](13-work-packages.md) and the sections your packages list |
| A designer | [1](01-users-and-principles.md) and [8](08-design-system-direction.md), then the flow file for your package |
| The solicitor | [6](06-matching-and-fit.md) and [11](11-compliance-and-vendors.md#for-the-solicitor) |

## How requirements are written

Each requirement has an ID, a statement that can be tested, and a trace:

> **UX-NV-1.** The product has exactly four top-level destinations… `[P1, P5, P10]`

- The prefix says the area: `SI` sign-in, `AC` accounts, `AG` agencies, `OW` owners' accounts, `NV` navigation, `HM` home, `FL` rules for every flow, `LT` adding a letting, `LP` a letting's page, `VW` viewings, `DC` decisions, `TN` tenancy, `ST` settings, `SR` search, `LS` a home's page, `AV` asking to view, `RH` the renter's home, `PF` profile, `TS` trust and safety, `PP` pages inside a letting, `RN` renters, `OP` owner pages, `RF` referees, `MT` matching, `AI`, `DS` design system, `GR` growth, `ME` measures.
- `P1` to `P14` are the design principles in [section 1](01-users-and-principles.md#design-principles).
- `R1` to `R31` are the requirements in `docs/prd.md` that the new requirement carries. `Q1` to `Q48` are decisions in `docs/open-questions.md`. "Rule 1" to "rule 10" are the product rules in `CLAUDE.md`. `OQ-1` to `OQ-9` are the questions still open in [section 12](12-phasing-and-decisions.md#still-open).
- Job codes (`AJ1`, `RJ2`) are the users' jobs in [section 1](01-users-and-principles.md#users-and-their-jobs).

## What this PRD does not do

- It doesn't contain mock-ups or code.
- It doesn't change any product rule, any fixed message's wording, the ranking, or what data is collected at which stage.
- It doesn't settle legal questions. Points of Irish law are summarised from public sources, and the solicitor's list is in [section 11](11-compliance-and-vendors.md#before-real-users). That list has to be cleared before real users, not before the build.

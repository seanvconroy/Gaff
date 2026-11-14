# Gaff UX redesign: product requirements

Draft for the founders, 14 November 2026.

This PRD redesigns Gaff's user experience end to end: the workspace for people running lettings, and every page renters, owners and referees use. It is written to be designed and built from. It is split into thirteen numbered files so each can be handed to a different designer, engineer or sub-agent; [section 13](13-work-packages.md) says who gets what.

**Status.** A proposal. `docs/prd.md` remains the source of truth for what Gaff does. This PRD changes how it works and looks, not the product's rules. Where it reaches past the MVP's scope, it says so and asks for a decision ([section 12](12-phasing-and-decisions.md)).

## Questions that would change this PRD

These were the questions whose answers matter most. Each has the assumption this PRD was written on. If an assumption is wrong, the last column says what changes.

| # | Question | Assumption used | If that's wrong |
| --- | --- | --- | --- |
| A1 | Who are the pilots for? | Still agents and portfolio landlords. So Phase 1 is everything a letting needs, and anything a renter signs in for comes later | If renters come first, sections 2 and 6 move their Phase 2 and 3 items forward and section 12's phasing is redrawn |
| A2 | Does "an individual profile" mean one sign-in for every human, whatever they do? | Yes. One person, one profile, several roles | If agents and individuals stay separate accounts, section 2's model and the switcher go |
| A3 | Is the brand open, or only the layouts? | Open: colour, neutrals and type can all change. The name and wordmark are not decided here | If Navy and Atlantic stay, section 8 keeps its sizes, components and patterns and drops its colour and type changes |
| A4 | Will the founders approve Google and Apple for sign-in? | Yes, pending the usual checks. Email codes and passkeys need no approval and ship first | If not, sign-in is email code and passkey only. Nothing else changes |
| A5 | May Gaff fetch an advert from a Daft or MyHome link? | Not until the solicitor says so. Import works from pasted text, uploads and forwarded emails | If permission is given, "paste a link" becomes the first import route |
| A6 | Can the founders, or someone at Gaff, confirm each new agency by hand? | Yes, during the pilots, within a working hour | If not, agencies need an automated proof (a DNS record) before going live, which is slower for small agencies |
| A7 | Are private landlords with one home in scope? | Yes in the product, no in the sales effort | If no, first run loses one branch. Nothing else changes |
| A8 | Does billing happen in the product during the pilots? | No. Pilots are invoiced outside Gaff, as decided | If yes, a payment step is added before the first offer |
| A9 | Is a native app wanted now? | No. The design system is made ready for one | If yes, section 8's components are specified for iOS and Android as well |
| A10 | Is English the only language? | Yes | If not, every fixed template needs translation and legal review per language |

## Summary

### The problem

Gaff works from first enquiry to signed tenancy, but using it is hard work. In the founder's words: "It's clunky, cognitive overload, and it adds friction instead of making things simple and seamless."

Five things cause that:

1. **Too much on every screen.** A letting's page has a step line, a nine-part bar, tabs, a five-row checklist and three cards repeating it. The offer page has three forms and three save buttons.
2. **No focus.** Three separate inboxes to check. A blocking problem sits in a lower card under "To do".
3. **Solved problems solved again.** An emailed sign-in link, a typed address, a list where a calendar belongs.
4. **Below a premium bar.** Cream on cream, a heritage serif, controls of different sizes, a menu in the middle of the page.
5. **Friction with no purpose.** Typing what Gaff could find. Bank details asked on day one.

### The goal

Gaff should feel as simple as the best consumer products, in the class of Airbnb and Revolut, with its own identity. Every screen starts from one job, shows one thing to do, and says what happens next. Gaff does the work and asks people only for what it can't find and for the decisions that are theirs.

### The ten changes that matter most

| # | Change | Section |
| --- | --- | --- |
| 1 | One profile per person. Agencies are something you belong to. Renters, owners and referees still need no account | [2](02-accounts-and-sign-in.md) |
| 2 | Sign in with Google, Apple or a six-digit code, with a passkey after | [2](02-accounts-and-sign-in.md#sign-in) |
| 3 | An agency is found on the public register by name. Nobody types a licence number | [2](02-accounts-and-sign-in.md#confirming-an-agency) |
| 4 | Four destinations: Today, Lettings, Calendar, Inbox. Home is what needs you | [3](03-navigation-and-home.md) |
| 5 | Add a letting by pasting the advert. Gaff fills in the rest for review | [4](04-operator-flows.md#adding-a-letting) |
| 6 | Only six things stand between a new home and going live. Everything else is asked at the step that needs it | [4](04-operator-flows.md#whats-deferred-and-to-when) |
| 7 | A letting's page shows three things: what needs you, what's happening, what's next | [4](04-operator-flows.md#a-lettings-page) |
| 8 | Viewings on a calendar, with one action | [4](04-operator-flows.md#viewings-and-the-calendar) |
| 9 | Matching on the home and the terms of the let, never on who the renter is | [6](06-matching-and-fit.md) |
| 10 | A new look: a white ground, ink for actions, one accent, one type family, one control size | [8](08-design-system-direction.md) |

### What success looks like

| Measure | Target |
| --- | --- |
| A new agency goes from sign-in to a home ready to go live | Under 5 minutes, with import |
| A letting is added | Under 3 minutes of the user's time with import; under 6 without |
| From Today, an agent finishes the most common task | 2 taps |
| Renters who open the questions finish them | 80%, in under 45 seconds |
| Five people who aren't confident with software add a letting and choose who views, unaided | 5 of 5 |
| Every screen | One primary action; no WCAG 2.2 AA failures |
| The pilot measures | At least 3 hours saved per letting; homes let at least 30% faster; first reply within 5 minutes |

The full set of funnels and targets is in [section 9](09-activation-growth-measures.md#measures).

## What's in each file

| # | File | Contains |
| --- | --- | --- |
| | This file | The questions and assumptions; the summary |
| 1 | [Users, jobs and principles](01-users-and-principles.md) | Each user's jobs in their own words, ranked. The fourteen design principles and a test for each |
| 2 | [Accounts, roles and sign-in](02-accounts-and-sign-in.md) | The account model with a diagram; sign-in; first run; agencies, roles, invites and leaving; owners; switching roles; the comparison with Daft |
| 3 | [Navigation and home](03-navigation-and-home.md) | Navigation for each user on phone and desktop; Today; Lettings; Inbox |
| 4 | [Flows for people running lettings](04-operator-flows.md) | Adding a letting and import; forwarding; a letting's page at each stage; the calendar; the three decisions; checks; the offer; tenancy; close; settings |
| 5 | [Flows for renters, owners and referees](05-renter-owner-referee-flows.md) | Every private page |
| 6 | [Matching and fit](06-matching-and-fit.md) | "What a home suits" within the fair-letting rules, for both sides |
| 7 | [AI in the experience](07-ai-in-the-experience.md) | Each AI-led interaction, the problem it solves, and how the rules are kept |
| 8 | [Design system direction](08-design-system-direction.md) | Colour, type, sizes, components, motion, patterns; what changes from `docs/design-system.md` |
| 9 | [Activation, growth and measures](09-activation-growth-measures.md) | The setup checklist; prompts; growth loops; a funnel and target per flow |
| 10 | [Screen inventory](10-screen-inventory.md) | The founder's feedback point by point; every current screenshot mapped to its new screen |
| 11 | [Compliance and vendors](11-compliance-and-vendors.md) | How each constraint is kept; every new vendor and its approval status; sources |
| 12 | [Scope decisions, phasing and open questions](12-phasing-and-decisions.md) | Five scope decisions; three phases; eighteen open questions, each with a recommendation |
| 13 | [Work packages](13-work-packages.md) | Phase 1 split into twenty-one packages with briefs and dependencies |

### Where to start

| You are | Read |
| --- | --- |
| A founder | This file, then [12](12-phasing-and-decisions.md) for what needs deciding, then [10](10-screen-inventory.md) to see each piece of feedback answered |
| A designer | [1](01-users-and-principles.md) and [8](08-design-system-direction.md), then the flow file for your package |
| An engineer or a sub-agent | `CLAUDE.md`, then [13](13-work-packages.md) for your package and the sections it lists |
| The solicitor | [6](06-matching-and-fit.md), [11](11-compliance-and-vendors.md) and the questions marked "Solicitor" in [12](12-phasing-and-decisions.md) |

## How requirements are written

Each requirement has an ID, a statement that can be tested, and a trace:

> **UX-NV-1.** The product has exactly four top-level destinations… `[P1, P5, P10]`

- The prefix says the area: `SI` sign-in, `AC` accounts, `AG` agencies, `OW` owners' accounts, `NV` navigation, `HM` home, `FL` rules for every flow, `LT` adding a letting, `LP` a letting's page, `VW` viewings, `DC` decisions, `TN` tenancy, `ST` settings, `PP` private pages, `RN` renters, `OP` owner pages, `RF` referees, `MT` matching, `AI`, `DS` design system, `GR` growth, `ME` measures.
- `P1` to `P14` are the design principles in [section 1](01-users-and-principles.md#design-principles).
- `R1` to `R31` are the requirements in `docs/prd.md` that the new requirement carries. `Q1` to `Q26` are decisions in `docs/open-questions.md`. "Rule 1" to "rule 10" are the product rules in `CLAUDE.md`.
- Job codes (`AJ1`, `RJ2`) are the users' jobs in [section 1](01-users-and-principles.md#users-and-their-jobs).

## What this PRD does not do

- It doesn't contain mock-ups or code.
- It doesn't change any product rule, any fixed message's wording, the ranking, or what data is collected at which stage.
- It doesn't approve any vendor. [Section 11](11-compliance-and-vendors.md#new-vendors-and-new-uses) lists what needs approval.
- It doesn't settle legal questions. Points of Irish law are summarised from public sources and marked for the solicitor.

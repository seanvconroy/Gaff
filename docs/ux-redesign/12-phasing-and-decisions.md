# 12. Decisions, scope and what's still open

Part of the [UX redesign PRD](README.md). The founder answered this PRD's questions on 14 November 2026. This file records what was decided, sets out what the MVP now contains, what comes later, and the few questions still open.

The full wording of each decision is in [`docs/open-questions.md`](../open-questions.md), section F (Q27 to Q48).

## What was decided

| Decision | In one line | Record |
| --- | --- | --- |
| **The MVP is two-sided** | A full product for both sides from day one: running a letting, and finding and applying for a home. Private landlords with one home are in. Selling stays aimed at the letting side | Q27 |
| **One person, one profile** | Several roles on one profile: agent, private landlord, renter | Q28 |
| **The brand** | Gaff, gaff.ie. The wordmark stays: its two "f"s read as a key. Neutral with a refined off-blue | Q29 |
| **Sign-in** | Google, Apple, or a code by email; a passkey after. Google and Apple approved | Q30 |
| **Import** | No fetching from Daft or MyHome. Paste, upload, describe, start from an enquiry, or let a home again | Q31 |
| **Confirming an agency** | A founder's invitation is the confirmation. A self sign-up is confirmed once, in one press, before its first home goes live | Q32 |
| **Price** | Free for the pilot. No billing in the product | Q33 |
| **One design** | The same flows and components on phone, desktop and a future app. Designed phone first | Q34 |
| **A verified identity** | Verified once, kept on the profile, reused in every role, with no fixed expiry | Q35 |
| **Matching** | Objective fit only. Gaff never recommends a person | Q36 |
| **Conversational AI** | Where loose words become structure: adding a letting, renter search, asking who fits. Not for set-up | Q37 |
| **Address provider** | Autoaddress | Q40 |
| **Comparable rents** | Needed before the offer. Gaff finds them if the RTB's register allows | Q41 |
| **Phone numbers** | Ask to view through Gaff first; a number to call is there too | Q43 |
| **Gaff's brand** | Not white-label, not intrusive. Never court an agency's owners | Q45 |
| **Disclaimers** | None unless the law needs it at that moment or it stops a real mistake | Q46 |
| **Private landlords verify before going live** | Once, about two minutes. For Sean to confirm | Q47 |

The smaller ones (Q38, Q39, Q42, Q44, Q48) are in the record.

### What these changed in this PRD

| Change | Where |
| --- | --- |
| The renter side moved from "later" into the MVP: a public site, search, a page for each home, asking to view inside Gaff, saved homes and searches, the renter's own home and profile | [Section 5](05-renter-owner-referee-flows.md#finding-a-home-on-gaff) |
| Every live letting gets a page on Gaff. Enquiries from Gaff need no forwarding | [Section 4](04-operator-flows.md#showing-the-home-on-gaff) |
| A verified identity is kept and reused. Private landlords verify before going live | [Section 5](05-renter-owner-referee-flows.md#a-verified-identity) |
| "Who it suits" became "Letting details", so no screen echoes the wording the law objects to | [Section 6](06-matching-and-fit.md) |
| The accent is a refined Atlantic blue, and the wordmark stays | [Section 8](08-design-system-direction.md#colour) |
| Payment to Gaff, and every disclaimer that wasn't needed, came out | Throughout |
| A small internal page for Gaff's own team: confirm an agency, act on a reported listing | [Section 5](05-renter-owner-referee-flows.md#trust-and-safety) |
| The work packages were redrawn into five waves, with a build guide | [Section 13](13-work-packages.md); [BUILD.md](BUILD.md) |

## What the MVP is

One product, end to end, for both sides. "MVP done" means: a private landlord and an agency can each add a home, show it on Gaff, and run it to a signed tenancy; and a renter can find that home on Gaff, ask to view, book, apply, be checked, accept and sign, with or without an account.

| Area | In the MVP | Section |
| --- | --- | --- |
| Design system | New colour, type, sizes and components. One design for phone and desktop | 8 |
| Sign-in and accounts | Google, Apple, email code, passkeys. One profile per person. Agencies, teams, private landlords. Switching between renting and letting | 2 |
| Navigation and home | For letting: Today, Lettings, Calendar, Inbox. For renting: Search, Saved, Enquiries. A public site for anyone | 3 |
| Adding a letting | "Tell Gaff about the home"; address search; photos; letting details; the rent check; let a home again | 4 |
| On Gaff | A public page for each live home. Enquiries from Daft and MyHome still arrive by forwarding | 4, 5 |
| Running a letting | The three-block page; People; the calendar; the three decisions; checks; the offer; tenancy; close | 4 |
| Finding a home | Search in plain words or with filters; a page per home; ask to view; saved homes; alerts for a saved search | 5 |
| Inside a letting, for renters | Questions, booking, applying, checks, the offer, signing, paying, moving in | 5 |
| Profiles | A renter's details, answers and results kept for next time. A verified identity reused in every role | 5 |
| Owners and referees | The owner's page and approval; the reference form | 5 |
| Fit | Letting details; "Meets 3 of 4"; the pool summary; asking who fits | 6 |
| Trust and safety | Confirmed agencies; verified private landlords; report a listing; Gaff's internal page | 2, 5 |
| Activation and measures | Setup checklists; prompts; results; funnel events | 9 |

### Later

| Item | Why it waits |
| --- | --- |
| Pricing and billing | Free for the pilot (Q33) |
| A native app | After the pilots. The design is ready for it (Q34) |
| An installable web app with notifications | A cheap step towards the app; after the MVP |
| Two-way calendar sync with Google and Microsoft (R31) | The MVP offers a calendar file to download |
| WhatsApp (R30) | Already a "Should" in the PRD |
| Continue with Microsoft; joining an agency by email domain | If pilot data shows the need |
| An owner's own profile ("Homes I own") | Owners have one link and one decision; the link is enough |
| Renters verifying before they're chosen | Kept out to stay inside the staged-data rule (OQ-5) |
| Branches or teams inside a large agency | Every member sees every letting for now (Q44) |
| Fetching an advert from a portal link | Only with the portal's written permission (Q31) |
| A feed from agents' own software | After the pilots |

## Still open

None of these holds up the build. Each has a recommendation and an owner.

| # | Question | Recommendation | Who | When it matters |
| --- | --- | --- | --- | --- |
| OQ-1 | Must Gaff check each agent's own PSRA licence, as well as the agency's? | Not for the pilots (Q38). Leave room for it on the member's profile | Solicitor | Before selling widely |
| OQ-2 | Can software read the RTB's Rent Register within its terms, so Gaff can find comparable rents? | Find out as the first task of the tenancy work package. If yes, build the lookup. If no, the operator types three, with the area and type filled in | Build, then founders | Wave 4 |
| OQ-3 | Confirm Veriff for identity checks, and choose the open-banking provider for income checks | Veriff (Q48). The income provider is already on the launch checklist | Founders | Before the first real check. The build uses stand-ins until then |
| OQ-4 | Pricing, and when Gaff asks for payment details | After the pilot. When it comes: ask before the first offer on the first paid letting, and charge when the home is let | Founders | After the pilot |
| OQ-5 | Should a renter be able to verify their identity before anyone has chosen them? | No, for now. It collects identity data before a stage needs it. Revisit with the solicitor if renters ask for it | Solicitor | Later |
| OQ-6 | Is the accent right? | See it on real screens after wave 1, then keep or change one token | Founders | After wave 1 |
| OQ-7 | A map beside the search results | Build it with Gaff's own copy of OpenStreetMap, so no map provider is involved. If that proves impractical, ship the list without a map | Build | Wave 4 |
| OQ-8 | The legal checks before real users | The list in [section 11](11-compliance-and-vendors.md#before-real-users): terms for a marketplace, the privacy notice, a way to report a listing, whether showing homes changes the PSRA position, consent wording for kept results, and the matching design | Solicitor | Before the first real renter |
| OQ-9 | The dark theme | Design and review in light. Review dark after the pilots start | Founders | After the pilots start |

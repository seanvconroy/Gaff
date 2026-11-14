# 12. Scope decisions, phasing and open questions

Part of the [UX redesign PRD](README.md). Some of the feedback reaches past the MVP scope in `docs/prd.md`. This file puts each such item to the founders as a decision with a recommendation, sets out what ships in which phase, and lists every open question.

Nothing here changes `docs/prd.md`. When the founders decide, the decision is recorded in `docs/open-questions.md` and the PRD is updated.

## Scope decisions

### D-1. A renter-facing side

**The question.** The individual profile and the switch between renting and letting assume renters use Gaff directly: search, saved searches, enquiring inside Gaff. `docs/prd.md` rules out "a Gaff search site or marketplace for renters" for the MVP.

**Recommendation: keep it out of the pilots, and build towards it in two steps.**

| Step | What | Phase |
| --- | --- | --- |
| Renters with no account | Everything by private link, redesigned | 1 |
| An optional profile | "Keep my details for next time". A signed-in home listing the homes they've enquired about and each one's next step. No search | 2 |
| Search | "What are you looking for?", homes that fit, alerts for similar homes | 3, and only when enough homes are let through Gaff to make a search worth opening |

**Why.** A search with nine homes in it damages the brand it's meant to build. The business plan's order is the tool, then the renters, then the marketplace, and the pilots exist to prove the tool. The account model in [section 2](02-accounts-and-sign-in.md) is built so that neither later step needs a rebuild.

### D-2. Private landlords with one home

**The question.** The current focus is agents and portfolio landlords. The founder's direction lets any individual post a letting.

**Recommendation: build it in Phase 1; keep selling to agents and portfolio landlords.**

**Why.** The product already supports a landlord letting their own homes. The redesign makes that path shorter (one question at set-up), so it costs almost nothing to include. It is also the best test of principle P10: if a landlord who lets one home every two years can finish alone, an agent can. Public self-serve sign-up for private landlords opens after the pilots; during them, landlords join by invitation like everyone else.

### D-3. A reusable verified identity

**The question.** Verify once on the profile and reuse it as a renter, and later as a landlord. This needs an identity provider and a consent design.

**Recommendation: Phase 2 for renters, in a narrow form. Phase 3 for anything wider.**

| Step | What | Phase |
| --- | --- | --- |
| Checks as today | Only for the chosen applicant and backup | 1 |
| Keep the result | A renter who has passed a check for one home can keep the result (not the documents) on their profile for 12 months. On their next application it is offered to the new operator only at the checks stage, and only if they say yes then | 2 |
| Verify once, use anywhere | A "Verified" badge for private landlords; verifying ahead of any application; the EU Digital Identity Wallet | 3 |

**Why.** `docs/prd.md` already promises the Phase 2 form. It needs no extra vendor feature. Two limits keep it inside the staged-data rule: a renter is never invited to verify before some operator has chosen them, and no operator can see who holds a verified result before choosing. Otherwise verification becomes a quiet requirement on every applicant, which is the thing the Data Protection Commission objected to.

### D-4. A conversational AI set-up

**Recommendation: no chat for account set-up. Yes to one conversational turn for adding a letting, in Phase 1.**

**Why.** Set-up is two to four taps. Adding a letting is where loose information becomes structure, and "Tell Gaff about the home" does that in one step with a review. See [section 7](07-ai-in-the-experience.md#conversational-set-up-the-recommendation).

### D-5. A native mobile app

**Recommendation: not yet. Make the design system ready now, and make the web app installable in Phase 2.**

| Step | What | Phase |
| --- | --- | --- |
| Ready | Platform-neutral tokens, components specified by behaviour, bottom tabs, sheets | 1 |
| Installable | Add to the home screen, and "Needs you" notifications for agents | 2 |
| Native | iOS and Android apps for people running lettings | 3 or later, if agents' use on phones justifies it |

**Why.** Renters must never need an app. Agents would benefit from notifications, and an installable web app delivers those for a fraction of the cost.

## Phasing

### Before anything ships

| Item | Who |
| --- | --- |
| Decide D-1 to D-5 and OQ-2, OQ-3, OQ-5, OQ-9 | Founders |
| Send OQ-1, OQ-4, OQ-6, OQ-7, OQ-10, OQ-11 to the solicitor | Founders |
| Record a baseline for every funnel on the current product (UX-ME-5) | Build |
| Choose the accent on four real screens (UX-DS-6) | Founders, with design |

### Phase 1: the pilots

Everything an agent, an admin or a private landlord needs to run a letting from first enquiry to signed tenancy on the new experience, and every page a renter, owner or referee meets.

| Area | Ships | Section |
| --- | --- | --- |
| Design system | New colour, type, sizes and components | 8 |
| Sign-in | Email code and passkeys first. Google and Apple as soon as they're approved | 2 |
| Accounts | One profile per person; first run; agency lookup and confirmation; private landlords | 2 |
| Teams | Admin and Agent; invites; removal and handover; a lead per letting | 2 |
| Navigation and home | Today, Lettings, Calendar, Inbox; the account menu | 3 |
| Adding a letting | "Tell Gaff about the home" from pasted text, a description or an upload; address search; photo upload; the forwarding flow with a test enquiry | 4 |
| A letting | The three-block page; People; Home; History | 4 |
| Viewings | The calendar; Add a time; mark who came | 4 |
| Decisions | Choose who views; choose an applicant; checks; the owner's approval; the offer | 4 |
| Tenancy and close | One step at a time; the RTB screen; results | 4 |
| Renters | Every page redesigned; questions one per screen; Calendly-style booking | 5 |
| Owners and referees | The one-screen owner page; approval; the reference form | 5 |
| Fit | "This home suits"; fit beside answers; the pool summary (after legal review) | 6 |
| Activation | The setup checklist; the prompts; the results screen | 9 |
| Measures | Funnel events and an internal page | 9 |

Not in Phase 1: anything a renter signs in for; calendar sync; link import; billing inside the product; a native app.

### Phase 2: profiles and reach

| Ships | Depends on |
| --- | --- |
| Renter profiles: "Keep my details for next time"; the renter's signed-in home; keeping a check result (D-3) | The solicitor's answer on the lawful basis (already on the PRD's list) |
| Owners' profiles: "Keep your homes in one place" | |
| The context switcher for people with more than one role | Profiles |
| "Ask about this home" on the renter's page | |
| Two-way calendar sync (R31) | Vendor approval |
| Continue with Microsoft; joining an agency by email domain | Pilot data; vendor approval |
| An installable web app with notifications | Vendor approval |
| WhatsApp (R30) | Vendor approval |
| Link import | OQ-6 |
| Billing in the product | Pilots proving the price |
| Search across homes and people in the workspace | |

### Phase 3: the marketplace's first steps

| Ships | Depends on |
| --- | --- |
| "What are you looking for?", homes that fit, and alerts (D-1) | Enough homes let through Gaff |
| Public pages for homes let through Gaff | The decision to list homes on Gaff |
| "Verify once" and the landlord's badge (D-3) | An identity provider that supports it; the wallet's availability |
| Native apps (D-5) | Evidence from phone use |

## Open questions

Each has a recommendation. "Who" is who decides.

| # | Question | Recommendation | Who |
| --- | --- | --- | --- |
| OQ-1 | Is the matching design lawful: the "This home suits" line written by Gaff, fit shown to a renter beside their answers, the pool summary, and "No smoking indoors" as a house rule? | Ship all four after review. If the solicitor doubts showing fit to renters, keep the summary line and drop the comparison | Solicitor |
| OQ-2 | Which accent colour? | Heather, the deep violet in [section 8](08-design-system-direction.md#colour). Decide by looking at three candidates on four real screens | Founders |
| OQ-3 | Approve Google and Apple as sign-in providers? | Yes. Both are standard, and without them sign-in falls back to email for everyone | Founders |
| OQ-4 | Must Gaff check each agent's own PSRA licence, as well as the agency's? | Not for the pilots. Record it if an admin offers it. Follow the solicitor's answer | Solicitor |
| OQ-5 | Who confirms a new agency, and how fast? | A founder, within one working hour, during the pilots. Pilot agencies are confirmed before they arrive | Founders |
| OQ-6 | May Gaff fetch an operator's own advert from a Daft or MyHome link they paste? | Don't build it until answered. Ask the solicitor, and ask the portals for written permission. Paste and upload give the same result today | Solicitor |
| OQ-7 | On what basis does Gaff keep a copy of the PSRA register, which names individuals? | Keep business entries only, acknowledge the source, add it to the DPIA | Solicitor |
| OQ-8 | The lawful basis and consent wording for a renter keeping and reusing a check result | Consent each time it's shared; a 12-month life; never visible before the checks stage | Solicitor |
| OQ-9 | Which address provider? | Autoaddress, if it confirms EU hosting and signs a DPA. Loqate otherwise | Founders |
| OQ-10 | May the three comparable rents be recorded before the offer, not before the home goes live? | Yes, with the rent check still done before go-live. The home is already advertised by then | Solicitor |
| OQ-11 | An owner declines a tenant and gives a reason that's a protected ground. What must the agent, and Gaff, do? | Gaff takes no written reason. The agent is responsible for the decision. Add a line to the agent's screen when an owner declines: "A tenant can't be refused on a protected ground." | Solicitor |
| OQ-12 | Should renters see the agency's phone number? | Required on the payment page, so a tenant can confirm the bank details. Optional elsewhere, chosen by the agency | Founders |
| OQ-13 | After the pilots, when does Gaff ask for payment details? | Before the first offer on the first paid letting, with "€79 when this home is let. Nothing now." Charge when it's let | Founders |
| OQ-14 | Should every member of an agency see every letting? | Yes for the pilots. Add branches or teams when an agency with more than about 15 agents needs them | Founders |
| OQ-15 | How far may Gaff present itself to an agency's owners and renters? | One quiet "Run with Gaff" line in the footer, and nothing more. Never prompt an owner to let directly: agencies must trust that Gaff won't court their clients | Founders |
| OQ-16 | Is one line, "Only add photos you're allowed to use", enough for photos an agent's photographer took? | Yes, with the same wording in the terms | Solicitor |
| OQ-17 | Could Gaff look up comparable rents for the operator? | Ask the RTB whether the Rent Register's data can be reused. Until then, a link to the register and pre-filled area and type | Founders |
| OQ-18 | The name and a logo | The design system doesn't depend on either. Commission a logo once the name is settled | Founders |

The open decisions and solicitor's questions already listed in `docs/prd.md` and `docs/launch-checklist.md` still stand. This list adds to them.

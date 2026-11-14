# Prompt: write the PRD for the Gaff redesign

Paste everything below the line into the agent that will write the PRD. Attach with it:

- the screenshots of the current app (`gaff-screens-part1.pdf` to `part3.pdf`, or the PNGs in `screenshots/`);
- the five Airbnb reference screenshots (search results, listing page, profile, host "Today", listing set-up step).

If the agent can read this repository, it should also read `docs/prd.md`, `docs/design-system.md`, `docs/ux-review.md`, `docs/open-questions.md` and `CLAUDE.md`.

---

## Your role and the deliverable

You are a senior product designer and product manager, working with the founder of Gaff. Write a **product requirements document (PRD) for redesigning Gaff's user experience end to end**. The PRD will be handed to designers and engineers, so it must be specific enough to design and build from.

Write requirements and flows, not code or visual mock-ups. Where a choice is open, recommend one option and say why. Don't list every option you rejected.

## What Gaff is

Gaff runs the letting of a home in Ireland, from the first enquiry to a signed tenancy.

- **Who pays:** letting agents and agencies, and landlords who let homes themselves. Price under test: €79 per home let.
- **Who else uses it:** the property owner (when an agent lets for them), renters and their referees. Renters never pay.
- **How it works today:** the AI does the work. It replies to Daft and MyHome enquiries, answers questions from the home's facts, ranks enquirers against the operator's criteria, books viewings, chases references, and drafts the offer and tenancy documents.
- **People make three decisions:** who views, who is offered the home, and what is signed.
- **The flow has nine stages:** set-up, enquiries, shortlist, viewings, applications, checks, offer, tenancy set-up, close.

The current product works end to end, but its user experience fails the founder's bar. The attached screenshots show every current screen. The founder has written detailed feedback on the first eight screens, quoted in summary below. **Apply the same principles to every other screen too**: the renter, landlord and referee pages as well as the operator's workspace.

## The problem, in the founder's words

"It's clunky, cognitive overload, and it adds friction instead of making things simple and seamless."

The common themes in the feedback:

1. **Too much on every screen.** Too many fields, tabs, calls to action and lines of copy at once. One letting page has nine stage pills, an overview/timeline switch, five tasks, key facts, viewing times and six menu items. The viewing-times page has ten calls to action.
2. **Unclear focus.** "I don't know where to look." Users shouldn't have to search the product, or click through five tabs, to find out what needs their attention.
3. **Reinventing solved problems.** A hand-made sign-in, manual address fields, and a viewing scheduler that feels like a list rather than a calendar. All of these have familiar, best-in-class patterns.
4. **Below a premium quality bar.** The product looks dated and inconsistent: harsh neutral backgrounds, brand colours the founder dislikes, components of different sizes side by side (the PSRA licence field), and a vertically centred side menu.
5. **Friction where none is needed.** Asking for information Gaff could find itself, and asking for high-effort tasks before they're needed.

## The quality bar

Gaff should look and feel **modern, clean, sleek, elegant and premium**, in the class of Airbnb and Revolut. Airbnb is the main reference: it solves a similar two-sided problem, in a similar market, at a world-class standard on phone and desktop. Learn from its patterns; don't copy its brand. Gaff needs its own identity.

What the attached Airbnb references show:

| Reference | What to learn from it |
| --- | --- |
| Search results | One compact search control (where, when, who). Quick filter chips. Photo-led cards that give a few facts and a price. A map beside the list. |
| Listing page | Photos first, then a one-line summary of the key facts. A short set of highlights with icons. Long content behind "Show more" or "Show all 29". One sticky card with a single primary action, plus reassurance ("You won't be charged yet"). |
| Profile | Identity is verified once and shown as a badge on the profile, then reused everywhere. Trust is shown through stats and reviews. |
| Host "Today" | Four top-level destinations (Today, Calendar, Listings, Messages). "Switch to travelling" moves the same person between roles. An empty state with one friendly message and one action ("Complete your listing"). |
| Listing set-up | One question per screen. Large tappable choice cards with icons. A segmented progress bar. A fixed footer with Back and Next. "Save & exit" and "Questions?" are always available. |

## Design principles the PRD must apply

Turn these into the PRD's principles section, then apply them to every flow. Each requirement should be traceable to at least one principle.

1. **Design for the job to be done.** Start every screen from what this user is trying to get done right now. Anything that doesn't serve that job is cut or moved behind a tap.
2. **One thing at a time.** One task per screen, one primary action, and one question (or a small group of related ones) per step. Show clear progress. Completing a flow should feel quick and even rewarding, not like filling in an application form.
3. **Progressive disclosure.** Show only what's needed now. Explanations, rare actions, advanced settings and steps that don't apply yet wait until they're wanted. A home being set up doesn't show empty applications or tenancy sections.
4. **Kill the fluff.** Every word must earn its place. Cut marketing lines inside the product (such as "Gaff runs the letting of a home…" on the sign-in page), restated headings and explainer boxes. Plain, warm, short.
5. **The product tells you what needs you.** The home screen is the "needs your attention" list. There's no separate tab for it. If nothing needs the user, say so and suggest the next most valuable action.
6. **Don't reinvent the wheel.** Use the familiar best-in-class pattern for each solved problem: sign-in (Google, Apple, passkeys), address lookup, scheduling (Calendly and Cal.com), messaging, file upload, error messages (Airbnb). Familiar means no learning curve.
7. **Remove steps relentlessly.** For every step, ask whether Gaff can do it instead: look it up, infer it, import it or pre-fill it for the user to confirm. Aim for "wow" moments, for example pasting one link and seeing a complete letting ready to review.
8. **Shortest time to value; defer the hard parts.** Let people in and doing something useful before asking for anything costly. Ask for heavy tasks (identity checks, licence details, documents, payment details) only when they're needed for the next step.
9. **Guide people to the actions that matter.** At each key moment, put the one next action Gaff most wants the user to take in front of them. Examples: add your first letting, invite your agents, finish setting up your account. Use a light, progress-based setup checklist (like Revolut's) that feels like progress, not a chore. Build growth loops into the product naturally: agents invite colleagues, owners see the work being done, renters have a good experience.
10. **Simple enough for people who aren't tech-savvy.** Many agents and landlords aren't confident with software. No jargon, no hidden gestures, large targets, and forgiving flows with save-and-exit everywhere.
11. **One adaptive system for phone and desktop.** Every component works on both and adapts to the screen, ready for a native app later. Small screens make cutting information even more important.
12. **Consistent, premium craft.** One set of components with consistent sizes, spacing and states. No one-off controls. Revisit the brand colours and the neutral background, which feel harsh, and refine the whole design system.
13. **AI-native where it helps, never for show.** Use AI where it removes real work, such as conversational set-up ("Let's get you started", answering a few questions as if talking to an assistant), import, drafting and summarising. Don't wrap simple choices in chat when a tap is faster. For each AI pattern, say what problem it solves.
14. **Optimise for conversion.** Treat every pixel and click as a cost. Define the funnel for each key flow and the measure the redesign should move.

## Specific feedback to address

Address each point explicitly in the PRD, mapped to the screen it came from (the screenshot names are in brackets).

### Sign-in (`01-sign-in`)

- Replace the email-link-only sign-in with a best-in-class flow that balances conversion and security. Recommend the methods (for example Google, Apple, passkeys, and email with a one-time code as a fallback). Email links make people switch apps and can open in a different browser, which breaks the flow.
- Let users choose their method. It should feel familiar.
- Remove the product description copy from the page.

### Welcome and account set-up (`02-welcome`, `03-welcome-error`)

- **Rethink the account model.** Today there's an "operator" concept. The founder's direction:
  - **Individual profile.** One standard sign-up creates a person's Gaff profile. That person can act as a renter (enquire, book, apply) or as a private landlord (post a letting), and switch between the two the way Airbnb switches between hosting and travelling. Anything done once is stored against the profile and never repeated. For example, a person who verified their identity as a renter shouldn't verify again when they later let a home. Requirements for each action (to enquire, to create a letting) apply only when the person takes that action.
  - **Agency account.** A parent business (an agency) with child members (its agents). Define how an agency signs up, how agents are invited and authorised to act for it, the roles and permissions, and what happens when an agent leaves. Follow how world-class business tools handle workspaces and team invites.
  - **Property owners whose home an agent lets.** Today they get a private read-only link. Define whether they have a normal individual profile, how they're invited, and what they see compared with a private landlord.
  - Look at how Daft handles accounts for renters, private landlords and agents, so the flow feels familiar in this market.
  - The jobs to be done differ for individuals and agencies. Design separate flows and home screens for each, on one shared system.
- One question per step, with clear progress, as in Airbnb's set-up.
- **The PSRA licence field** is a different size from the other fields. Fix that across the board with one consistent component set.
- **Remove steps.** The PSRA register is public. Could Gaff find the agency's licence from its name and ask the user to confirm it? Say how the person is then confirmed to belong to that agency, since a public number alone proves nothing.
- Consider a conversational "Let's get you started" set-up, and recommend whether it beats a step-by-step form here.

### Home screen and navigation (`04-dashboard-empty`)

- The current navigation (Lettings, Listings, Approvals, Questions, Needs attention, Settings, plus two more calls to action) is far too much, especially on a phone. Design a navigation of about four or five destinations built around the jobs to be done. Airbnb's host navigation (Today, Calendar, Listings, Messages, Menu) is a reference, not a template.
- The home screen *is* what needs attention: decisions waiting, questions to answer, viewings today. Nobody should have to check several tabs to know things are in order.
- Keep what works: the empty state has a clear action (add a letting). Add a setup checklist and other deliberate prompts for key actions.
- Define how the home screen differs for an agency agent, an agency admin, a private landlord and a renter.

### Creating a letting (`05-new-letting`, `05b-new-letting-adverts`, `06-new-letting-errors`)

- Replace the long single form with a short staged flow: one or a few questions per step, clear progress, save and exit.
- **Make it one click where possible.** Operators usually already have the details in a Daft or MyHome advert or a document. Design an import that pre-fills everything for review: paste a link, paste the advert text, or upload a document or photos. Recommend the safest route (see the constraints on portal terms below).
- Use a best-in-class address lookup (Eircode or address search) instead of manual address fields.
- **Photos.** Linking to photos feels odd. Let people upload photos and also import them. Gaff should host its own copy, so the letting doesn't break if the source link changes or disappears.
- **Errors.** Replace the error box at the top plus inline errors with one best-practice pattern (inline, at the field, shown when it helps).
- Cut fields and copy that don't help the job, and defer anything not needed to go live.
- Remove the vertically centred side menu.

### What the letter is looking for (from `05b`)

The founder wants letters to say who they're looking for and renters to see it, so both sides save time. Renters can apply where they fit and skip homes where they don't, and letters can see who fits. AI could help on both sides. On the renter side, someone could say "two-bed flat in Ranelagh for me and my partner, 12 months, no pets". On the letter side, Gaff could say which enquirers fit the criteria.

Design this as a core marketplace feature, **within the fair-letting constraints below**. The founder's examples ("a working couple", "college students only") are protected grounds under the Equal Status Acts and can't be used. The PRD must show how far matching can go on lawful criteria, and where that line falls.

### Viewing times (`07-viewing-times`)

- Redesign it as a calendar, drawing on Calendly and Cal.com. It should feel familiar, not like a list in a general-purpose tool.
- Reduce the ten calls to action to one primary action, with everything else revealed when it's needed.

### A letting's page (`08-letting-overview`)

- Today it shows nine stage pills, an overview/timeline switch, five tasks, key facts, viewing times and six menu items. Redesign it around what matters at the letting's current stage: what needs me now, what's happening, and what's next. Show history and detail on request.

## Constraints you must keep

These come from Irish and EU law and from Gaff's product rules. The redesign changes *how* things work, not these. Where a piece of the founder's feedback runs into one, keep the intent, design the closest lawful version, and flag it in the PRD's open questions.

1. **People make every decision.** Gaff ranks, drafts and suggests. It never rejects, chooses, invites or makes an offer to anyone on its own (GDPR Article 22). AI matching can explain fit; a person decides.
2. **Fair letting: no protected grounds.** Never ask about, store, infer or use any of these: gender, civil status, family status, sexual orientation, religion, age, disability, race, nationality, membership of the Traveller community, or receipt of housing assistance (HAP counts as income). Letters' criteria come only from a fixed list: move-in date, length of stay, maximum occupants and pets. There are no free-text criteria, and assistance dogs never count as pets. Ranking reads only criteria answers and enquiry time. This rules out "working couple", "students only" and any free-text "ideal tenant" that an AI could read protected traits from. If you propose new criteria (for example a budget range or required documents), justify each against the Equal Status Acts and mark it for legal review.
3. **Staged data.** Collect renter data only at the stage that needs it:
   - before viewing: contact details and self-declared answers;
   - at applications: employment and income;
   - for the preferred applicant and one backup only: identity, affordability and references;
   - for RTB registration only: the PPSN.

   Never ask for documents before an applicant is chosen. A renter may keep verified details on their own profile if they choose to, but an operator sees them only when that renter is the chosen applicant for that home.
4. **Retention.** Personal data has a deletion date, and jobs delete it. The renter's own profile is kept only while the renter wants it.
5. **Renters never pay**, for anything, including checks. Gaff never holds money: the deposit and first month's rent go to the landlord's or agent's own account.
6. **AI disclosure and grounding.** The first message to a renter says they're talking to an AI assistant, and they can always reach a person. The AI answers only from the letting's facts. Key messages to renters (first replies, invitations, offers, outcomes) use fixed templates reviewed by a solicitor.
7. **Approved vendors only.** Any new service that handles personal data, identity or money needs the founders' approval, a signed data processing agreement and EU hosting where available. That includes Google and Apple sign-in, address lookup, identity verification and photo storage. List every new vendor the redesign needs in one table.
8. **Portal terms.** Daft and MyHome may forbid scraping their pages. Recommend an import route that doesn't depend on scraping (for example the operator pastes the advert text or uploads it, or a partnership), and flag link-based import for legal review.
9. **Accessibility.** WCAG 2.2 AA everywhere, touch targets of at least 44px, and nothing a renter must read or act on below 16px.
10. **Renters need no account to take part.** Today a renter can answer, book and apply from a private link without signing up. Keep that path. An optional profile is a benefit offered, never a gate.

## Scope decisions to surface

Some of the feedback goes beyond the current MVP scope. Don't silently expand the scope. Present each item as a decision with a recommendation and a suggested phase:

- A renter-facing side (search, saved searches, enquiring inside Gaff, "homes near you"). The individual profile and the switch between renting and letting assume one, but the current PRD rules out a renter search site or marketplace for the MVP.
- Private landlords posting a single home, compared with the current focus on agents and portfolio landlords.
- Reusable verified identity on the renter's profile (this needs an identity vendor and a consent design).
- A conversational AI set-up.
- A native mobile app later (the design system should be ready for it now).

## What the PRD must contain

1. **Summary.** The problem, the goal of the redesign and what success looks like.
2. **Users and jobs to be done.** The users are: the individual (as renter and as private landlord), the agency admin, the agency agent, the property owner whose agent lets their home, and the referee. Give each one's top jobs in their own words, ranked.
3. **Design principles**, from the list above, made concrete for Gaff.
4. **Account and role model.** Individuals, agencies and members, owners, and switching roles: entities, permissions, invites, and what's shared or reused across roles. Include a simple diagram (Mermaid is fine).
5. **Information architecture.** Navigation for each user type on phone and desktop, and the purpose of each destination.
6. **Flows.** For every flow in the screen inventory, give the steps, what each step asks or shows, the one primary action, the empty, loading and error states, and what's deferred. Cover sign-up and sign-in, agency set-up and inviting agents, creating a letting (including import), the home screen, a letting's page at each stage, viewings, the shortlist and applicants, checks, offer, signing and payment, close, and every renter, owner and referee page.
7. **Screen inventory.** A table mapping every current screenshot (01 to 46, plus the design checks) to its new flow and screen, with what's removed, merged or new.
8. **Matching and fit.** The design of the "what the letter is looking for" feature within the fair-letting constraints, for both sides.
9. **AI in the experience.** Each AI-led interaction, the problem it solves, and how disclosure, grounding and human decisions are kept.
10. **Design system direction.** Brand refinement (colour, neutrals, type), the core adaptive components and their standard sizes, motion, and the patterns for errors, empty states, progress, checklists and calendars. Say what changes from `docs/design-system.md`.
11. **Activation and growth.** The setup checklist, the key prompts and when they appear, and the growth loops.
12. **Measures.** A funnel and target for each key flow (for example sign-up completion, time to first letting live, time to the first decision, renter completion rates), plus the existing pilot measures: at least 3 hours saved per letting, homes let at least 30% faster, first reply within 5 minutes.
13. **Compliance check.** A table showing how each constraint above is kept in the new design.
14. **New vendors.** Each new vendor, what it's for and its approval status.
15. **Phasing.** What ships first for the pilots, and what follows.
16. **Open questions and decisions** for the founders, each with your recommendation.

Write in plain, direct English. Use short sentences, tables where they help, and no filler. Before you write the PRD, list any questions whose answers would change it materially, then go ahead with your recommended assumption for each, clearly marked.

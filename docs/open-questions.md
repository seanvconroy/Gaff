# Open questions on the PRD

Raised on 31 October 2026 while planning the build. Each question has a proposed answer. Sean delegated technical decisions to the CTO role on 31 October 2026, so each question now records the decision taken. Product or legal items that still need a founder or the solicitor are marked, and are tracked in [launch-checklist.md](launch-checklist.md).

Items marked **Solicitor** also go on the PRD's list for the solicitor before the first pilot letting.

## A. Contradictions that need a decision

### Q1. First reply within 5 minutes (R7) vs approve-before-send (R29)

If every message waits for the operator's approval, the first reply can't reliably go out within 5 minutes.

**Proposal:** the first reply uses fixed wording that the operator approves once during set-up. It says the renter is dealing with an AI assistant, says what happens next, links to the pre-viewing questions and the privacy notice, and explains how to reach a person. Because the wording is fixed, it goes out automatically even in approve-before-send mode. Only AI-written answers wait for approval.

**Decision:** Adopted (CTO, 31 October 2026). The first-reply template wording goes to the solicitor with the other fixed templates.

### Q2. Automatic waitlist offers (R14) vs "a person approves who is invited to view" (R11, Principle 1)

Offering a freed viewing place to someone automatically is inviting them to view without a person's approval.

**Proposal:** when the operator approves invitations, they also approve a waitlist, in the same action (for example, the next 10 people in ranked order). Freed places are offered only to people on that approved waitlist, in ranked order, one at a time with a 2-hour hold. Within 4 hours of the viewing, the place goes to everyone left on the waitlist at once, and the first to book gets it.

**Decision:** Adopted (CTO, 31 October 2026).

### Q3. Deleting unsuccessful applicants' data (R26) vs a record the operator can stand over (job 7, R27, the append-only event log)

**Proposal:** the event log never holds personal data. It holds only IDs, dates, criteria, reasons and who decided. On the deletion date, names, contact details, answers and message text are deleted. The timeline keeps records like "Applicant 14: met 3 of 4 criteria, not invited to view, decided by Ann on Tuesday 4 November".

Proposed periods (**Solicitor**): personal details deleted 30 days after the home is let or withdrawn. The anonymous decision record is kept for 12 months, which covers the Equal Status Acts complaint window, then deleted.

Related: R26 (the retention job) is in Slice 3, but Slice 1 already collects renters' contact details and answers. If Slice 1 runs with real renters before Slice 3 is done, I'll build a basic retention job first. The impact assessment (DPIA) also has to be done before the first pilot letting.

**Decision:** Adopted for the build (CTO, 31 October 2026). The periods are configuration (`RETENTION_PERSONAL_DAYS=30`, `RETENTION_RECORD_MONTHS=12`); the solicitor confirms them before launch. A basic retention job ships before the first real renter.

### Q4. Landlord's read-only timeline (R27) vs data minimisation (Principle 6)

Sharing "every message" with the landlord would show them every enquirer's name, contact details and messages.

**Proposal:** the landlord sees the stage, the numbers, every decision, the criteria and the reasons, with renters shown as "Applicant 14". They see no names, contact details or message text. Names appear only from the offer stage (R19), and only for the chosen applicant and backup.

**Decision:** Adopted (CTO, 31 October 2026).

### Q5. When does a "renter profile" exist? (data model vs stage 9 vs Principle 6)

The data model lists a renter-owned profile holding contact details and answers, but stage 9 says the renter chooses at the end whether to keep a Gaff profile.

**Proposal:** during a letting, a renter's details live only in their application to that home. The operator controls that data, and Gaff processes it for them. A Gaff profile owned by the renter is created only if they opt in (Slice 3). Gaff does not link the same renter across operators before that, so duplicates (R6) are merged within one letting only. (**Solicitor**: this matches the open question on Gaff's data protection roles.)

**Decision:** Adopted (CTO, 31 October 2026). Solicitor confirms the data protection roles.

### Q6. "Everyone hears back" vs people who aren't invited to view

The promise and the goals say every applicant gets a final message, but stage 3 only covers people who are invited.

**Proposal:** once the operator approves invitations, everyone who isn't invited or waitlisted gets a holding message: "Thanks for your interest in 12 Ranelagh Road. We've had a lot of interest, so we can't invite everyone to view. We'll let you know by Friday 14 November either way." Their outcome message goes out when the home is let (R21, Slice 2). Both use fixed wording, and neither goes out without the operator's decision.

**Decision:** Adopted (CTO, 31 October 2026).

### Q7. Reusing operator answers (R8) could repeat unlawful statements

If an operator types "no HAP", "no children" or "professionals only", Gaff would reuse it and send it to every renter who asks.

**Proposal:** questions that touch a protected ground get fixed, lawful answers that operators can't change. For example, "Do you accept HAP?" is always answered yes. Before reuse, operator answers are checked for protected-ground wording, and anything flagged is held for the operator to rewrite. (**Solicitor**: review the fixed answers.)

**Decision:** Adopted (CTO, 31 October 2026). Solicitor reviews the fixed answers.

## B. Unclear: proposed defaults

### Q8. The rent check rules (R3)

The PRD doesn't give the decision table: which endings of the last tenancy allow market rent, whether landlord size or new builds matter, and how the 2% or CPI cap is calculated. I tried to read the RTB pages the PRD cites, but this build environment can't reach rtb.ie or dataprotection.ie, and I won't encode legal rules from memory.

**Options:** (a) allow `rtb.ie` and `dataprotection.ie` in the cloud environment's network settings, and I'll build the table from the RTB pages with one test per rule; (b) paste the page text; or (c) Ann or the solicitor gives me the table.

**Also:** should Gaff calculate the capped maximum rent? That needs monthly CSO inflation figures. **Proposal:** Gaff says which rule applies. If the cap applies, the operator records the figure from the RTB's own calculator, and Gaff warns if the advertised rent is above it. (**Solicitor**: confirm the table.)

**Decision:** Gaff says which rule applies; it doesn't calculate the capped figure. The rule table is built from public sources found through web search, cited in the code, and marked for the solicitor to confirm before launch (CTO, 31 October 2026).

### Q9. What each criterion means (R2)

**Proposal:**
- Move-in date: "can move in by [date]".
- Length of stay: "plans to stay at least [N] months".
- Maximum occupants: "up to [N] people". Gaff asks for a number only, never ages or relationships.
- Pets: "no pets" or "pets considered". Assistance dogs never count as pets, because refusing them could breach the disability ground.

The pre-viewing page asks only the questions for criteria the operator has set. (**Solicitor**: review the list.)

**Decision:** Adopted (CTO, 31 October 2026). Solicitor reviews the criteria list.

### Q10. How the ranking works (R10)

**Proposal:** people are ranked by how many criteria they meet, then by when they enquired. People who haven't answered yet come after everyone who has, in enquiry order. Each position shows its reason in words, for example "Meets all 4 criteria. Enquired Tuesday 4 November, 9:12am." Ranking is plain code, not AI, so it's the same for everyone and easy to explain.

**Decision:** Adopted (CTO, 31 October 2026).

### Q11. Matching enquiries to homes (R5, R6)

**Proposal:** during set-up the operator pastes the Daft and MyHome advert links, an addition to R1's list. Enquiries that can't be matched go to a "Which home?" queue. Nothing is dropped.

**Needed:** 3 to 5 real Daft enquiry emails and 3 to 5 MyHome ones, with the personal details changed, so I can build and test the parsers.

**Decision:** Adopted (CTO, 31 October 2026). Parsers are built against synthetic emails modelled on the portals' formats. **Still needed before the first pilot:** real Daft and MyHome samples, with personal details changed, to confirm the parsers.

### Q12. Reminders (R13)

**Proposal:** a confirmation email straight away, an email reminder 24 hours before the viewing, and an email plus SMS 2 hours before. SMS goes only to renters who give a mobile number for it when they book; the number is optional and never pre-filled from the enquiry. Reminders that would fall in the past are skipped.

**Decision:** Adopted (CTO, 31 October 2026).

### Q13. Who approves messages in approve-before-send mode (R29)?

**Proposal:** the operator approves, in Gaff. The mode is on by default for each new organisation, and the organisation's admin switches it off. Gaff staff never approve or send messages on an operator's behalf, which keeps Gaff as software, not a letting agent.

**Decision:** Adopted (CTO, 31 October 2026).

### Q14. Slice 0 and the build order

**Proposal:** build Slice 1 in the PRD's order, starting with R1. **Alternative:** if Slice 0 pilots should run on this code soon, I'd build a short letting set-up first, then the enquiry loop (R5 to R8 and R29), then the rest.

**Decision:** PRD order (CTO, 31 October 2026). The enquiry loop follows letting set-up directly, so a Slice 0 pilot can start as soon as R5 to R9 and R29 are done.

### Q15. Measuring time saved (Goals, R28)

**Proposal:** Gaff counts active minutes per letting while an operator is using Gaff, stopping after 2 idle minutes. It compares that with each pilot's baseline hours and days, which Gaff staff enter from the pilot interviews. Operators are told that their time in Gaff is measured.

**Decision:** Adopted (CTO, 31 October 2026). The organisation's admin enters the baselines in Settings ("Your usual times"), with Gaff staff during the pilot interview, so no staff back office is needed. Minutes are shown as totals per letting, never per person.

### Q16. Sending address and domain (R7)

Many landlords use Gmail or Outlook.com addresses, which no email service can send as.

**Proposal:** until the operator's own domain is verified, messages go from "Ann at Halcyon via Gaff" at a Gaff address. Replies always come back to Gaff, through a reply address for each letting, so nothing is missed.

**Needed before the first pilot:** the domain Gaff will use. The name may change, so development uses a placeholder.

**Decision:** Adopted (CTO, 31 October 2026). Domains are configuration (`APP_URL`, `INBOUND_DOMAIN`, `MAIL_FROM_DOMAIN`). **Still needed before the first pilot:** the domain.

## C. Gaps (no decision needed unless you disagree)

- **Privacy notice.** Renters' details come from Daft, so the first reply must link to a privacy notice (GDPR Article 14). I'll build the page with placeholder wording for the solicitor.
- **Billing.** Pilots are invoiced outside Gaff. No payment service is added to the MVP.

## D. Services that handle personal data

First chosen by the CTO on 31 October 2026: Render (Frankfurt), Claude on Amazon Bedrock with EU routing, Mailgun EU and Sinch EU. **Changed on 1 November 2026 (Q26):** Vercel and Supabase replace Render, and Resend replaces Mailgun for email. Local stand-ins (a development outbox, a fake SMS sender and a fake AI) are used until the accounts exist. The founders create the accounts and sign the DPAs; see [launch-checklist.md](launch-checklist.md).

## C. Slice 2 (stages 5 to 7)

Raised and decided by the CTO on 1 November 2026, while building Slice 2.

### Q17. What the application asks (R16) vs "no protected grounds" (rule 3, Equal Status Acts)

The PRD's stage 5 collects "self-declared employment and income". Asking for income sources in detail (pension, social welfare, HAP) would record things that point to protected grounds: age, disability, family status, housing assistance.

**Decision:** the application asks two things only: how someone mainly earns ("From a job", "Self-employed", "Something else") and the household's take-home income each month. A hint says to include any housing support, such as HAP, so it always counts towards affordability, but nothing records whether someone receives it. Everything else (name, contact details, pre-viewing answers) is reused from the enquiry. No documents at this stage.

### Q18. The default income rule (PRD open decision for the founders)

**Decision (default, for the founders to confirm):** take-home income of at least 2.5 times the rent. An admin can choose 2, 2.5 or 3 times in Settings. It's the same for everyone, shown to renters before they apply, and a renter below it is never turned away automatically: a person decides.

### Q19. The identity check keeps "the name and date of birth" (PRD checks table) vs "never store age" (rule 3)

A date of birth is an age, which the Equal Status Acts protect, and Gaff never stores it.

**Decision:** the identity check keeps only the verified result and the verified name. If RTB registration needs a date of birth in Slice 3, it's collected then, from the tenant only, encrypted, and never shown in any ranking or decision.

### Q20. "On expiry, the backup is offered" (R20) vs "never offers anyone on its own" (rule 1)

**Decision:** like the waiting list (Q2), a person approves it in advance. When the operator sends the offer, they can also approve offering it to the backup if the preferred applicant declines or doesn't answer in time. The landlord approves both people on the same one-page summary. Without that approval, an expired or declined offer goes back to the operator.

### Q21. Telling the chosen applicants which of them is the backup

**Decision:** the preferred applicant and the backup get the same message: the operator would like to check a few things before making an offer. Neither is told their position, so nobody is promised the home before the landlord approves.

### Q22. Lettings without the landlord's email (R19)

**Decision:** if the operator is the landlord (a portfolio landlord letting their own homes), their own offer decision is the approval. If an agency has no email for the landlord, the operator confirms in Gaff that the landlord approved, and that confirmation is recorded with the offer decision.

## D. Slice 3 (stages 8 and 9)

Raised and decided by the CTO on 1 November 2026, while building Slice 3.

### Q23. Signing the tenancy agreement electronically (R22) vs the Electronic Commerce Act 2000

R22 asks for the agreement to be "signed electronically by all parties". Section 10(1)(b) of the Electronic Commerce Act 2000 excludes the law on creating interests in real property, including leasehold interests, other than contracts. Practitioners still advise wet-ink signatures for documents that create an interest in land. Whether a residential tenancy agreement is caught is a question for the solicitor.

**Decision:** Gaff supports both routes, so either answer works without a rebuild.
- **Electronically:** the tenant signs on their phone (typed name and consent, against a fingerprint of the exact text they read), and the operator signs after them for the landlord. The operator's signature is a person's decision (`sign_agreement`).
- **On paper:** the operator prints the same agreement, both sides sign by hand, and the operator records it in Gaff (also a `sign_agreement` decision).

Gaff's own simple electronic signature is used, not an e-signature service, so no new provider handles personal data. A provider (Yousign, Dropbox Sign, DocuSign) can be added behind the same step later if the solicitor wants an advanced signature. **Solicitor:** confirm electronic signing, and review the standard agreement wording.

### Q24. RTB registration details (R24) vs "never store age" (rule 3)

The RTB asks for each adult tenant's name, date of birth and contact details, and their PPS number if the landlord has it. Its guidance says landlords don't have to give the PPSN or date of birth to complete registration.

**Decision:** Gaff never collects a date of birth (rule 3). It asks the tenant for their PPSN as optional ("the RTB recommends it"), seals it, shows it only in the RTB pack, and deletes it once the operator records the registration. The pack shows the registration deadline: one month from the tenancy's start.

## E. Hosting, vendors and renter profiles

Raised by Sean and decided on 1 November 2026, after a review of which rules the law requires and which were choices.

### Q25. Deleting applicants' data (R26) vs the renter's own profile (PRD Principle 6, stage 9)

The retention job clears an applicant's personal details 30 days after the letting closes. The PRD also wants renters to keep a Gaff profile they can reuse for their next home.

**Decision (Sean and the CTO):** these are two copies, kept for two different reasons.

- **The operator's copy** is an application to one letting. It exists for that letting. It's cleared on schedule, as now, because GDPR's storage limitation requires it. The anonymous decision record is kept for 12 months (Q3).
- **The renter's profile** exists because the renter asked for it.
  - It's one tick box, "Keep my details for next time", when they apply and again when a letting ends for them.
  - It holds their contact details, their answers and any verified results they chose to keep.
  - It's reused when they apply for their next home through Gaff.
  - It's deleted when they ask, or after 2 years without use.
- **Optional:** "Tell me about similar homes" lets a renter opt in to hear from that operator again.
- **For profiles, Gaff is the controller** (it decides what's kept), so the privacy notice and the DPIA cover them.

Not built yet. Profiles come as their own slice after the founder's end-to-end test, and nothing built so far blocks them.

### Q26. "EU only" (rule 10) vs the founders' preferred tools

The PRD asks for data hosted in the EU, and the build turned that into "EU only". GDPR doesn't require EU hosting. A transfer to a US provider is lawful under the EU–US Data Privacy Framework or standard contractual clauses, with a signed DPA and the provider named in the privacy notice. Sean already uses and trusts Vercel, Supabase, Resend and Stripe.

**Decision (Sean, on the CTO's advice):** approved vendors only.
- Each uses its EU region wherever it has one, with a signed DPA and a lawful transfer basis.
- **Approved:**
  - Vercel (functions in Dublin), on Pro before real data (Hobby is for non-commercial use);
  - Supabase (Ireland);
  - Resend (email);
  - Claude on Amazon Bedrock (EU);
  - Sinch (EU);
  - Mailgun (EU), as an alternative;
  - later, Stripe, only to charge operators.
- Render is dropped. See [ADR-0014](adr/0014-vercel-supabase-approved-vendors.md).

**What stays, because the law requires it:**
- deletion on schedule (GDPR storage limitation);
- no protected grounds (Equal Status Acts);
- a person makes every decision (GDPR Article 22);
- the AI disclosure (EU AI Act Article 50);
- the caps on the deposit and advance rent;
- Gaff never holding money.

## F. The UX redesign and the two-sided MVP

Decided by Sean on 14 November 2026, in answer to the UX redesign PRD ([ux-redesign/](ux-redesign/README.md)). Where Sean left the choice to the CTO role, the entry says "delegated". Items a solicitor reviews before launch are marked **Solicitor**; none of them holds up the build.

### Q27. What the MVP covers (the PRD's "Out of scope" list vs a product for both sides)

**Decision (Sean):** the MVP is a full two-sided product.
- **Letting side:** agencies, landlords with several homes, and private landlords with one home.
- **Renter side:** search homes let through Gaff, ask to view inside Gaff, and keep a profile.
- Operators can still advertise on Daft and MyHome. Those enquiries arrive by forwarding, as now.
- The sales effort stays on the letting side.
- The PRD's out-of-scope list loses "A Gaff search site or marketplace for renters". Still out: posting adverts to Daft or MyHome, native apps, answering phone calls, holding money.

### Q28. One person, one profile

**Decision (Sean):** one person has one profile and can hold several roles: agent in an agency, private landlord, renter. An agent can look for a home, or let one of their own, on the same profile.

### Q29. Name, wordmark and colour

**Decision (Sean):** the name is Gaff and the domain will be gaff.ie. The wordmark stays as it is: the two letters "f" read as a key. Colour stays neutral with an off-blue, refined from today's. **Delegated:** the accent is a cleaner Atlantic blue (`#3a5fa8` to start) on a white ground with cool greys. Sean will revisit it once it's on real screens.

### Q30. Sign-in

**Decision (Sean):** Google, Apple, or a six-digit code by email, with a passkey offered afterwards. Google and Apple are approved for sign-in only. Both are named in the privacy notice. This replaces the email link in ADR-0013 for people with accounts; private links for renters, owners and referees stay.

### Q31. Importing an advert

**Decision (Sean):** Gaff doesn't fetch pages from Daft or MyHome, because their terms don't allow it. Adding a letting is made as easy as it can be without that: paste the advert's text, upload it, describe the home, start from an enquiry, or let a home again.

### Q32. Confirming an agency

The PSRA register is public, so picking an agency from it proves nothing about the person. What Gaff confirms is one thing: that the person who claimed the agency works there. Without it, anyone could message renters in an agency's name and put their own bank account on a deposit request.

**Decision (Sean):** keep it simple. Pilot agencies are invited by a founder, and the invitation is the confirmation. An agency that signs up by itself is confirmed once by a founder, in one press, before its first home goes live. Every later member is vouched for by an admin's invite.

### Q33. Price during the pilot

**Decision (Sean):** free. There is no billing in the product. Pricing and billing are defined later, with the sales effort.

### Q34. One design for phone, desktop and a future app

**Decision (Sean):** no native app yet, but one is wanted later. There is one design: the same flows, steps and components on a phone, a desktop and a future app. Screens are designed at phone width first and given more room on a desktop.

### Q35. A verified identity that's reused (adds to Q19 and Q25)

**Decision (Sean, detail delegated):**
- A person verifies their identity once. The result is kept on their profile and reused in every role.
- It has no fixed expiry. It lasts while the profile does: until the person deletes it, or after 2 years without use (Q25). A person whose name has changed can do it again.
- Gaff keeps the result, the verified name and the date. It keeps no image, document number, document type, issuing country or date of birth (Q19).
- The check happens the first time a step needs it: when a renter is the chosen applicant or the backup, or when a private landlord puts their first home live (Q47). Renters are never invited to verify before they're chosen.
- An operator sees it only at the checks stage, for a renter they've chosen, and only when the renter says yes that time. Nobody can see who is verified before choosing.
- A confirmed income is kept for 3 months, because incomes change. References are never reused: the referee was told who would see their answers.

**Solicitor:** the consent wording.

### Q36. Matching and fit (the redesign's first open question)

**Decision (delegated, on Sean's steer: objective, never subjective):**
- Gaff shows whether a person meets what was asked, as a count with the detail ("Meets 3 of 4"). It never recommends, scores or ranks a person by anything else.
- What an operator can ask stays the fixed four: move-in date, length of stay, most people, pets. One house rule is added, "No smoking indoors", as a term of the tenancy that isn't used in ranking.
- Gaff writes the "Letting details" line renters see, from those four. Nobody can type who a home would suit.
- A renter sees their answers beside the letting details, without judgement, and is never stopped.
- An operator can ask Gaff about who's enquired in plain words. The answer is always a filter on the four answers.

**Solicitor:** reviews this with the criteria list (Q9).

### Q37. Conversational AI

**Decision (Sean):** not for account set-up. Use it where loose words become structure: adding a letting, a renter saying what they're looking for, and an operator asking who fits.

### Q38. Agents' own PSRA licences

**Decision (Sean):** not checked for the pilots. Left open to come back to. **Solicitor.**

### Q39. Gaff's copy of the PSRA register

**Decision (delegated):** Gaff keeps the entries for businesses licensed to let, because that's all the lookup needs, refreshes them weekly, and credits the PSRA as its re-use terms ask. It's added to the DPIA.

### Q40. Address lookup provider

**Decision (delegated):** Autoaddress, an Irish provider licensed for Eircode data. Before real addresses go through it, the founders sign its DPA and confirm where it's hosted ([launch-checklist.md](launch-checklist.md)).

### Q41. Comparable rents (R4)

**Decision (delegated):** the rent check stays before a home goes live. The three comparable rents are needed before the offer, not before go-live. If the RTB's Rent Register can be read by software within its terms, Gaff finds them and the operator confirms. If not, the operator types three, with the area and type filled in. Finding out is the first task of that work package.

### Q42. An owner declines a tenant

**Decision (delegated):** the owner's page takes no written reason, and the agent's screen gets no extra warning line. The agent is told at once and talks to the owner.

### Q43. A phone number for renters

**Decision (Sean):** as on Daft and Rightmove. The main action is to ask to view through Gaff. A phone number is there for anyone who'd rather call.

### Q44. Who in an agency sees which lettings

**Decision (Sean):** every member sees every letting, for now.

### Q45. Gaff's brand on an agency's pages

**Decision (Sean):** Gaff isn't white-label. Renter pages carry Gaff's brand with the agency's name. Gaff never prompts an agency's owners or a referee to use Gaff themselves.

### Q46. Disclaimers

**Decision (Sean):** no line of caution or legal comfort is shown unless the law needs it at that moment or it stops a real mistake. Everything else sits in the terms or behind one "How this works" link. The line about only adding photos you may use is removed.

### Q47. Private landlords verify their identity before their first home goes live

Gaff now shows homes to the public and shows renters where to pay a deposit. A private landlord has no licence to check.

**Decision (CTO; confirmed by Sean on 19 November 2026, see Q52):** a private landlord verifies their identity once, at the go-live step of their first home. It takes about two minutes and is never asked again (Q35). Renters see "Identity verified" beside the landlord's first name. Agencies are confirmed through their licence (Q32) and don't do this.

### Q48. The identity check provider

**Replaced on 19 November 2026 by Q51: Stripe Identity, which Sean had already chosen on 8 November.** The recommendation below was written without sight of that decision.

**Recommendation (CTO, for the founders to confirm):** Veriff, an EU company with self-serve pricing. Before real checks run, the founders confirm in writing that data stays in the EU and sign its DPA. Until then the build uses the stand-in provider, as now.

### OQ-2. Can software read the RTB's Rent Register? (UX-LP-14, Q41)

**Status: unverified.** Checked on 17 November 2026 from the build environment. This environment can't reach `rtb.ie` or `data.gov.ie` (both fail to resolve), so neither site's own pages were read. What follows comes from web search results only, and needs a person to confirm on the sites themselves.

**What was found:**

- **No official API.** No search result points to an API, a developer page or a data feed for the Rent Register itself. The register is a search page on rtb.ie ([RTB Rent Register](https://rtb.ie/?p=55258)). It holds new and annual registrations from the last 24 months, and the RTB says a rent notice must give three examples from it of recent rents for similar homes.
- **Open data is averages, not homes.** data.gov.ie lists the CSO's "RTB Average Monthly Rent Report" tables ([RIH02](https://data.gov.ie/ga/dataset/rih02-rtb-average-monthly-rent-report), [RIA02](https://data.gov.ie/dataset/ria02-rtb-average-monthly-rent-report/resource/96d0071b-db5e-4a7b-bda9-cebe02be7d97)) under CC BY 4.0, as CSV, XLSX and JSON-stat. They give average rents by area and type, not individual registered tenancies, so they can't supply the three comparable homes a rent notice needs. The RTB's own data hub ([data insights](https://www.rtb.ie/about-rtb/data-insights), [registration statistics](https://www.rtb.ie/data-hub/rtb-private-tenancy-registration-statistics)) publishes counts and averages, also not single tenancies.
- **The site's terms don't allow it.** The RTB's website terms ([rtb-terms-of-use.pdf](https://www.rtb.ie/images/uploads/general/rtb-terms-of-use.pdf), seen only as a search extract and possibly out of date) license use of the website and reserve every right not expressly granted. Nothing found grants automated reading of the register.

**Decision (build):** reading the register by software is not clearly allowed, so Gaff doesn't do it, and never scrapes it. There is no lookup and no `src/ports` interface for one. The operator enters three comparable homes, one per screen, with the area, type and bedrooms filled in from the home, and a button opens the RTB's register in a new tab.

**To verify (founders):** allow `rtb.ie` and `data.gov.ie` in the environment's network settings so the pages can be read directly, or ask the RTB whether it offers, or would license, a feed of register entries. If it does, the lookup is built behind an interface in `src/ports` with a local stand-in, and the operator confirms the three it suggests.

### Q49. A map beside the search results (OQ-7, UX-SR-8)

**Replaced on 19 November 2026 by Q51: the search map is on Google Maps, which Sean approved on 8 November, and it is being brought across.** The answer below was written without sight of that decision.

**Answer (build, WP-21): not practical yet. Search ships with the list alone, and the list is complete without a map.** The "Map" button is left off the screen rather than shown doing nothing.

Why, in this package:
- **A renderer is a new dependency.** Showing a map someone can pan and zoom needs a map library (MapLibre GL JS is the natural one: open source, and it fetches only what Gaff points it at). The build rules allow no new dependency without approval, and a hand-written renderer isn't a sensible thing to build.
- **The data couldn't be fetched here.** OpenStreetMap's servers (Geofabrik's extracts, Overpass) are blocked from the build environment, so there was no Irish extract to turn into tiles.
- **Homes have no coordinates.** A letting holds an address and an Eircode, not a point. Pins need a point for each home: from Autoaddress's Eircode lookup at "Add a letting" once its DPA is signed (Q40), or a rough one from the place's centre.

What it would take, all inside the approved vendors and with no visitor's request leaving Gaff:
1. Approve MapLibre GL JS as a dependency (no vendor: it calls nothing on its own).
2. Build vector tiles for Ireland from Geofabrik's Ireland and Northern Ireland extract (about 300 MB) with an offline tool such as Planetiler, as one PMTiles file (roughly 0.5 to 1 GB to zoom 14), plus the style, fonts and icons the map draws with.
3. Keep that file in Supabase Storage (Ireland) and serve it through Gaff's own address (`/tiles/…`, with range requests), so the page's content policy stays `'self'`. Vercel's function and static file limits rule out serving it from the deployment itself.
4. A point for each home, stored with the letting (see above), and refreshing the tiles every few months by a job.
5. Credit "© OpenStreetMap contributors" on the map. The ODbL's share-alike applies to the database, not to the pictures of the map.

Gaff's list of places for "Where" is in the repository (`src/domain/search/places-list.ts`), hand-made for now because of the same blocked download; `scripts/places/build-places.ts` builds the full list from OpenStreetMap when it can reach it.

## G. One project

Found on 19 November 2026: Gaff had two lines of work from the same starting point. The test copy ran one (the marketplace, the providers work, the place index, the map and sign-in: requirements `M`, `P` and `AU`); the redesign was built from the other. Sean's objective: "one live project, with all of the changes we intended to build." The plan and its packages are in [status.md](status.md) under "Going live".

The other line kept its own list of decisions, numbered from Q27 with different questions. Below, "the other line's Q48" means that list, which is on the branch `claude/gallant-darwin-dpy9oz`.

### Q50. Which line carries on?

**Decision (Sean, 19 November 2026):** the redesign is the base. Everything the other line can do that the redesign can't is brought across and fitted to the redesign's screens, account model and rules. Then the test copy switches to it and one branch carries on.

### Q51. Where the two lines disagree

**Decision (Sean, 19 November 2026, on the CTO's recommendation):** Sean's latest explicit decision wins. Where the redesign only had a stopgap, or a recommendation waiting to be confirmed, Sean's earlier decision on the other line wins. So:

- **No passwords.** Q30 (14 November) replaces Sean's request for email and password on 8 November (the other line's Q63).
- **Google Maps for the search map** (the other line's Q58, ADR-0027), replacing Q49 here. Google Maps Platform, the Maps JavaScript API only, is an approved vendor.
- **The place index from OpenStreetMap** (the other line's Q57), replacing the hand-made list.
- **Stripe Identity for ID checks** (the other line's Q48), replacing Q48 here. A photo ID with a live selfie. Before real people use it: Stripe's DPA, the privacy notice, and the solicitor's answer on consent to the selfie (the other line's Q45).
- **The Claude API on the test copy and in development; Claude on Bedrock in the EU in production** (the other line's Q37).
- **Chosen renters show work and income with documents, not open banking** (the other line's Q49). Not built on either line yet.
- **Agents' own PSRA licences aren't checked for the pilots** (Q38, 14 November), though the other line checked them.
- **A renter is asked once whether Gaff keeps their ID check** (Q35, UX-PF-8). The other line kept it automatically.
- **Renters confirm their mobile by text code before booking a viewing** (the other line's Q60). Listers aren't asked to.
- **Alerts go out as soon as a home is listed, with a daily option** (the other line's M86, M87), replacing "one email a day at most" (UX-SR-10).
- **Kept as the redesign has them:** one photo and a BER to publish; the short list of filters; a let home's page comes down after 30 days; a home's web address is a random reference.

### Q52. Who proves who they are before listing?

On 8 November Sean decided on one standard with no opt-outs: everyone who lists, agents included, does the photo ID and selfie check (the other line's Q60). The redesign checks private landlords only and confirms agencies through their licence (Q32, Q47).

**Decision (Sean, 19 November 2026):** the redesign's version, for the pilots. Private landlords verify once, at their first go-live. Renters verify when they are chosen. An agency is confirmed through its PSRA licence, and its staff aren't asked for a selfie. See Q55, which this leaves open.

### Q53. What Gaff's own team may do

The redesign held Gaff's team to two things: confirming agencies and hiding reported listings. Stopping scams, and the EU's rules for marketplaces (the Digital Services Act), need more.

**Decision (Sean, 19 November 2026):** Gaff's team may also review a listing that is held as suspicious, and handle a report as a case, with a statement of reasons and an appeal. They still never open a letting, read a renter, send a message or make a decision about a person. The tests that hold those limits stay.

### Q54. Erasing the test copy when it switches

**Decision (Sean, 19 November 2026):** yes. Everything testers created on the test copy is erased at the switch. The made-up homes are created again by the build.

### Q55. How does Gaff know someone belongs to an agency, and is who they say they are? (**Open**)

Raised by Sean on 19 November 2026, with Q52. Today an agency is found on the PSRA register and confirmed by Gaff's team, and colleagues join by an invitation to their email address. Nothing shows that the person who set the agency up works there, or that a person is who they say they are.

**Banked, to come back to.** Things to weigh when it is picked up: an ID check for whoever sets an agency up or for every member (the other line's Q60); matching a verified name to the licence holder or to an agent's own licence (the other line's P24, and Q38 here); a letter or a call to the agency's registered address or number; joining by the agency's email domain (UX-AG-14); and what an agency will put up with during a pilot.

### Q56. Loose ends from the place index (**Open**)

Found while bringing the place index across (BA-2, 19 November 2026). None holds up the build.

- **A copy of the index for anyone who asks.** OpenStreetMap's licence asks Gaff to offer its place index to anyone who asks for it. `/map-and-place-data` credits the data; how someone asks for a copy isn't said yet (Help is still short). **Solicitor**, with the other licence terms.
- **What a renter types, in the request log.** The place search sends what is typed to Gaff's own server as part of a web address, so it may appear in Vercel's request logs. It holds no name or contact details, and the count of misses already drops anything with digits. To check before launch.
- **Recent searches** are kept in the browser tab only, for everyone, because searching isn't recorded against a person (UX-SR-11). The other line kept them on the server for signed-in renters.


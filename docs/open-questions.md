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

## F. The marketplace

Raised on 7 November 2026 with the [marketplace PRD](marketplace/prd.md) and [technical specification](marketplace/tech-spec.md). Sean took Q27 to Q30. Q31 to Q36 are open, with proposals.

### Q27. When does the marketplace go live?

The business plan puts the marketplace third (the tool, then renters, then the marketplace), because Irish challenger portals that went after listings first closed, sold to Daft's owner or stayed small.

**Decision (Sean, 7 November 2026):** everything at once. Listings, search and renter profiles open together as soon as they're built, and Gaff competes for renters from day one. The business plan needs updating to match. The CTO recommends a letter beta for 3 to 4 weeks before the public launch, so renters find homes on day one; it doesn't gate the launch. Confirmed by Sean on 7 November 2026, when he approved the build.

### Q28. Which kinds of rental?

**Decision (Sean, 7 November 2026):** whole homes let on a tenancy, including homes in developments and build-to-rent. No room shares, student accommodation, short lets, commercial or parking.

### Q29. How are letters checked before their homes go live?

**Decision (Sean, 7 November 2026):** agencies and each of their agents are matched against the PSRA public register. Private landlords pass a document-and-selfie ID check before their first home goes live. Gaff keeps only the result, the verified name and the date (Q19). **Stripe Identity approved by Sean on 7 November 2026** for this use only; its DPA terms and the privacy notice are on the [launch checklist](launch-checklist.md).

### Q30. Can a letter pay to rank higher?

**Decision (Sean, 7 November 2026):** never. Listings are free, and results are ordered by fit and freshness only. Revenue comes from the letting workflow and partner services. A compliance test fails if ranking ever takes a payment input.

### Q31. The budget to bring renters in

Launching everything at once (Q27) means Gaff has to bring renters in from day one.

**Proposal:** set a launch budget and a target cost per active renter, and review them weekly with the liquidity numbers.

**Decision:** open (founders).

### Q32. Is the workflow free during launch?

Every Gaff enquiry starts the workflow, so a free listing comes with it.

**Proposal:** the workflow is free for every letter until a date the founders set, then priced as in the business plan (per letting, or a monthly plan for landlords with many homes).

**Decision:** open (founders).

### Q33. Listing defaults

**Proposal:** at least 3 photos to publish. Letters confirm a home is still available every 14 days, and the listing is paused if they don't answer within 3 days.

**Decision:** open (founders). The build uses these as configuration.

### Q34. Partner services for renters

**Proposal:** none at launch. Later, only services a renter chooses for themselves, such as utilities or insurance, that never cost anything to secure a home and never change their chances. That needs the solicitor's view.

**Decision:** open (founders).

### Q35. "Ready to move": renters verifying their identity in advance

**Proposal:** later. A renter could verify their identity once, at Gaff's cost, with the result shared only if they become the preferred applicant or backup. It needs the solicitor's view on staged data first.

**Decision:** open (founders, then the solicitor).

### Q36. Questions for the solicitor before launch (**Solicitor**)

- Liability for publishing ads under section 12 of the Equal Status Acts, after the WRC's 2019 Daft decision, and whether blocking checks and review are enough.
- Which Digital Services Act duties apply while Gaff is a micro or small enterprise, and which apply as it grows.
- Data protection roles: controller for renter accounts, profiles, alerts and checks on letters; processor for letters' copies. The lawful bases, and the DPIA.
- The wording of check badges and "No other fees".
- Saying on every listing that housing supports such as HAP are accepted.
- Using the PSRA register to check licences, and what to do when it doesn't match.
- Whether handling enquiries for private landlords' listings changes the PSRA licensing question in the PRD.
- Terms for private landlords, who may be consumers.
- Retention for reports: proposed 6 months after a case closes.
- The BER display against SEAI's current guidelines.

## G. Replacing the stand-ins

Raised on 8 November 2026 with the [providers PRD](providers/prd.md) and [technical specification](providers/tech-spec.md). Sean took Q37 to Q41 the same day. Q42 to Q47 are open, with proposals.

### Q37. Where does the AI run?

The Claude API offers only global or US inference and stores data at rest in the US. Claude in Amazon Bedrock runs Claude Opus 5.5 in Dublin (`eu-west-1`).

**Decision (Sean, 8 November 2026):** the test copy and development use the Claude API, with the founders' credits, on made-up data and the founders' own test messages. Production uses Claude on Bedrock in Dublin. Real renters' data never reaches the Claude API. See [ADR-0025](adr/0025-ai-provider-and-tasks.md).

### Q38. How are chosen renters' identities checked?

**Decision (Sean, 8 November 2026):** Stripe Identity (a document and a selfie), or the renter shows an original photo ID to the letter in person, and the letter records it. This extends Stripe Identity's approval (Q29) from landlords to renters, subject to Q44. Gaff keeps only the result, the verified name, whether it matches and the date (Q19). See [ADR-0026](adr/0026-checking-chosen-renters.md).

### Q39. Which open banking provider?

Plaid supports Ireland for transactions, but its income product isn't offered in Ireland yet, it stores European data in the US, and its EU plans need a minimum commitment. Tink's Income Check lists Ireland and processes in the EU. TrueLayer is authorised by the Central Bank of Ireland and keeps data in Ireland and the UK, but has no income report.

**Decision (Sean, 8 November 2026):** Tink, with TrueLayer as the backup behind the same port. Ask both for quotes and confirmed Irish bank lists. Revisit Plaid if its income product reaches Ireland.

### Q40. Can renters prove income without connecting a bank?

**Decision (Sean, 8 November 2026):** yes, by uploading recent payslips (or an employer's letter) with the PPS number covered. Claude reads the figures, the renter confirms them, and the letter can open the payslips until they're deleted, 30 days after the result at the latest.

### Q41. Which AI tasks come in this phase?

**Decision (Sean, 8 November 2026):** answers to renters' questions (R8, already built), drafted listing descriptions (M45) and the unfair-wording check (ADR-0023), plus reading payslips (Q40). Holding letters' messages that ask for money before a viewing (M28) waits.

### Q42. Income checks and housing assistance (**Solicitor**)

HAP is paid to the landlord, so it never shows in a renter's bank account, and a bank figure understates a HAP renter's means. Asking whether someone receives HAP is off limits (rule 3).

**Proposal:** the renter can add any income that isn't in the account or on their payslips, housing support included, as one declared amount, and nothing records what it is (as Q17). Wherever a letter sees income, Gaff says that housing support counts and is paid to landlords directly. The solicitor confirms this is enough under the housing assistance ground.

### Q43. Checking the backup at the same time (**Solicitor**)

The DPC ties ID and financial checks to "those who will be entering into a tenancy".

**Proposal:** keep checking the preferred applicant and the backup together (R18), if the solicitor agrees it's proportionate; otherwise, check the backup only when they're promoted.

### Q44. Do Stripe's terms allow checking renters? (**Sean, Stripe**)

Stripe's service terms appear to forbid using Identity "as a factor in determining any person's eligibility for … housing". Stripe's docs say that applies to US credit-reporting activity.

**Proposal:** ask Stripe in writing before renters' Stripe checks go live. Until then, production offers the in-person route only.

### Q45. Is consent to the selfie freely given? (**Solicitor**)

The DPC considers consent rarely freely given between landlord and tenant.

**Proposal:** yes, because the in-person route is equally prominent, needs no reason and carries no penalty.

### Q46. Open banking at offer stage (**Solicitor**)

The workflow PRD asks whether open banking affordability checks at offer stage are proportionate.

**Proposal:** yes, as one of two routes the renter chooses between, with only one figure kept.

### Q47. Renters whose bank can't be connected

Most credit unions offer no open banking connection, and An Post Money's is unconfirmed.

**Proposal:** payslips are an equal route, and not connecting a bank is never a negative.

**Decision:** open (founders).

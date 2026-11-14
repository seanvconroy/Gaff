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

**Changed (Sean, 8 November 2026, Q48):** renters confirm a mobile number with a text code to book a viewing, and that number gets the 2-hour text reminder. A renter without a mobile can still book, and the letter sees that no mobile was confirmed.

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

Raised on 7 November 2026 with the [marketplace PRD](marketplace/prd.md) and [technical specification](marketplace/tech-spec.md). Sean took Q27 to Q30. Q31 to Q36 are open, with proposals. Q57 to Q59 (the search redesign) are in section G.

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

**Superseded (Sean, 8 November 2026) by Q48:** every renter checks their identity once, the first time they're chosen, and it's kept on their profile for every later home.

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
- Google Maps on renter pages: the notice Google's terms require in Gaff's terms, the privacy notice, and whether the map needs a tap before it loads (search redesign PRD S2).
- Using OpenStreetMap data in the place index: keeping OSM rows separate (a collective database) and publishing the build method (ODbL 4.6).

## G. Replacing the stand-ins

Raised on 8 November 2026 with the [providers PRD](providers/prd.md) and [technical specification](providers/tech-spec.md). Sean took Q37 to Q41 the same day. After reviewing the first draft, he also took Q44 and Q48 to Q50, which supersede Q38 and Q40 and change Q39 and Q12. Q46, Q47 and Q51 are closed. Q42, Q43, Q45 and Q52 to Q56 are open, with proposals.

### Q37. Where does the AI run?

The Claude API offers only global or US inference and stores data at rest in the US. Claude in Amazon Bedrock runs Claude Opus 5.5 in Dublin (`eu-west-1`).

**Decision (Sean, 8 November 2026):** the test copy and development use the Claude API, with the founders' credits, on made-up data and the founders' own test messages. Production uses Claude on Bedrock in Dublin. Real renters' data never reaches the Claude API. See [ADR-0025](adr/0025-ai-provider-and-tasks.md).

### Q38. How are chosen renters' identities checked?

**Decision (Sean, 8 November 2026):** Stripe Identity (a document and a selfie), or the renter shows an original photo ID to the letter in person, and the letter records it.

**Superseded the same day by Q48:** renters still check when they're chosen, but only once ever, and it's kept on their Gaff profile. The in-person step stays for chosen renters checked without a selfie, or whose ID can't be checked online.

### Q39. Which open banking provider?

Plaid supports Ireland for transactions, but its income product isn't offered in Ireland yet, it stores European data in the US, and its EU plans need a minimum commitment. Tink's Income Check lists Ireland and processes in the EU. TrueLayer is authorised by the Central Bank of Ireland and keeps data in Ireland and the UK, but has no income report.

**Decision (Sean, 8 November 2026):** Tink, with TrueLayer as the backup behind the same port. Revisit Plaid if its income product reaches Ireland.

**Changed the same day (Q49):** no open banking at launch. Tink stays approved for a later, optional "Confirm with your bank" (Q56).

### Q40. Can renters prove income without connecting a bank?

**Decision (Sean, 8 November 2026):** yes, by uploading recent payslips (or an employer's letter) with the PPS number covered.

**Superseded the same day by Q49 and Q50:** payslips are one of the documents asked for, read without an income estimate, and the PPS number may stay showing.

### Q41. Which AI tasks come in this phase?

**Decision (Sean, 8 November 2026):** answers to renters' questions (R8, already built), drafted listing descriptions (M45) and the unfair-wording check (ADR-0023), plus reading documents (Q49). Holding letters' messages that ask for money before a viewing (M28) waits.

### Q42. HAP and affordability (**Solicitor, founders**)

**HAP, in plain words.** The Housing Assistance Payment is how councils help people on lower incomes rent a home privately. The renter finds the home, and the council pays the rent to the landlord directly, every month. The renter pays the council a weekly contribution based on their income, usually far less than the rent.

**Why it matters for Gaff:**
- The council's part never passes through the renter's hands, so it isn't on their payslips or in their bank account. Their documents make them look less able to pay than they are.
- An income rule such as "take-home pay of 2.5 times the rent" (Q18) therefore fails most people on HAP, even though the council pays most of the rent, and pays it reliably.
- Refusing someone because they get HAP, rent supplement or any social welfare payment is unlawful (the housing assistance ground in the Equal Status Acts). So is a rule that puts them at a disadvantage without a good reason (indirect discrimination). WRC awards reach the €15,000 maximum.
- Gaff can't ask whether someone gets HAP (rule 3), so it can't simply apply the rule differently for them.

**Today:** the application's hint says to include housing support in household income (Q17), and nothing records it. That helps, but it isn't clear what amount someone on HAP should add, and the rule still compares the whole rent with their income.

**The question:** how should a letter judge, fairly, whether someone can afford the home, when the council may pay most of the rent and Gaff can't ask?

**Options:**
1. **Keep today's approach:** housing support counts as income, declared without a label, and letters are reminded that it counts.
2. **Apply the rule only to what the renter pays:** any renter can say "part of my rent will be paid to the landlord directly", without naming the scheme, and the rule compares their income with the rest. Fairer, but close to asking about HAP.
3. **No income rule at all:** letters judge the evidence, as they now do at the checks stage. The simplest and fairest, but letters like a clear rule.

**Proposal:** ask the solicitor which of these is lawful and fair, then decide with the founders before launch. Until then, option 1 stands.

### Q43. Asking the backup at the same time (**Solicitor**)

The DPC ties ID and financial documents to "those who will be entering into a tenancy". This covers the identity check, work and income documents and references. Payslips showing a PPS number would reach the letter for both renters.

**Proposal:** keep asking both together (R18), which saves days if the preferred applicant drops out, if the solicitor agrees it's proportionate. Otherwise, ask the backup only when they're promoted.

### Q44. Do Stripe's terms allow checking renters? (**Sean, Stripe**)

Stripe's service terms appear to forbid using Identity "as a factor in determining any person's eligibility for … housing". Stripe's docs say that applies to US credit-reporting activity.

**Decision (Sean, 8 November 2026):** don't wait for Stripe's confirmation. Gaff checks its own users' identity to prevent fraud, the same way for everyone, and the result never decides who gets a home. Daft uses Stripe Identity in the same way.

### Q45. Is consent to the selfie freely given? (**Solicitor**)

The DPC considers consent rarely freely given between landlord and tenant, and checking identity is part of being offered a home.

**Proposal:** yes. Gaff asks, not the letter, for the person's own profile. Checking without a selfie is equally prominent, needs no reason and carries no penalty. The check itself rests on Gaff's legitimate interest in preventing fraud, so only the selfie relies on consent.

**Reopened (8 November 2026) by Q60:** the selfie is now required, with no check without one, so agreeing to it is a condition of being offered a home through Gaff. Is explicit consent still valid, or is another basis needed? With Q61.

### Q46. Open banking at offer stage (**Solicitor**)

**Closed (8 November 2026):** there's no open banking at launch (Q49). The question returns with "Confirm with your bank" (Q56).

### Q47. Renters whose bank can't be connected

**Closed (8 November 2026):** nobody needs to connect a bank (Q49).

### Q48. Who checks their identity, and when?

**Decision (Sean, 8 November 2026, revised the same day on the CTO's recommendation):** everyone, once, with Stripe Identity, kept on their Gaff profile and reused for every later home and every workspace.
- **Renters** check the first time a letter chooses them as the preferred applicant or the backup, wherever they enquired (Gaff, Daft or MyHome), on one page with their documents and referees. Sean first chose "before their first enquiry". He moved it because that's when identity matters, because a renter could skip an earlier check by enquiring on Daft, because early requests for ID look like a scam to renters, and because it matches the DPC's guidance and costs far less.
- **Before a renter is chosen,** they confirm their email with a code to enquire, and their mobile with a text code to book a viewing (changing Q12).
- **Letters** (private landlords and agents) check before their first listing goes live.
- A renter's result reaches only the letters who choose them, and ranking never reads it.
- Checking without a selfie is an equal choice. A chosen renter checked that way, or whose ID can't be checked online, shows their ID to the letter in person. A letter checked without a selfie has their first listing reviewed by a person at Gaff.
- Supersedes Q38, Q35 ("Ready to move") and M14. Changes rule 2 (identity kept on the profile for next time) and rule 10 (Stripe Identity for everyone). See [ADR-0026](adr/0026-identity-and-documents.md).
- Cost: about €1.25 per person, once; at most about €2.50 a letting for renters.

**Revised (Sean, 8 November 2026) by Q60:** the selfie is required, with no other ways through. Letters verify before their first letting goes live, including a letting that takes enquiries from Daft and MyHome. Renters' timing is unchanged, and banked to come back to (Q61).

### Q49. How do chosen renters show their work and income?

**Decision (Sean, 8 November 2026, on the CTO's recommendation):**
- the documents Irish letters already ask for, chosen by how the renter earns: payslips (or a contract for a new job) and an employer's reference or letter; a Revenue Notice of Assessment or an accountant's letter; or statements of other income;
- no bank statements, apart from a savings statement showing only the balance, for someone living on savings;
- references from their last landlord, or a character reference for someone who hasn't rented before or is new to Ireland, and from their employer if they have one;
- Claude reads each one, and Gaff checks it's the kind asked for, recent, and in the verified name. The renter confirms and shares everything, identity included, in one step, and can keep the documents and referees' details for their next application;
- statements of other income never reach letters: Gaff tells the letter only the amount, how often and the date;
- no income estimate, score or ratio: the letter reads the evidence and decides;
- no open banking at launch, and "Confirm with your bank" later (Q56).

### Q50. Payslips that show a PPS number

**Decision (Sean, 8 November 2026):** accepted as they are. Gaff suggests covering the number, never reads it out or records it, and deletes the document on schedule. Rule 2 says so.

### Q51. Checking every renter's identity before their first enquiry (**Solicitor**)

**Closed (8 November 2026):** renters now check their identity when they're chosen (Q48), which is what the DPC's guidance expects.

### Q52. Statements of other income (**Solicitor**)

Pension, social welfare and maintenance statements can show age, disability, family status or the housing assistance ground.

**Proposal:** Gaff reads them, tells the letter only the amount, how often and the date, and deletes them once the renter confirms. Gaff is the controller for that reading.

### Q53. Can a letter ask for more than the standard set?

For example, bank statements or two years of accounts.

**Proposal:** no. The same set on every letting, reviewed by the solicitor, just as criteria come from a fixed list (rule 3).

**Decision:** open (founders).

### Q54. Joint tenants

**Proposal:** soon after launch, each adult who'll sign the agreement joins the application with their own profile, identity and documents. Until then, the lead renter's documents and the household income they gave.

**Decision:** open (founders).

### Q55. A letter whose ID can't be checked online

**Proposal:** a short video call with a person at Gaff, who sees the original document, using a tool the founders approve (rule 10). Only the result is recorded.

**Decision (Sean, 8 November 2026, Q60):** no other way for now: Gaff relies on Stripe Identity. Someone Stripe can't verify after three tries can ask a person at Gaff for more tries.

### Q56. When to build "Confirm with your bank"

An optional, read-only check through Tink that the pay on a renter's payslips arrives in their account, keeping only the outcome. Forged payslips are the most common fraud in UK tenant referencing.

**Proposal:** when a forged document is found on Gaff, or letters ask for it.

**Decision:** open (founders).

## H. The renter search redesign

Raised on 8 November 2026, after Sean found that typing "Kinsale" or "Highfield Road" suggested nothing. The [search redesign PRD](marketplace/search-redesign/prd.md) and [technical specification](marketplace/search-redesign/tech-spec.md) follow from these decisions; [ADR-0027](adr/0027-places-index-on-google-maps.md) records Q57 and Q58.

### Q57. What suggests places as renters type?

Airbnb uses Google Places; Zillow, Rightmove and Daft use their own index of places. Google's EEA terms, which apply because Gaff is billed in Ireland, forbid showing Places content "on, next to, or ... visually associated with any map, including a Google Map", except in Google's own Places UI Kit widget.

**Decision (Sean, 8 November 2026):** Gaff's own index of every county, town, village, area, Dublin district, Eircode area, townland, street and landmark in Ireland, built from open data, in Gaff's own dropdown (Zillow's model). Sean first chose Google, like Airbnb, then chose this once the EEA terms were clear.

### Q58. Which map?

**Decision (Sean, 8 November 2026):** Google Maps, through the Maps JavaScript API, showing only Gaff's own content. **Google Maps Platform approved by Sean on 8 November 2026** for that use only (rule 10). Google acts as an independent controller under its Controller-Controller Data Protection Terms and offers no EU region; transfers rely on the EU–US Data Privacy Framework. The privacy notice, Gaff's terms and the DPIA are on the [launch checklist](launch-checklist.md). This replaces the marketplace tech spec's self-hosted MapLibre map.

### Q59. Which layout, and how does it ship?

**Decision (Sean, 8 November 2026):** Zillow's filter bar (Where, Rent, Beds, Move in, Filters, Save search) with Airbnb's polish, and list and map side by side. Everything ships in one release, the map included, behind a flag until the release checks pass.

## I. Profile verification

Raised on 8 November 2026, after Sean reviewed identity once per person (providers milestone 3): "We should have profile verification standards, and stick to them."

### Q60. One verification standard, with no opt-outs

**Decision (Sean, 8 November 2026, on the CTO's recommendation after looking at the market):** every Gaff profile, renter or letter, is verified the same way, once, and kept for good:
- **email**, confirmed with a code;
- **mobile**, confirmed with a text code;
- **identity**: a photo ID and a live selfie, matched by Stripe Identity, so the person who owns the profile is the person on the ID.

**When:**
- **Letters** (landlords and agents) verify before their first letting goes live: a listing on Gaff, or a letting taking enquiries from Daft and MyHome. They can set up before then.
- **Renters** confirm their email to enquire, their mobile to book a viewing, and their identity when a letter chooses them as the preferred applicant or the backup, before an offer.

**No other ways through:** no check without a selfie, no "can't be checked online", no video call (Q55), no letter seeing ID in person, and no first-listing review. Someone Stripe can't verify after three tries can ask a person at Gaff for more tries.

**The market, as found on 8 November 2026:** Airbnb checks hosts before they list and guests before they book (required worldwide since mid-2023, and the ID isn't shown to the other side). Zillow checks landlords before they see applicants' screening reports, and renters when they apply. In the UK, a renter's identity is checked at referencing, after the landlord accepts them, and before the tenancy (Right to Rent); OpenRent's earlier "Verified Tenant" is optional. SpareRoom's check is optional. Daft has added Stripe Identity for some features. Nobody checks renters' identity to enquire. The DPC says to collect only what's needed to arrange a viewing, and has said landlords shouldn't seek photo ID from prospective tenants before a lease is signed.

Sean first asked for renters to verify before their first enquiry, then chose this timing the same day. Replaces P19, P20 and P27, and the choice without a selfie in P18.

### Q61. When should renters verify? (**Founders, solicitor**)

Built as Q60 for now; to come back to once the measures (P58) show how it works.

| | When chosen (built) | Before their first viewing | Before their first enquiry |
| --- | --- | --- | --- |
| Who's verified | The two chosen, before an offer | Everyone who views | Everyone whose enquiry a letter acts on |
| Friction | The least: two a letting, once each | Once invited, when they're keen | The most: every renter, before they can ask anything |
| Daft and MyHome | Asked only once chosen | Asked only once invited | Their enquiries wait for an ID request from Gaff, which can look like a scam |
| Stripe's cost (€1.25 a person, once) | Two a letting at most | Everyone who views | Everyone who enquires |
| The DPC's guidance | Closest: checks for those entering a tenancy | Photo ID before a viewing | Photo ID from everyone who enquires |
| The market | Zillow, UK referencing | Airbnb, by analogy with booking | Nobody |

**For the solicitor:**
- Is a required selfie, with no other way through, valid explicit consent under GDPR Article 9, or is another basis needed (Q45)?
- Gaff checks identity, not the letter, and shares only the result and the verified name. Is that consistent with the DPC's position on photo ID before a lease is signed?
- Does a renter Stripe can't verify, who then can't be offered a home, have a claim under the Equal Status Acts (a document Stripe doesn't read, or a disability)? Is a person granting more tries enough human review under Article 22?

**Decision:** open (founders, with the solicitor's answers).

## J. Sign-in and accounts

Raised from 8 to 14 November 2026, while building sign-in with Google, Apple, passwords, passkeys and codes ([PRD](auth-prd.md), [tech spec](auth-tech-spec.md), [ADR-0028](adr/0028-sign-in-methods.md)). On 13 November Sean asked for it to be built, with the CTO's best judgement on what was open, and for those calls to be noted so the founders can come back to them. They are all here. Each says what was decided, why, and what would change it.

### Q62. Which line is it built on?

The first PRD and spec were written against `claude/gaff-mvp`, the repository's default branch on GitHub. It turned out to be 50 commits behind: the marketplace, renter accounts and team invitations are on `claude/epic-ride-0ha68s`, which is also what the test copy deploys.

**Decision (CTO, 13 November 2026):** built on `claude/epic-ride-0ha68s`, merged into the working branch. The PRD, spec and ADR were then revised to fit the real product.

**For the founders:** make the product line the repository's default branch, so new work starts in the right place. Until then, anything started from the default branch starts from a month-old product.

### Q63. One sign-in for everyone, and passwords after M1 said "No passwords"

M1 says: "Sign in with a one-time code or link sent by email. No passwords." Sean asked for email and password on 8 November, and "operators, then renters". But a renter's account and a letter's are the same account (ADR-0016), so there is no operator-only sign-in to build.

**Decision (CTO, 13 November 2026):**
- One sign-in page for renters, letters and staff, with every way in, passwords included. M1 is amended, and M7 (Google and Apple) is brought forward.
- "Then renters" is honoured where renters start without an account: the enquiry sheet (M76) and the chosen renter's page (P16) still ask for a code and nothing else. A renter never needs a password, and never needs an account for a step on a private link.

**What would change it:** if the founders want renters kept to codes, Google, Apple and passkeys, the password box can be hidden for accounts with no workspace. The first draft planned that (AU30); it was dropped because one account can be both.

### Q64. Google and Apple as ways to sign in (**Founders, solicitor**; rule 10)

M7 said each "needs approval as an identity provider". What they do: confirm who someone is, and pass Gaff a name and an email address. Gaff sends them nothing about lettings, and keeps no tokens and no photo. Each is an independent controller for its own sign-in service, with no EU-only region.

**Decision (CTO, 13 November 2026):** built, and off until approved. The buttons appear only when a provider's keys are set (`GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` and their partners); neither production nor the test copy has them. In development and tests a stand-in page plays both.

**For the founders and the solicitor:** approve each under rule 10 or not; name them in the privacy notice with the basis for the transfer; give Google's and Apple's consent screens links to the privacy notice and terms (Q70).

### Q65. The breached-password check (**Founders**; rule 10)

Passwords seen in data breaches are refused (AU12, and NIST's guidance). The check asks Have I Been Pwned's Pwned Passwords service with the first 5 characters of a SHA-1 hash of the password. The service answers with every breached hash that starts that way, and Gaff looks for the match itself. It receives no email, no account, and nothing that identifies a person or a password. It's a US service.

**Decision (CTO, 13 November 2026):** built behind `PASSWORD_BREACH_CHECK`. Development, tests and the test copy use a stand-in (a short fixed list). Production won't start on the stand-in: it must be set to `pwned_passwords` or `off`. If the service is slow or down, the password is allowed.

**For the founders:** approve it, or run without the check. Recommendation: approve. No personal data leaves Gaff.

### Q66. When may Google or Apple join an account that already exists?

Both providers call an address "verified" if they checked it once, even one they don't run: a Google account can be made with a work address. If Gaff joined on that, someone who once controlled an address, or who made a Google account for someone else's, could walk into their Gaff account.

**Decision (CTO, 13 November 2026):** a provider is taken at its word only for addresses it hosts (Gmail and Google Workspace; iCloud and Hide My Email). For any other address, a new person is asked to use a code the first time, and an existing account is joined only by its owner, signed in, from "How you sign in". This is Google's own guidance for joining accounts.

**What would change it:** if support shows people stuck here (a work address on Microsoft 365 with a Google account is the likely case), the code could be asked for on the spot, in the middle of the Google sign-in, instead of sending the person back to the sign-in page. Sign-in events show how often it happens: `account.sign_in_failed` with the reason `not_joined`.

### Q67. Sign-in events and rule 8's "same transaction"

Rule 8: use cases write an event in the same transaction as the change. Better Auth writes users, sessions and passkeys itself, in its own calls.

**Decision (CTO, 13 November 2026):** sign-in events are written by hooks, just after the library's write, to `platform_events`, with no personal data. If the event's write fails, the sign-in has still happened. This is the one documented exception; team events (invited, joined, role changed, removed) are in the same transaction as their change.

**What would change it:** if these events come to matter as evidence, not only as measures, the library's writes can be wrapped in a transaction Gaff controls.

### Q68. Who owns the Apple Developer account? (**Founders**)

Sign in with Apple needs an Apple Developer account in Gaff's name: enrolling as a company needs a D-U-N-S number and costs $99 a year. Someone must hold it, and its key.

**Decision:** open (founders). Nothing is blocked: Apple stays off until it's set up.

### Q69. Which domain do passkeys belong to? (**Founders**)

A passkey is made for one domain, for good. If Gaff's address changes afterwards (from one subdomain to another, or to a different domain), every passkey made before stops working, and people fall back to a code.

**Decision (CTO, 14 November 2026):** `PASSKEY_RP_ID` defaults to the app's own host. Before the first real passkey, set it to the domain Gaff will keep (for example the main domain, so `app.` and `www.` both work).

**For the founders:** this waits on the domain choice (N2, [launch-checklist.md](launch-checklist.md)). Passkeys made on the test copy belong to the test copy's address and don't carry over.

### Q70. Privacy notice, terms and cookies for people with accounts (**Solicitor**)

- Google's and Apple's consent screens must link to a privacy notice and terms.
- "Create an account" has no line about either, because the documents for account holders don't exist yet.
- The notice should say: Google and Apple can be used to sign in, and what Gaff gets from them (a name and an email); that passwords are checked against known breaches without leaving Gaff in a form anyone could read (Q65); and that sign-in sets only strictly necessary cookies (the session, and three that last minutes while a sign-in is under way).
- The security emails and the invitation are fixed templates, for review with the others.

**Decision:** open (solicitor, with the terms and notice in Q36).

### Q71. Teams: one workspace per person, and what happens to someone who's removed

**Decision (CTO, 13 to 14 November 2026):**
- **One workspace per person**, as before, until AU25 adds a switcher. Someone already on a team is told so when they open another team's invitation.
- **An invitation is for the invited email.** The person signs in as that address, by any method. A second invitation to the same address replaces the first.
- **Removing someone ends their access at once** (every page checks who's on the team), but doesn't sign them out of their own account or email them. The first draft said "signs them out everywhere"; their account is their own, and they may rent with it.
- **Nobody changes their own place on a team.** Another admin does, so an admin can't lock the team out by a slip.

**What would change it:** an email to the person removed ("You've left Halcyon Lettings on Gaff") is easy to add, with the solicitor's wording.

### Q72. What wasn't built, and why

**Decision (CTO, 14 November 2026):**
- **"Last used" on the sign-in page (AU15).** It needs something kept on the device between visits, which isn't strictly necessary, so the cookie rules (the ePrivacy Regulations, and the DPC's guidance) ask for consent. Gaff sets only necessary cookies and has no consent banner. To revisit if one is ever added.
- **A prompt to add a passkey after signing in.** It needs somewhere to remember "not now". Passkeys are added from "How you sign in".
- **Pending invitations on the welcome page.** The emailed link is the way in. Showing them means looking up invitations by email across every workspace, which nothing does today.
- **An email on a new device** (AU22), and two-step verification (AU20): phase 2.

### Q73. Staff passkeys (M5)

**Decision (CTO, 14 November 2026):**
- In production, Gaff's own tools open only on a passkey sign-in from the last 8 hours. On the test copy the rule is off, because the founders' testers are staff there.
- A staff member adds their own passkey, after signing in another way. So the first passkey is only as strong as that sign-in.

**For the founders:** before launch, each staff member adds a passkey while someone who knows them watches, or is given a hardware key. `pnpm staff:add` is still how someone becomes staff.

### Q74. Accounts nobody uses (**Founders, solicitor**)

The first draft deleted accounts with no workspace after 30 days without use. On the real product those are renters' accounts, kept "only while the renter chooses to keep it" (rule 9, Q25), and a renter can delete theirs at any time (M13).

**Decision (CTO, 14 November 2026):** the nightly job deletes only what nobody owns: sign-ups never confirmed within 7 days, ended sessions, used-up codes and lapsed invitations. Confirmed accounts stay until their owner deletes them.

**For the founders and the solicitor:** should an account unused for a long time (2 years was proposed in the first draft) be deleted, after a warning email? It belongs with the retention period for renter profiles (Q25).

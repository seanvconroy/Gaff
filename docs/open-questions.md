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

Chosen by the CTO on 31 October 2026: Render (Frankfurt) for hosting and the database, Claude on Amazon Bedrock with EU routing for the AI, Mailgun EU for email and Sinch EU for SMS. Local stand-ins (a development outbox, a fake SMS sender and a fake AI) are used until the accounts exist. The founders create the accounts and sign the DPAs; see [launch-checklist.md](launch-checklist.md).

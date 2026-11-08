# Replacing the stand-ins: product requirements

Draft for the founders, 8 November 2026, revised the same day after Sean's review · requirements P1 to P60

## Summary

The test copy runs every step of a letting, but the steps that matter most for trust still use stand-ins: the AI, identity checks and proof of income. This document replaces them with real services, adds two AI tasks for letters, and keeps every product rule in `CLAUDE.md`. Three principles shape it: simple, seamless, and trusted by both sides.

- **Trust grows step by step, and nothing is asked before it's needed.** A renter confirms their email to enquire and their mobile to book a viewing. Letters check their identity before their first listing goes live, which stops the commonest rental scam, a fake landlord taking a deposit.
- **Chosen renters do everything on one page.** When a letter chooses them as the preferred applicant or the backup, one page asks for their identity, the documents Irish letters already ask for (such as payslips) and their references. One button shares it all. It takes about five minutes.
- **Identity is checked once per person, with Stripe Identity, and kept on their Gaff profile.** It's reused for every later home and every workspace, so nobody does it twice. Daft has started checking its users with Stripe Identity too.
- **Gaff checks the evidence; the letter decides.** Gaff reads each document and checks it's recent and in the renter's name. It doesn't estimate anyone's income or score them.
- **For letters:** a description drafted from the facts they've entered, a check that catches unfair wording before a listing goes live, and one tidy pack for each chosen renter instead of a pile of email attachments.
- **For Gaff:** the AI runs in the EU in production, every check is logged without personal data, and documents are deleted on schedule.
- **How it's built:** see the [technical specification](tech-spec.md). It builds on the workflow [PRD](../prd.md) (R8, R12, R16, R18) and the [marketplace PRD](../marketplace/prd.md) (M11, M24, M45, M46, M97).
- **Status:** a draft. Sean took the decisions below on 8 November 2026. Before real people use the checks: the solicitor's answers at the end, Stripe's DPA and the privacy notice.

## What changed in this revision

| First draft | Now | Why |
| --- | --- | --- |
| Chosen renters checked their ID for every letting | Chosen renters check once, and it's kept on their profile for every later home. Letters check once too, agents included | Sean: protect both sides from fraud, and never ask twice |
| Renters' Stripe checks waited for Stripe's written confirmation (Q44) | Not waiting | Sean: Gaff uses Stripe to check its own users and prevent fraud, the same way for everyone. Daft uses Stripe Identity in the same way |
| Open banking (Tink) worked out a monthly income figure, shown as a ratio against the letter's rule | No income estimate and no open banking at launch. Renters share the documents letters already ask for, and Gaff checks them | Sean: an income estimate isn't needed. Documents are the Irish norm, and they work for credit union members, whose banks mostly can't be connected |
| A payslip showing a PPS number was deleted, and the renter asked to cover it | Accepted as it is. Gaff suggests covering the number, and never reads it out or records it | Sean: rejecting it is overkill |
| HAP: declared income and a reminder to letters | An open question, explained in plain words (Q42) | Sean asked for it to be banked |
| An optional mobile number for text reminders | A mobile confirmed by text code to book a viewing | So letters know a reachable person is coming, without asking for ID that early |

Earlier the same day, the plan had renters checking their identity before their first enquiry. Sean moved it to when they're first chosen, on the CTO's recommendation (Q48): that's when identity matters, it's one rule for renters from Gaff, Daft and MyHome alike, it matches the DPC's guidance, and it costs far less.

## Decisions that shape this document

| Question | Decision | What it means |
| --- | --- | --- |
| Where does the AI run? (Q37) | Sean: the Claude API on the test copy, with the founders' credits; Claude on Amazon Bedrock in Dublin in production | The same code behind one port. Real renters' data never reaches the Claude API, which only offers global or US processing |
| Which AI tasks come now? (Q41) | Sean: answers to renters (R8, built), drafted listing descriptions (M45) and the unfair-wording check (ADR-0023), plus reading documents | Holding letters' messages that ask for money before a viewing (M28) waits for a later phase |
| Who checks their identity, and when? (Q48) | Sean: everyone, once, with Stripe Identity, kept on their Gaff profile. Renters check the first time a letter chooses them, wherever they enquired. Letters, landlords and agents alike, check before their first listing goes live. Before a renter is chosen, a confirmed email to enquire and a confirmed mobile to book a viewing | Replaces the per-letting check (Q38) and "Ready to move" (Q35, M14). Rule 10 changes: Stripe Identity for everyone |
| Wait for Stripe's written confirmation? (Q44) | Sean: no | Gaff checks its own users, the same way for everyone, and the result never decides who gets a home |
| How do chosen renters show their work and income? (Q49) | Sean, on the CTO's proposal: the documents letters already ask for, chosen by how the renter earns, read and checked by Claude. No income estimate, no score, no bank statements and no open banking at launch | Rule 10 needs no new vendor. "Confirm with your bank" (Tink) is designed as a later option (P60) |
| Payslips showing a PPS number (Q50) | Sean: accepted | Rule 2 changes: documents may show the number, but Gaff collects it only for RTB registration |

## Where we are

| Part | Test copy today | Production today | After this work |
| --- | --- | --- | --- |
| Answers to renters' questions (R8) | A stand-in that matches keywords to facts | Off: the operator answers | Claude, with the same guardrails |
| Listing descriptions (M45) | The letter writes them | The letter writes them | The letter writes them, or Claude drafts one from the facts |
| Unfair wording in listings (ADR-0023) | A word list | A word list | The word list, then Claude for subtler wording |
| Booking a viewing (R12) | An optional mobile for reminders | The same | A mobile confirmed by text code |
| Renters' identity | A test page, for chosen renters | None: the letter arranges it | Stripe Identity, once, the first time they're chosen |
| Letters' identity (M24) | A test page, private landlords only | Stripe Identity for private landlords (built) | Stripe Identity for every letter, landlords and agents, once per person |
| Work and income (R18) | A test page | None: the letter arranges it | Documents, read and checked by Claude |
| References (R18) | Built | Built | Unchanged, plus a character reference for first-time renters |
| Texts | The code is shown on screen; texts go to the outbox | Sinch (approved, not set up) | Unchanged: an account and keys (N3) |
| Receiving email | Not set up | Needs Gaff's own domain | Unchanged: Gaff's domain (N2) |
| Photos | Kept in the database | Supabase Storage | Unchanged: the service key |

The last three rows need accounts and keys, not code, so they're on the [launch checklist](../launch-checklist.md) rather than in this document.

## What Irish letters ask for, and what the regulator allows

Research on 8 November 2026 (sources at the end):

- **What agents ask a chosen renter for:** photo ID, an employer's reference or letter (often with the salary), a previous landlord's reference, and proof they can pay: usually recent payslips, sometimes bank statements. Self-employed people show tax returns or accounts. The PPS number is asked for the RTB registration. Lisney, DNG, Owen Reilly, Sherry FitzGerald and I-RES all publish versions of this list.
- **How it moves:** mostly by email, as attachments or one PDF pack. A few agents use upload portals. Agents phone referees.
- **What the Data Protection Commission allows:** ID and documents showing someone can pay are reasonable, but only from the person being offered the home. In 2023 it found an agent's request for ID, references, two months of bank statements and a PPS number at the first stage excessive. Bank statements with the transactions removed are enough. No PPS number and no photos before the lease.
- **Open banking** is rare in Ireland: one small renter app uses it. In the UK it's common, partly because forged payslips are the most common fraud in tenant referencing there.
- **Daft** has introduced identity checks with Stripe Identity, to build trust between landlords and renters (and buyers and sellers). It asks for explicit consent and receives only the result.
- **Fairness:** refusing someone because they get HAP, rent supplement or any social welfare payment is unlawful (the housing assistance ground). Research for IHREC found agents using "professional references" to screen out people who aren't in work.

So Gaff asks for what letters already ask for, but only at the right stage, in one place, checked, and with nothing that reveals a protected ground.

## How the product rules apply

| Rule | How this work keeps it |
| --- | --- |
| 1. People make every decision | No check rejects anyone or moves an application. Gaff checks the evidence (recent, in the renter's name, the kind asked for) and shows anything a person should look at in `warning`. It never judges whether someone can afford the home: the letter reads the evidence and decides. Someone whose ID can't be checked online carries on, and shows it in person. The AI drafts, reads and flags: it never decides, and its flags only hold things for a person |
| 2. Staged data | Identity, work and income documents and references are asked for only when a renter is chosen as the preferred applicant or the backup, as the DPC's guidance expects. **Amended:** identity is then kept on the renter's profile and reused for their next home, and documents can be kept until they go out of date. The PPS number is collected only for RTB registration. Documents may show it; Gaff never reads it out or records it |
| 3. No protected grounds | From the ID check, Gaff keeps only the name: never the date of birth, nationality, sex or images. Statements of other income (pensions, social welfare, maintenance) can reveal age, disability, family status or the housing assistance ground, which covers any social welfare payment. Gaff reads those itself and tells the letter only the amount, how often and the date. The letter never sees them, and nothing records what kind of income it is |
| 4. Renters never pay | Gaff pays for every identity check, text code, document reading and AI call |
| 5. Gaff never holds money | Nothing here touches money or a bank account |
| 6. AI disclosure | Unchanged. AI-written text is marked as drafted by AI, and figures read from documents are marked as read by AI |
| 7. Grounded AI | Answers still cite facts. Descriptions use only the facts the letter entered. The wording check only adds holds. Document reading returns fields, never prose and never a PPS number. Every input is untrusted, and names and contact details are stripped before anything reaches the model, except documents themselves (P52) |
| 8. Every step logged | Each check, AI call, upload, share, view and deletion is an event, with IDs, codes, numbers and dates only |
| 9. Retention by jobs | Jobs delete documents on schedule, ask Stripe to redact sessions, and delete identity results with the account |
| 10. Approved vendors | **Amended.** Stripe Identity now covers every person on Gaff (Q48). No new vendor is needed at launch. Tink stays approved for the later "Confirm with your bank" option. The Claude API is used only on the test copy |

## The renter's journey

Each step asks only for what it needs, when the reason is obvious:

| Step | What Gaff asks | Why then |
| --- | --- | --- |
| Browse, save homes, set alerts | Nothing to browse; an email address to save or get alerts | Searching should be free and open |
| Enquire | Name, email (confirmed with a code) and the letter's own questions. About a minute | Stops fake enquiries without slowing real ones |
| Book a viewing | A mobile number, confirmed with a text code | The letter knows a real, reachable person is coming, and reminders reach them |
| Apply, after viewing | How they earn and their household's take-home income | The letter compares applicants, as today (R16) |
| Chosen as the preferred applicant or the backup | One page, "A few checks before an offer": identity (once ever), work and income documents, references. About five minutes | This is when identity and income matter, and when the DPC says they may be asked |
| Offer, signing, payment | The PPS number, for the RTB registration only | As built (R24) |

The renter's profile keeps only what saves them time next time: their contact details and answers if they tick "Keep my details" (Q25), their identity check for as long as they have an account, their documents until they go out of date if they choose, and their referees' details. "Who has my details" shows what each letter has, and until when (M12).

## Key journeys

### J1. A renter asks a question

Aoife asks "Is there parking, and when are the bins collected?". Within a minute, Claude drafts two answers from the home's facts, each citing the facts it used. If the letter approves answers before they're sent, the drafts wait in Approvals, marked as drafted by AI. A question the facts don't answer goes to the letter.

### J2. A letter drafts a description

Mary has entered the home's facts: two bedrooms, gas heating, a south-facing balcony, near the Luas. She presses **Draft a description**. A few seconds later, a plain description of the home appears in the editor, marked as drafted by AI. It says nothing the facts don't say, and nothing about who the home would suit. She edits a sentence and publishes.

### J3. Unfair wording is caught

An agent writes "Would suit a quiet professional couple". The word list misses "professional couple" phrased this way, but the wording check flags it as family status and civil status. The listing waits for a person at Gaff, and the agent sees why, with a suggested rewording: "Two bedrooms, suits up to three people". A person at Gaff decides.

### J4. Niamh enquires and books a viewing

Niamh finds a flat in Rathmines and enquires with her name, email and the letter's two questions, confirming her email with a code. Two days later she's invited to view. She picks Thursday at 6pm and confirms her mobile with a text code. Nothing else is asked, and she gets a text reminder two hours before.

### J5. Niamh is chosen, and does her checks

Halcyon Lettings chooses Niamh. Her page, "A few checks before an offer", lists three things, each explained: who sees it and when it's deleted.
- **Her identity**, once ever: a photo of her passport or driving licence and a selfie, about two minutes on her phone. Gaff explains that Stripe compares the selfie with her ID, that this is biometric data, that Stripe deletes it for Gaff after 30 days, and that she can check without a selfie instead. She agrees.
- **Her work and income.** She said she earns from a job, so she's asked for her three most recent payslips. She uploads three PDFs from her payroll app. Gaff reads them in seconds: "Acme Ltd, paid every two weeks, €1,480 take-home, latest payslip 31 October 2026". The name matches her ID. She can leave her PPS number showing, though Gaff suggests covering it.
- **Her references:** her manager's and her last landlord's email addresses.

She checks what Gaff read, ticks **Keep these for my next application**, and presses **Share with Halcyon Lettings**. It takes about five minutes, and Gaff emails both referees straight away. If she's chosen for another home later, her identity is already done and her referees are filled in. She only adds newer payslips.

### J6. Tomás checks without a selfie; Amal's ID can't be checked online

Tomás would rather not take a selfie. He chooses **Check without a selfie**, and Stripe checks his passport alone. The letter is asked to see his passport when they meet, before the agreement is sent, and to record it in Gaff.

Amal has a Temporary Residence Certificate, which Stripe can't check. She chooses **My ID can't be checked online** and carries on with her other checks. The letter sees her ID in person. Nobody is shut out because of the document they hold.

### J7. Seán is self-employed; Aoife's income is a pension

Seán uploads his latest Notice of Assessment from Revenue. Gaff reads the tax year and his income for it.

Aoife's income is a pension and another regular payment. She uploads a statement for each. Gaff reads the amounts and dates, and the letter sees "Regular income of €1,650 a month, from two statements in Aoife's name dated October 2026, read by Gaff". The letter never sees the statements, or what kind of income they show. Gaff deletes them once Aoife confirms what it read.

### J8. Letters check theirs before their first listing

Mary, a private landlord, checks her identity the same way before her first listing goes live. So does Ciara, an agent at Halcyon Lettings, and the person at Gaff who checks Ciara's PSRA licence also checks that the name on it matches her ID. If Mary later joins an agency, or rents a home herself, she doesn't check again.

### J9. The letter reviews and decides

On Applications, the letter sees each chosen renter's pack, in words:
- their identity, and when and how it was checked;
- their work, from the employer's reference;
- what their documents show, next to the household income they gave on their application;
- their references, as they arrive;
- anything a person should look at, in `warning`, such as a name that differs from the ID or a payslip older than six weeks.

They can open payslips and employer documents while they're kept. Nothing is a score or a refusal. The letter makes the offer, or chooses someone else.

## Requirements

Priority: **Must** for launch, **Should** soon after, **Later** when the founders choose.

### A. The AI service

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | The AI runs on the Claude API on the test copy and in development, and on Claude on Amazon Bedrock in Dublin (`eu-west-1`, in-region) in production. Production refuses any other AI provider (Q37) | Must |
| P2 | Every task uses Claude Opus 5.5 by default, with the effort set per task. Changing a task's model is a founder decision, made when that task's evals show the quality holds | Must |
| P3 | Every AI call is logged: the task, model, prompt version, tokens, estimated cost, time taken and outcome. Never the text sent or received | Must |
| P4 | A monthly AI budget per environment. At 80%, the founders get an email. At 100%, the AI pauses and every task falls back to people (P5) until the next month or a founder raises the budget | Must |
| P5 | If the AI is unavailable, slow, refuses or returns something invalid, the task falls back to people and the letting carries on. Questions go to the operator, and the letter writes the description. The word list alone checks wording. For documents, the renter enters what each one says, and it's shown to the letter as entered by the renter | Must |
| P6 | Each task has a golden set of examples, with a pass mark, run against the real model before any change to its prompt or model, and the results saved with the change | Must |
| P7 | Names, email addresses and phone numbers are stripped from text before it reaches the model. Bedrock's invocation logging is off. Real renters' data never goes to the Claude API | Must |
| P8 | Each task can be switched off on its own, without a deploy | Should |

### B. AI for renters and letters

| ID | Requirement | Priority |
| --- | --- | --- |
| P9 | Answers to renters' questions (R8) use the real model with the guardrails already built: answers only from the home's facts, each citing them, the protected-ground check, fixed answers about HAP and assistance dogs, and approval before sending when it's on | Must |
| P10 | **Drafted descriptions (M45).** The letter can ask for a description drafted from the facts they've entered. It uses no fact the letter didn't enter, says nothing about who the home would suit, and has no contact details or links | Must |
| P11 | A drafted description goes through the same checks as one the letter wrote (M46), is marked as drafted by AI until the letter edits it, and is never published without the letter pressing publish | Must |
| P12 | **Unfair wording check (ADR-0023).** Before a listing goes live and when its words change, the AI looks for wording that excludes people on a protected ground, directly or indirectly ("suits professionals", "no children", "Irish only", "no rent allowance") | Must |
| P13 | A finding names the phrase, the ground and a suggested rewording. It holds the listing for a person at Gaff and never removes or changes anything (M97). The letter sees what was flagged and why, in plain words | Must |
| P14 | The same check runs on an operator's answer before it becomes a reusable fact (R8 step 5), so an unfair answer is never reused | Should |

### C. Identity, once per person

| ID | Requirement | Priority |
| --- | --- | --- |
| P15 | Every person checks their identity once, and it's kept on their Gaff profile. A renter checks the first time a letter chooses them as the preferred applicant or the backup, whether they enquired on Gaff, Daft or MyHome. Letters (private landlords and agents) check before their first listing goes live, and anyone who joins a letting workspace before they first act on a letting (Q48) | Must |
| P16 | **Before a renter is chosen,** trust comes from lighter steps: they confirm their email with a code to enquire (M76, built), and their mobile with a text code to book a viewing. The confirmed mobile also gets the viewing reminders (R13). A renter without a mobile can still book, and the letter sees that no mobile was confirmed | Must |
| P17 | The check is Stripe Identity: a photo of a passport, driving licence or national ID card, and a selfie that Stripe compares with it. It takes about two minutes on a phone. On a laptop, Stripe offers to carry on on the phone | Must |
| P18 | Before Stripe, a Gaff page explains in plain words what Stripe checks, and that the selfie is biometric data. It says Stripe deletes the images for Gaff 30 days after the result, and what Stripe keeps itself. Checking without a selfie is offered as an equal choice. The person agrees to the selfie explicitly, or chooses the check without one. Declining Stripe's own consent screen leads to the check without a selfie, never to a failed check | Must |
| P19 | **Without a selfie,** Stripe checks the document alone. For a renter, the letter is asked to see the original document when they meet, and record it (P27). A letter who checks without a selfie has their first listing reviewed by a person at Gaff before it goes live | Must |
| P20 | **Can't be checked online:** for someone whose document Stripe can't check, or who didn't pass after three tries. A renter carries on with their other checks, and shows their ID to the letter in person (P27). For a letter, a person at Gaff checks their ID another way before their first listing goes live (Q55) | Must |
| P21 | From Stripe, Gaff keeps only: the result, the reason code if it didn't pass, whether a selfie was checked, the verified first and last name, and the date. Never the date of birth, document number, issuing country, nationality, sex or images (rule 3, Q19) | Must |
| P22 | Gaff compares the verified name with the name the person uses on Gaff, and with the names on their documents. A difference is shown to the person deciding, in `warning`, and never as a failure: names differ for ordinary reasons, such as a fada, a married name or a middle name | Must |
| P23 | A renter's result goes only to the letters who choose them, with the rest of their checks (M11). Ranking never reads it | Must |
| P24 | Letters' results show as badges on their listings, as today (M26): "Identity checked by Gaff on 8 November 2026". An agent's verified name must match the name on their PSRA licence. The person at Gaff who checks the licence compares them (M23) | Must |
| P25 | Up to three Stripe attempts per person. Each costs Gaff, so after three the person is offered P20 | Must |
| P26 | Gaff asks Stripe to redact each session 30 days after its result. The privacy notice says what Stripe keeps as its own controller to prevent fraud, and for how long | Must |
| P27 | **Seen in person:** for a renter checked without a selfie, or whose ID couldn't be checked online, Gaff asks the letter to see an original photo ID before sending the tenancy agreement, and to record the name on it. Gaff records who recorded it and when, never the document | Must |
| P28 | A check lasts as long as the person's Gaff account, and is deleted with it: when they ask, or after 2 years without use (Q25). Someone whose name changes can check again | Must |
| P29 | A renter whose identity is already checked is never asked again. Their checks page shows it as done, and shares it with the letter in the same step as everything else (P39) | Must |

### D. Work and income, when a renter is chosen

| ID | Requirement | Priority |
| --- | --- | --- |
| P30 | Only the preferred applicant and the backup are asked, on one page, "A few checks before an offer", which explains what's asked, who sees it and when it's deleted (R18). What's asked depends on how they said they earn on their application (R16), and it's the same on every letting (Q53) | Must |
| P31 | **From a job:** their three most recent payslips. If they started in the last three months, their contract or offer letter, showing the pay and the start date, instead. Their work is confirmed by the employer's reference Gaff already sends (R18), or by a letter from their employer that they upload | Must |
| P32 | **Self-employed:** their latest Notice of Assessment from Revenue, or a letter from their accountant | Must |
| P33 | **Other income** (a pension, a social welfare payment or maintenance): a recent statement of each. Someone living on savings shares a savings statement showing only the balance. Gaff reads the amount and how often it's paid (or the balance), the date, and whether the name matches. The letter sees only those, never the statement or what kind of income it is. Gaff deletes the statement once the renter confirms what it read | Must |
| P34 | Income that's on no document, such as a partner's income or help with the rent, stays as the household income the renter gave on their application, with nothing recording what it is (Q17) | Must |
| P35 | Gaff never asks for bank statements, apart from the balance-only savings statement (P33), or for anything the DPC considers excessive at this stage. A letter can't add to the standard set (Q53) | Must |
| P36 | Documents can be PDF, JPG or PNG, up to 10 MB each and 10 pages, from the phone's files or camera. A photo of a paper payslip is fine. A PPS number can stay showing. Gaff suggests covering it, with a picture showing how | Must |
| P37 | Claude reads each document: what kind of document it is, the name on it, and its date. For work documents, it also reads the employer, the take-home pay and how often it's paid. For other income, it reads the amount and how often. It never reads out or records a PPS number, bank details or anything else on the document | Must |
| P38 | Gaff checks each document and tells the renter at once if something needs fixing: whether it's the kind asked for, whether it's in the name on their ID, and whether it's recent. The latest payslip should be dated in the last six weeks, and letters and other statements in the last three months. A reference sent to a personal email address, rather than an employer's, is flagged to the letter. Nothing here rejects anyone: the renter can share anyway, and the letter sees what didn't match. Gaff says what it checked, and that it can't tell whether a document is forged | Must |
| P39 | The renter sees what Gaff read from each document, can correct it, and then shares everything with the letter in one step: identity, documents and referees. They see exactly what will be shared. A correction is shown to the letter as changed by the renter | Must |
| P40 | **Keep for next time:** the renter can keep their documents and referees' details on their profile for their next application. The box is unticked by default (Q25). Kept documents are deleted when they go out of date: payslips and letters three months after their date, Revenue statements 12 months after theirs | Must |
| P41 | The letter's copy of the documents is deleted when the tenancy starts or the application closes, and 30 days after it was shared at the latest. The renter's own copy, if not kept, is deleted once shared | Must |
| P42 | A renter who hasn't rented before, or is new to Ireland, can give a character reference instead of a previous landlord's | Must |
| P43 | A renter can add a guarantor, who checks their identity and shares their own documents the same way (workflow PRD) | Should |

### E. What letters see, and fairness

| ID | Requirement | Priority |
| --- | --- | --- |
| P44 | For each chosen renter, one page, in words: their identity, and when and how it was checked; their work, from the reference; what each document shows ("€1,480 take-home every two weeks, about €3,207 a month"), next to the household income they gave on their application; their references; and anything flagged. No score, ratio or "pass" | Must |
| P45 | The letter can open payslips and employer documents while they're kept, never statements of other income (P33). Each opening is recorded | Must |
| P46 | Anything flagged is shown in `warning`, with a plain reason and what to do, such as "The name on the payslips is Niamh O'Kelly. Her ID says Niamh Kelly. Check this with Niamh". A person decides | Must |
| P47 | Wherever a letter sees income, Gaff reminds them that the decision is theirs, that the same standard applies to everyone, and that refusing someone because they get HAP, rent supplement or any social welfare payment is unlawful | Must |
| P48 | The letter can mark a flag "seen and accepted", with a reason, for example after talking to the renter. It's recorded as the letter's decision | Should |
| P49 | Results are kept only as long as the application's personal data (R26), and deleted with it. Documents go sooner (P41) | Must |

### F. Privacy and security

| ID | Requirement | Priority |
| --- | --- | --- |
| P50 | The privacy notice names Stripe for identity checks, and Amazon Web Services for the AI in production. It says what each does, where, the transfer basis, and what Stripe keeps as its own controller | Must |
| P51 | The DPIA covers biometric data (the selfie), documents and the AI tasks, before the first real person checks their identity | Must |
| P52 | Documents reach the model with names on them: they can't be redacted first. In production that's Claude on Bedrock in Dublin, under AWS's DPA. The test copy reads documents with the Claude API, so its upload page tells testers to use made-up documents only | Must |
| P53 | Documents are stored encrypted, in a private place no browser can reach without a link that expires within a minute. Only the renter can open their own, and only the letting's team can open the copy shared with them | Must |
| P54 | Webhooks from Stripe are verified by their signatures, and Gaff fetches the result from Stripe rather than trusting what the webhook says | Must |
| P55 | Abuse limits: three ID attempts per person, ten uploads per check, the existing limits on text codes, and the existing rate limits per device | Must |

### G. Running it

| ID | Requirement | Priority |
| --- | --- | --- |
| P56 | Every provider has a test mode on the test copy: Stripe's test sessions and the Claude API with credits. Text codes show on screen until Sinch is set up (N3). The stand-in pages stay for local development | Must |
| P57 | Each provider is switched on per environment by a setting. Production refuses stand-ins (as today) | Must |
| P58 | Each week, founders can see: how many chosen renters finished their checks and how long it took, the route each took for identity, how many bookings confirmed a mobile, the AI calls by task, and the cost of each | Should |
| P59 | Gaff alerts the founders when a provider fails repeatedly (five failures in an hour) | Should |

### H. Later

| ID | Requirement | Priority |
| --- | --- | --- |
| P60 | **Confirm with your bank:** an optional, one-off, read-only connection through Tink's own pages. Gaff checks that the pay on the renter's payslips arrives in their account, and keeps only "confirmed" or "not found": never transactions, payers or an income figure. Built when the founders choose (Q56) | Later |

## What each person sees

| Data | Renter | Letter | Gaff staff | Kept for |
| --- | --- | --- | --- | --- |
| Identity result, verified name, with or without a selfie, date | Yes | A renter's once they choose them; a letter's as a badge | When reviewing a letter's checks | As long as the account |
| Date of birth, document number, issuing country, nationality, images | No (Gaff never has them) | No | No | Not kept by Gaff. Stripe redacts after 30 days, apart from its own copy |
| "ID seen in person", by whom, when | Yes | Yes | No | With the application |
| Confirmed mobile | Yes | Once they've booked a viewing | No | With the application, and on the profile if kept |
| Payslips, employer letters, contracts, Revenue and accountant's documents | Yes | Once shared, while kept | No | The letter's copy until the tenancy starts or the application closes, 30 days after sharing at most. The renter's copy only if they keep it, until it's out of date |
| What Gaff read from them | Yes | Yes | No | With the application |
| Statements of other income or savings | Until Gaff has read them | Never | No | Deleted once the renter confirms what Gaff read |
| The amount, how often and the date from them | Yes | Yes, as "regular income", unlabelled | No | With the application |
| PPS numbers showing on documents | On their own documents | On documents they open, if not covered | No | Never recorded. Deleted with the document |
| AI usage: task, tokens, cost | No | No | Founders, as totals | 12 months |

## Success measures

- **Checks finished:** chosen renters share their checks within a median of 24 hours, and 85% within 48 hours. References are the slow part; everything else should take about five minutes.
- **Identity:** the median check takes under 3 minutes, and at least 95% of chosen renters finish it, by any route.
- **Routes:** the share checking without a selfie, and the share whose ID can't be checked online, by document type. A high share means something is putting people off, or Stripe is missing a document.
- **Bookings:** the share of bookings with a confirmed mobile, and no-shows per viewing, before and after.
- **Documents:** at least 90% read without the renter correcting anything. Track the share of packs with a flag, and how often letters mark a flag "seen and accepted".
- **AI answers:** at least 80% of drafted answers approved without edits; no answer sent that cites a fact it didn't use.
- **Descriptions:** the share of drafts published with light edits only.
- **Wording check:** holds per 100 listings, and the share a person at Gaff upholds. A low share means the check is too eager.
- **Cost:** identity checks and AI per letting, against the price in the business plan.

## Launch plan

1. **On the test copy, with test modes:** the Claude API for all AI tasks and Stripe Identity's test sessions. Founders test with made-up documents and their own accounts.
2. **Before the first real person checks their identity:** Stripe's DPA and the privacy notice (P50), the DPIA (P51), the solicitor's answers (Q42, Q43, Q45, Q52), an AWS account with Bedrock in Dublin, and the evals passing on Bedrock.
3. **With the first letters:** every route for every check, with a weekly review of the measures above.

## Open questions

| # | Question | Proposal | Who |
| --- | --- | --- | --- |
| Q42 | HAP: the council pays most of a HAP renter's rent to the landlord directly, so it never shows on their payslips or in their bank account. An income rule (such as 2.5 times the rent) then fails most people on HAP, even though the council pays most of the rent. Refusing someone because they get HAP is unlawful, and Gaff can't ask whether they do. How should affordability work for them? Explained in full in [open-questions.md](../open-questions.md#q42-hap-and-affordability-solicitor-founders) | Open. Options there, for the solicitor and the founders | Solicitor, founders |
| Q43 | The DPC ties ID and financial documents to "those who will be entering into a tenancy". Is asking the backup at the same time as the preferred applicant proportionate? Payslips showing a PPS number would reach the letter for both | Keep both (R18) if the solicitor agrees; otherwise ask the backup only when they're promoted | Solicitor |
| Q45 | Is consent to the selfie freely given, when a check is part of being offered a home? | Yes: Gaff asks, not the letter; checking without a selfie is equally prominent, needs no reason and carries no penalty | Solicitor |
| Q52 | Gaff reads statements of other income and tells the letter only the amount. Is that a sound way to protect the housing assistance, age, disability and family status grounds? Is Gaff the controller for that reading? | Yes, and yes | Solicitor |
| Q53 | Can a letter ask for more than the standard set, such as bank statements or two years of accounts? | No: the same set on every letting, reviewed by the solicitor | Founders |
| Q54 | Joint tenants: should each adult who'll sign join the application with their own profile, identity and documents? | Yes, soon after launch. Until then, the lead renter's documents and the household income they gave | Founders |
| Q55 | When a letter's ID can't be checked online, how does a person at Gaff check it? | A short video call where they show the original, using a tool the founders approve (rule 10) | Founders |
| Q56 | When should "Confirm with your bank" (P60) be built? | When a forged document is found on Gaff, or letters ask for it | Founders |

## Sources

- Claude data residency: <https://platform.claude.com/docs/en/manage-claude/data-residency> (inference geo "global" or "us"; workspace geo "us" only)
- Claude in Amazon Bedrock: <https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock> (`eu-west-1` in-region; Bedrock has no batch API)
- Anthropic's DPA: <https://www.anthropic.com/legal/data-processing-addendum>
- Stripe Identity: <https://docs.stripe.com/identity/verification-sessions>, <https://docs.stripe.com/identity/verification-checks?type=selfie> (EU law may require a non-biometric alternative), <https://docs.stripe.com/identity/access-verification-results>, <https://stripe.com/ie/identity>, <https://support.stripe.com/questions/stripe-identity-faq>
- Daft's identity checks with Stripe Identity: <https://support.daft.ie/hc/en-ie/articles/45693108059409-Identity-Verification-on-Daft-ie>
- What Irish agents ask for: Lisney <https://lisney.com/faq/what-documents-and-paperwork-will-i-need-to-rent/>, DNG <https://www.dng.ie/services/tenants/guide-to-renting/>, Owen Reilly <https://www.owenreilly.ie/tenant-passport/>, Sherry FitzGerald <https://www.sherryfitz.ie/news/our-property-management-service>, I-RES <https://www.iresliving.ie/renting-with-ires>, MyHome <https://news.myhome.ie/renting/what-do-i-need-to-rent-a-property-in-ireland-34369>, the RTB's checklists <https://rtb.ie/renting/beginning-a-tenancy/tenant-checklist/>
- DPC, requesting personal data from prospective tenants: <https://www.dataprotection.ie/en/dpc-guidance/requesting-personal-data-prospective-tenants>; the 2023 case study <https://dataprotection.ie/en/dpc-guidance/case-studies/general-accountability/complaint-excessive-personal-data-requested-letting-agent>; photos and PPS numbers <https://www.irishtimes.com/news/ireland/irish-news/landlords-should-not-seek-photos-and-pps-numbers-dpc-says-1.3708353>
- Character references and savings for first-time renters (cost rental): <https://www.citizensinformation.ie/en/housing/renting-a-home/help-with-renting/cost-rental-housing/>
- The housing assistance ground (rent supplement, HAP or any social welfare payment): IHREC <https://www.ihrec.ie/your-rights/housing-assistance-payment/housing>, <https://www.ihrec.ie/news-press/ihrec-alerts-landlords-tenants-and-accommodation-advertisers-to-new-equality-law>; the maximum award for refusing HAP <https://www.irishtimes.com/politics/2025/09/23/landlord-who-refused-hap-for-tenant-ordered-to-pay-maximum-compensation>; research for IHREC on screening out people not in work <https://www.irishtimes.com/news/social-affairs/landlords-discriminating-against-benefit-recipients-report-finds-1.3935039>
- HAP is paid to the landlord: <https://www.citizensinformation.ie/en/housing/renting-a-home/help-with-renting/housing-assistance-payment/>
- Fraud in UK referencing: <https://blog.goodlord.co/referencing-tenancy-fraud-spikes-140-in-a-year-goodlord>, <https://www.goodlord.com/let-without-limits-trusted-sources>
- Open banking: Tink Income Check <https://tink.com/products/income-check/>; Plaid's European income launch <https://plaid.com/blog/plaid-income-uk-europe-launch/>

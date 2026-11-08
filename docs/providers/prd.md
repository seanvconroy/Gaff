# Replacing the stand-ins: product requirements

Draft for the founders, 8 November 2026 · requirements P1 to P48

## Summary

The test copy runs every step of a letting, but three of the steps that matter most still use stand-ins: the AI, the renter's ID check and the income check. This document replaces them with real services, adds two AI tasks for letters, and keeps every product rule in `CLAUDE.md`.

- **For renters:** answers to their questions within minutes, written by Claude from the home's facts. If a letter chooses them, they prove who they are with Stripe Identity or by showing their ID in person, and their income by connecting their bank or uploading payslips. They never pay for any of it.
- **For letters:** a description drafted from the facts they've entered, and a check that catches unfair wording before a listing goes live. For the people they choose, they see clear results against their own rule, not a pile of documents, and they make the decision.
- **For Gaff:** the AI runs in the EU in production, every check is logged without personal data, and documents and provider data are deleted on schedule.
- **How it's built:** see the [technical specification](tech-spec.md). It builds on the workflow [PRD](../prd.md) (R8, R18) and the [marketplace PRD](../marketplace/prd.md) (M24, M45, M46, M97).
- **Status:** a draft. Sean took the decisions below on 8 November 2026. Two things must happen before renters' checks go live: Stripe confirms in writing that its terms allow this use (Q44), and the solicitor answers the questions at the end.

## Decisions that shape this document

| Question | Decision (Sean, 8 November 2026) | What it means |
| --- | --- | --- |
| Where does the AI run? (Q37) | The test copy uses the Claude API, with the founders' credits. Production uses Claude on Amazon Bedrock in Dublin | The same code behind one port. ADR-0009 stands: renters' messages are processed in the EU in production. The Claude API only offers global or US processing and stores data in the US, so it's never used for real renters |
| How are chosen renters' identities checked? (Q38) | Stripe Identity (a document and a selfie), or the renter shows their ID to the letter in person | Extends Stripe Identity's approval from landlords to renters (rule 10). The in-person route is the non-biometric alternative the EU requires |
| How do chosen renters show their income? (Q40) | Connecting their bank (read-only open banking), or uploading payslips that Claude reads | Payslips are kept only until the decision, with the PPS number covered |
| Which open banking provider? (Q39) | Tink, with TrueLayer as the backup | Tink's Income Check covers Ireland and processes in the EU. TrueLayer is authorised by the Central Bank of Ireland and keeps data in Ireland and the UK. Plaid isn't used for now: its income product isn't offered in Ireland, it stores European data in the US, and its EU plans need a minimum commitment. Both new providers need rule 10's DPA and transfer basis |
| Which AI tasks come now? (Q41) | Answers to renters (R8, built), drafted listing descriptions (M45) and the unfair-wording check (ADR-0023) | Holding letters' messages that ask for money before a viewing (M28) waits for a later phase |

## Where we are

| Part | Test copy today | Production today | After this work |
| --- | --- | --- | --- |
| Answers to renters' questions (R8) | A stand-in that matches keywords to facts | Off: the operator answers | Claude, with the same guardrails |
| Listing descriptions (M45) | The letter writes them | The letter writes them | The letter writes them, or Claude drafts one from the facts |
| Unfair wording in listings (ADR-0023) | A word list | A word list | The word list, then Claude for subtler wording |
| Renters' ID check (R18) | A test page where the tester picks the result | None: the letter arranges it | Stripe Identity, or in person |
| Renters' income check (R18) | A test page | None: the letter arranges it | Open banking, or payslips read by Claude |
| Landlords' ID check (M24) | A test page | Stripe Identity (built) | Unchanged: needs live keys and the DPA |
| Texts | The code is shown on screen; texts go to the outbox | Sinch (approved, not set up) | Unchanged: an account and keys (N3) |
| Receiving email | Not set up | Needs Gaff's own domain | Unchanged: Gaff's domain (N2) |
| Photos | Kept in the database | Supabase Storage | Unchanged: the service key |

The last four rows need accounts and keys, not code, so they're on the [launch checklist](../launch-checklist.md) rather than in this document.

## How the product rules apply

| Rule | How this work keeps it |
| --- | --- |
| 1. People make every decision | No check result rejects anyone, and nothing moves an application on its own. A check that doesn't pass is shown in `warning` with a plain reason, and the letter decides. The AI drafts, reads and flags: it never decides, and its flags only hold things for a person |
| 2. Staged data | Checks run only for the preferred applicant and the backup, after they're told what each check involves. Documents are asked for only then. The PPS number must be covered on payslips; Gaff collects it only for RTB registration |
| 3. No protected grounds | From the ID check, Gaff reads only the name: never the date of birth, nationality, sex or document images. From the bank, Gaff keeps one figure, the regular income, and never the transactions, payers or categories. Housing support such as HAP always counts as income, and nothing records whether someone receives it |
| 4. Renters never pay | Gaff pays for every check and every AI call |
| 5. Gaff never holds money | Open banking is read-only account information. No payment is ever initiated |
| 6. AI disclosure | Unchanged. AI-written text is marked as drafted by AI wherever a person sees it before it's sent |
| 7. Grounded AI | Answers still cite facts. Descriptions use only the facts the letter entered. The wording check only adds holds. Payslip reading returns figures, not prose. Every input is untrusted, and names and contact details are stripped before anything reaches the model, except the payslip images themselves (see P41) |
| 8. Every step logged | Each check, AI call, upload, view and deletion is an event, with IDs, codes, numbers and dates only |
| 9. Retention by jobs | Jobs delete payslips, ask Stripe to redact sessions, and remove bank connections, on schedule |
| 10. Approved vendors | Sean approved Stripe Identity for renters and Tink, with TrueLayer as the backup, on 8 November 2026. Each still needs a DPA and a named transfer basis before real renters use it. The Claude API is used only on the test copy |

## Key journeys

### J1. A renter asks a question

Aoife asks "Is there parking, and when are the bins collected?". Within a minute, Claude drafts two answers from the home's facts, each citing the facts it used. If the letter approves answers before they're sent, the drafts wait in Approvals, marked as drafted by AI. A question the facts don't answer goes to the letter.

### J2. A letter drafts a description

Mary has entered the home's facts: two bedrooms, gas heating, a south-facing balcony, near the Luas. She presses **Draft a description**. A few seconds later, a plain description of the home appears in the editor, marked as drafted by AI. It says nothing the facts don't say, and nothing about who the home would suit. She edits a sentence and publishes.

### J3. Unfair wording is caught

An agent writes "Would suit a quiet professional couple". The word list misses "professional couple" phrased this way, but the wording check flags it as family status and civil status. The listing waits for a person at Gaff, and the agent sees why, with a suggested rewording: "Two bedrooms, suits up to three people". A person at Gaff decides.

### J4. The preferred applicant checks their ID

Niamh is chosen. Her checks page explains each check. For ID, she can **Check my ID with Stripe** (a photo of her passport or driving licence and a selfie, about two minutes) or **Show my ID in person**. She chooses Stripe, reads what Stripe does with her selfie and agrees, and is back on Gaff two minutes later. The letter sees "ID checked by Stripe: the name matches, Niamh Kelly".

### J5. She confirms her income by connecting her bank

She chooses **Connect my bank**, picks AIB, signs in to AIB, and agrees to share her account information once, for this letting. Tink reports the income paid into her account over the last three months, Gaff turns it into one monthly figure, and the connection is deleted. She sees "€3,200 a month" before it's shared and can add other income that isn't paid into that account. The letter sees "€3,200 a month, checked with her bank: 2.1 times the rent. Your rule is 2.5 times", and decides.

### J6. Or she uploads payslips

She chooses **Upload payslips**, covers the PPS number on each with her phone's markup tool, and uploads three. Claude reads the pay dates and net pay. She sees "€1,480 every two weeks, about €3,207 a month", confirms it, and sends it. The letter sees the figure marked as read by AI, can open the payslips, and decides. The payslips are deleted 30 days after the result, or sooner if the application closes.

### J7. The letter reviews and decides

On Applications, the letter sees each chosen renter's checks side by side, in words: what was checked, by whom, the result against their rule, and anything a person should look at. Nothing is a refusal. The letter makes the offer, or chooses someone else.

## Requirements

Priority: **Must** for launch, **Should** soon after.

### A. The AI service

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | The AI runs on the Claude API on the test copy and in development, and on Claude on Amazon Bedrock in Dublin (`eu-west-1`, in-region) in production. Production refuses any other AI provider (Q37) | Must |
| P2 | Every task uses Claude Opus 5.5 by default, with the effort set per task. Changing a task's model is a founder decision, made when that task's evals show the quality holds | Must |
| P3 | Every AI call is logged: the task, model, prompt version, tokens, estimated cost, time taken and outcome. Never the text sent or received | Must |
| P4 | A monthly AI budget per environment. At 80%, the founders get an email. At 100%, the AI pauses and every task falls back to people (P5) until the next month or a founder raises the budget | Must |
| P5 | If the AI is unavailable, slow, refuses or returns something invalid, the task falls back to people and the letting carries on: questions go to the operator, the letter writes the description, the word list alone checks wording, and payslips are read by the letter | Must |
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

### C. Checking a chosen renter's identity

| ID | Requirement | Priority |
| --- | --- | --- |
| P15 | Only the preferred applicant and the backup are asked, after their checks page explains what each check involves (R18) | Must |
| P16 | The renter chooses: **Check my ID with Stripe** (a document and a selfie) or **Show my ID in person** | Must |
| P17 | Before Stripe, a Gaff page explains in plain words what Stripe checks, that the selfie is biometric data, how long Stripe keeps it, and that showing ID in person is an equal alternative. The renter agrees explicitly, or chooses the alternative. Declining Stripe's own consent screen leads to the alternative too, never to a failed check | Must |
| P18 | "In person": the letter records that they saw an original photo ID and the name on it. Gaff records who recorded it and when, not the document | Must |
| P19 | From Stripe, Gaff keeps only: the result, the reason code if it didn't pass, the verified name, whether it matches the applicant's name, and the date. Never the date of birth, document number, issuing country, sex or images (rule 3, Q19) | Must |
| P20 | The letter sees "ID checked by Stripe: the name matches, Niamh Kelly" or, in `warning`, "The name on the ID is Niamh O'Kelly. Check this with Niamh." A person decides | Must |
| P21 | Up to three Stripe attempts per renter per letting. After that, the renter is offered the in-person route | Must |
| P22 | Gaff asks Stripe to redact each session 30 days after its result, as for landlords (M24). The privacy notice says what Stripe keeps as its own controller for fraud prevention, and for how long | Must |
| P23 | Renters' ID checks go live only once Stripe has confirmed in writing that its terms allow this use (Q44). Until then, production offers the in-person route only | Must |

### D. Checking a chosen renter's income

| ID | Requirement | Priority |
| --- | --- | --- |
| P24 | The renter chooses: **Connect my bank** (recommended, about two minutes) or **Upload payslips** | Must |
| P25 | **Connect my bank.** Read-only, one-off access to the accounts the renter picks, through Tink's own pages. Gaff's pages load no third-party scripts (M103) | Must |
| P26 | Gaff gets Tink's income report for the last three months (with TrueLayer, the incoming payments themselves), turns it into one figure for regular monthly income, whatever its source, and keeps only that figure and the number of months it covers. It never stores transactions, payers, references or income categories, which could reveal age, family status or disability | Must |
| P27 | The connection is removed at the provider as soon as the figure is worked out | Must |
| P28 | The renter sees the figure before it's shared, and can add other income that isn't paid into that account, such as a second job, a partner's income or housing support, as one declared amount. Nothing records what it is (Q17) | Must |
| P29 | **Upload payslips.** Up to three recent payslips, or an employer's letter, as PDF, JPG or PNG files of up to 10 MB each. The page shows how to cover the PPS number first | Must |
| P30 | Claude reads each page: the pay date, the pay period and the net pay. If it sees an uncovered PPS number, that page is deleted at once and the renter is asked to cover it and try again | Must |
| P31 | Code turns the payslips into a monthly figure. The renter sees the figures read from each payslip, can correct them, and sends them. A correction is shown to the letter as changed by the renter | Must |
| P32 | The letter sees the figure marked as read by AI, and can open the payslips while they're kept. Each time they're opened is recorded | Must |
| P33 | Payslips are deleted 30 days after the result, or when the application closes or the tenancy starts, whichever comes first | Must |

### E. Results for letters, and fairness

| ID | Requirement | Priority |
| --- | --- | --- |
| P34 | Income is shown against the letter's rule in words: "€3,200 a month checked with her bank, plus €400 declared: 2.4 times the rent. Your rule is 2.5 times." Below the rule is shown in `warning`, never `danger`, with the reminder that a person decides | Must |
| P35 | Wherever a letter sees income, Gaff says that housing support such as HAP counts as income and is usually paid to the landlord directly, so it won't show in a bank account | Must |
| P36 | A renter whose check didn't pass is told why in plain words, can try again where that makes sense, and can use the other route | Must |
| P37 | The letter can mark a check "seen and accepted" with a reason, for example after talking to the renter. It's recorded as the letter's decision | Should |
| P38 | Results are kept only as long as the application's personal data (R26), and deleted with it | Must |

### F. Privacy and security

| ID | Requirement | Priority |
| --- | --- | --- |
| P39 | The privacy notice names Stripe and Tink (and TrueLayer if it's used), what each does, where, the transfer basis, and what each keeps as its own controller | Must |
| P40 | The DPIA covers biometric data (the selfie), financial data (bank and payslips) and the AI tasks, before the first real renter | Must |
| P41 | Payslip images reach the model with names on them: they can't be redacted first. In production that's Claude on Bedrock in Dublin, under AWS's DPA. The test copy reads payslips with the Claude API, so its upload page tells testers to use made-up payslips only | Must |
| P42 | Payslips are stored encrypted, in a private place no browser can reach without a link that expires within a minute, and only the letting's team can open them | Must |
| P43 | Webhooks from Stripe and Tink are verified by their signatures, and Gaff fetches the result from the provider rather than trusting what the webhook says | Must |
| P44 | Abuse limits: three ID attempts and three bank connections per renter per letting; five uploads per check | Must |

### G. Running it

| ID | Requirement | Priority |
| --- | --- | --- |
| P45 | Every provider has a test mode on the test copy: Stripe's test sessions, Tink's sandbox, and the Claude API with credits. The stand-in pages stay for local development | Must |
| P46 | Each provider is switched on per environment by a setting. Production refuses stand-ins (as today) | Must |
| P47 | Founders can see, each week, the checks started, finished and passed, the AI calls by task, and the cost of each | Should |
| P48 | Gaff alerts the founders when a provider fails repeatedly (five failures in an hour) | Should |

## What each person sees

| Data | Renter | Letter | Gaff staff | Kept for |
| --- | --- | --- | --- | --- |
| ID result, verified name, name match | Yes | Yes | No | With the application (R26) |
| Date of birth, document number, issuing country, images | No (Gaff never has them) | No | No | Not kept by Gaff. Stripe redacts after 30 days, apart from its own copy |
| "ID seen in person", by whom, when | Yes | Yes | No | With the application |
| Monthly income figure, source (bank or payslips), months covered | Yes | Yes | No | With the application |
| Declared other income | Yes | Yes, marked as declared | No | With the application |
| Transactions, payers, categories | No (Gaff never stores them) | No | No | Not kept |
| Payslips | Yes, until deleted | Yes, until deleted | No | 30 days after the result at most |
| AI usage: task, tokens, cost | No | No | Founders, as totals | 12 months |

## Success measures

- **Checks finished:** at least 85% of chosen renters finish both checks within 48 hours of being asked.
- **Time:** the median ID check takes under 5 minutes, and connecting a bank under 4.
- **Routes:** the share of renters choosing in person, or payslips, by letting. A high share is a signal that something is putting people off.
- **AI answers:** at least 80% of drafted answers approved without edits; no answer sent that cites a fact it didn't use.
- **Descriptions:** the share of drafts published with light edits only.
- **Wording check:** holds per 100 listings, and the share a person at Gaff upholds. A low share means the check is too eager.
- **Cost:** checks and AI per letting, against the price in the business plan.

## Launch plan

1. **On the test copy, with test modes:** the Claude API for all AI tasks, Stripe Identity test sessions, and Tink's sandbox. Founders test with made-up data and their own accounts.
2. **Before the first real renter:** Stripe's written confirmation (Q44), contracts and DPAs with Tink and Stripe and the privacy notice (P39), the DPIA (P40), the solicitor's answers, an AWS account with Bedrock in Dublin, and the evals passing on Bedrock.
3. **Tink's commercial terms:** Income Check is sold on enterprise terms, so ask Tink (and TrueLayer, as the backup and a price check) for a quote, the confirmed list of Irish banks (PTSB, An Post Money and bunq especially), one-off consent in Ireland, and whether Gaff must register as Tink's agent.
4. **With the first letters:** both routes for every check, with weekly review of the measures above.

## Open questions

| # | Question | Proposal | Who |
| --- | --- | --- | --- |
| Q42 | Income checks and housing assistance: HAP is paid to landlords directly and never shows in a renter's bank. Is the design (P28, P34, P35) enough, or should the rule be met differently for anyone who includes housing support? | The renter adds it as declared income; nothing records what it is; letters are reminded in words | Solicitor |
| Q43 | The DPC's guidance ties ID and financial checks to "those who will be entering into a tenancy". Is checking the backup at the same time as the preferred applicant proportionate? | Keep both (R18) if the solicitor agrees; otherwise check the backup only when they're promoted | Solicitor |
| Q44 | Stripe's terms appear to forbid using Identity "as a factor in determining any person's eligibility for … housing". Stripe's docs say that applies to US credit-reporting law. Does it allow checking a chosen renter's identity in Ireland? | Ask Stripe in writing before renters' ID checks go live (P23) | Sean, Stripe |
| Q45 | Explicit consent for the selfie sits uneasily with the DPC's view that consent is rarely freely given between landlord and tenant. Is the in-person alternative enough to make it free? | Yes, with equal prominence and no penalty for choosing it | Solicitor |
| Q46 | Should the open banking check be offered at all at offer stage? (PRD open question) | Yes, as one of two routes the renter chooses between | Solicitor |
| Q47 | Most credit unions offer no open banking connection, and An Post Money's is unconfirmed. Is payslips enough of an alternative for their members? | Yes, and never treat not connecting a bank as a negative | Founders |

## Sources

- Claude data residency: <https://platform.claude.com/docs/en/manage-claude/data-residency> (inference geo "global" or "us"; workspace geo "us" only)
- Claude in Amazon Bedrock: <https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock> (`eu-west-1` in-region; Bedrock has no batch API)
- Anthropic's DPA: <https://www.anthropic.com/legal/data-processing-addendum>
- Stripe Identity: <https://docs.stripe.com/identity/verification-sessions>, <https://docs.stripe.com/identity/access-verification-results>, <https://docs.stripe.com/identity/before-going-live>, <https://stripe.com/ie/identity>, <https://stripe.com/legal/ssa-service-terms>, <https://support.stripe.com/questions/stripe-identity-faq>
- Open banking in Ireland: Tink Income Check <https://tink.com/products/income-check/> and its SDK reference <https://docs.tink.com/entries/articles/income-check-sdk-reference>; TrueLayer's consent and Irish authorisation <https://docs.truelayer.com/docs/collect-user-consent>, <https://registers.centralbank.ie/FirmDataPage.aspx?firmReferenceNumber=C433487>; Plaid's European income launch <https://plaid.com/blog/plaid-income-uk-europe-launch/> and data transfers <https://plaid.com/legal/>; GoCardless Bank Account Data closed to new sign-ups <https://bankaccountdata.gocardless.com/new-signups-disabled>
- HAP is paid to the landlord: <https://www.citizensinformation.ie/en/housing/renting-a-home/help-with-renting/housing-assistance-payment/>
- DPC, requesting personal data from prospective tenants: <https://www.dataprotection.ie/en/dpc-guidance/requesting-personal-data-prospective-tenants>, and the case study <https://dataprotection.ie/en/dpc-guidance/case-studies/general-accountability/complaint-excessive-personal-data-requested-letting-agent>
- IHREC on the housing assistance ground: <https://www.ihrec.ie/your-rights/housing-assistance-payment/housing>

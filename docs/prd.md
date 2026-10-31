# Gaff MVP: product requirements

Draft, 31 October 2026 · Sean Conroy

## Summary

The Gaff MVP is an AI assistant that runs a whole letting, from the first Daft enquiry to a signed tenancy, for letting agents and landlords with several homes. People make the decisions that matter: who views, who is offered the home, and what is signed. Gaff does everything else, inside Irish law, and renters use it free.

- **Who pays:** independent letting agents and portfolio landlords, starting in Dublin. They pay per home let (€79, to test in pilots).
- **Who else uses it:** the landlord who approves the tenant, the renters who apply, and their referees.
- **What it replaces:** the shared inbox, spreadsheets, phone tag, Word forms and chasing by hand.
- **The promise to renters:** everyone hears back, books viewings easily, and shares documents only when they are the chosen applicant.
- **Status:** draft for Sean and Ann to agree before the build starts.

## Goals and success measures

The MVP exists to pass the three pilot tests in the pitch deck: it saves agents at least 3 hours per letting, lets homes at least 30% faster, and most pilot customers pay at least €50 per letting. The product is instrumented from day one to measure them.

| Measure | Target | How it is measured |
| --- | --- | --- |
| Agent time per letting | At least 3 hours less than today | Active time logged in Gaff, against each pilot's own baseline from interviews |
| Days from advert to signed tenancy | At least 30% fewer than today | First enquiry date to signature date, against each pilot's baseline |
| Willingness to pay | Most pilots pay at least €50 per letting | Paid invoices |
| Enquiries answered | 100%, first reply within 5 minutes | Message log |
| Applicants told the outcome | 100% | Every applicant has a final message |
| Viewing no-shows | Lower than each pilot's baseline | Booked versus attended |
| Wrong facts sent to renters | Zero; each one is an incident | Operator flags and weekly review |
| Unsuccessful applicants' data deleted on schedule | 100% | Retention job log |

## Users and jobs to be done

Four people touch a letting. Only the first pays; the renter's experience decides whether the agent looks good and whether Gaff's renter side grows.

| User | Who they are | Their job, in their words |
| --- | --- | --- |
| Letting operator (pays) | A letting agent's negotiator, or the person who lets homes for a portfolio landlord | "When I have a home to let, get a good tenant signed fast, with little of my time and no legal risk." |
| Landlord | The owner, when an agent lets for them | "Let my home at the right rent to someone reliable, and keep me in the loop without phone calls." |
| Renter (free) | Anyone who enquires about the home | "Give me a fair shot and a quick answer, without handing my documents to every agent." |
| Referee | A previous landlord or employer | "Let me answer a reference request in two minutes." |

The operator's job breaks into the steps the workflow follows:

1. Answer everyone who enquires, often hundreds of people per home in Dublin.
2. Pick who should view, fairly and lawfully.
3. Fill viewings without back-and-forth or no-shows.
4. Choose the best applicant and check them out: identity, affordability, references.
5. Get the landlord's approval, make the offer, and tell everyone else.
6. Sign the tenancy, take the deposit and first rent, and register with the RTB.
7. Keep a record they can stand over if challenged.

## Principles

Seven rules decide every product choice; when a feature breaks one, the feature changes.

1. **AI does the work; people decide.** Gaff asks for three decisions: who views, who is offered the home, and what is signed. It never rejects or chooses a tenant on its own.
2. **Compliance is the flow, not a setting.** Data is asked for in stages, criteria are applied the same way to everyone, and every step is logged.
3. **Alongside Daft.** Operators keep advertising exactly as they do now; Gaff starts when the enquiry email arrives.
4. **Gaff is software, not a letting agent.** The licensed agent, or the landlord letting their own home, runs the letting and makes every decision. Gaff never holds deposits or rent.
5. **Renters never pay.** Irish law bars seeking any payment to secure a tenancy beyond the deposit and first rent, so checks are paid for by the operator.
6. **The renter owns their profile.** Their details are shared with an operator only for a home they apply to, and documents only once they are the chosen applicant.
7. **Simple.** Every screen answers one question: what do I need to do now?

## The end-to-end workflow

A letting runs through nine stages. Renters share more only as they move forward, and documents are asked for only from the chosen applicant and one backup.

| Stage | What Gaff does | What a person decides | Renter data collected |
| --- | --- | --- | --- |
| 1. Set up | Takes the home's facts, criteria and viewing times; checks whether the rent can be reset to market under the 2026 rules | Operator confirms facts, rent and criteria | None |
| 2. Enquiries | Reads every Daft and MyHome enquiry, replies within minutes, answers questions from the facts, asks a few lawful questions | Operator answers anything Gaff can't | Name, contact details, self-declared answers (move-in date, length of stay, number of people, pets) |
| 3. Shortlist | Sorts enquirers against the criteria and says why | **Operator approves who is invited to view** | None new |
| 4. Viewings | Invites, lets renters book, sends reminders, fills cancellations from a waitlist | Operator shows the home | Booking time, attendance |
| 5. Applications | Invites viewers to apply; collects self-declared employment and income | **Operator and landlord choose a preferred applicant and a backup** | Self-declared employment and income |
| 6. Checks | Verifies identity and affordability, requests and chases references | Operator reviews the results | Verification results and references, preferred applicant and backup only |
| 7. Offer | Sends the landlord a one-page summary; sends the offer; tells every other applicant | **Landlord approves; renter accepts** | None new |
| 8. Tenancy set-up | Prepares the tenancy agreement for e-signing, the payment request, the rent-setting pack and the RTB registration pack | **Both sides sign**; operator confirms payment and submits the RTB registration | PPSN for RTB registration; signature |
| 9. Close | Deletes unsuccessful applicants' data on schedule, archives the letting record, reports time and days saved | None | Renter chooses whether to keep a Gaff profile |

## Requirements by stage

"Must" items are needed for one pilot letting to run end to end; "Should" items follow during the pilots.

| ID | Stage | Requirement | Priority |
| --- | --- | --- | --- |
| R1 | Set up | Operator creates a letting in under 10 minutes: address, rent, availability, key facts, photos link, viewing times | Must |
| R2 | Set up | Operator sets criteria from a fixed list of lawful options (move-in date, length of stay, maximum occupants, pets); free-text criteria are not allowed | Must |
| R3 | Set up | Rent check: Gaff asks how the last tenancy ended and the previous rent and date, then says whether market rent can be set or the 2%/CPI cap applies | Must |
| R4 | Set up | Operator records three comparable rents from the RTB Rent Register, kept for the rent-setting pack | Must |
| R5 | Enquiries | Each operator gets a Gaff address; one forwarding rule sends Daft and MyHome enquiry emails to it | Must |
| R6 | Enquiries | Gaff parses each enquiry (name, email, phone, message) and removes duplicates across portals | Must |
| R7 | Enquiries | First reply within 5 minutes, from the operator's own address, telling renters they are dealing with an AI assistant | Must |
| R8 | Enquiries | Replies answer only from the letting's facts; anything else goes to the operator, who answers once and Gaff reuses it | Must |
| R9 | Enquiries | Renter answers the pre-viewing questions on a mobile page, no account needed | Must |
| R10 | Shortlist | Gaff ranks enquirers against the criteria, then by enquiry time, and shows the reason for each position | Must |
| R11 | Shortlist | Operator approves invitations in one action; nobody is rejected without a person's approval | Must |
| R12 | Viewings | Booked slots or capped group viewings; renters self-book, reschedule or cancel | Must |
| R13 | Viewings | Email confirmation and reminders the day before and two hours before; SMS reminder | Must |
| R14 | Viewings | Cancellations are offered to the waitlist automatically | Must |
| R15 | Viewings | Operator marks attendance on a phone in one tap per person | Should |
| R16 | Applications | After a viewing, attendees get an apply link; the application reuses everything already given | Must |
| R17 | Applications | Operator sees applicants side by side and picks a preferred applicant and a backup | Must |
| R18 | Checks | Identity, affordability and reference checks run only for the preferred applicant and backup, with the renter's knowledge (see Checks) | Must |
| R19 | Offer | Landlord gets a one-page summary by link and approves or declines without an account | Must |
| R20 | Offer | The offer goes to the chosen renter with a deadline to accept; on expiry, the backup is offered | Must |
| R21 | Offer | Every other applicant gets a prompt, polite outcome message | Must |
| R22 | Tenancy set-up | Tenancy agreement generated from a solicitor-reviewed Gaff template or the operator's own, signed electronically by all parties | Must |
| R23 | Tenancy set-up | Payment request for the deposit and first rent, capped at the legal limits, paid directly to the landlord's or agent's account | Must |
| R24 | Tenancy set-up | Rent-setting pack (previous rent and date, three comparables) and RTB registration pack, with a reminder to register within the deadline | Must |
| R25 | Tenancy set-up | Move-in checklist and inventory with photos | Should |
| R26 | Close | Retention job deletes unsuccessful applicants' data and references on schedule | Must |
| R27 | All stages | One timeline per letting: every message, booking, decision and the criteria used; shareable read-only with the landlord | Must |
| R28 | All stages | Operator dashboard: each letting's stage, what needs a decision today, and time and days saved | Must |
| R29 | All stages | Approve-before-send mode, so operators can check AI messages during early pilots | Must |
| R30 | All stages | WhatsApp as a channel for renters | Should |
| R31 | All stages | Viewing times synced with Google or Microsoft calendars | Should |

## Checks on the chosen applicant

Gaff runs identity, affordability and reference checks, but only on the preferred applicant and one backup. The Data Protection Commission has found that collecting documents from every applicant before an offer is excessive, so this design is both lawful and lighter for renters.

| Check | How it works in the MVP | What Gaff keeps |
| --- | --- | --- |
| Identity | The renter photographs an ID document and takes a selfie; a verification provider confirms they match and the document is genuine | A "verified" result, the name and date of birth; not the document image |
| Affordability | Option A: the renter connects their bank read-only through open banking and the provider confirms regular income. Option B: the renter uploads recent payslips and Gaff reads them | Verified monthly income and the result against the operator's rule; not the bank statements |
| References | Gaff emails the previous landlord and employer a short form, chases twice, and flags if no answer | The answers, until the tenancy starts, then deleted |
| Guarantor | If affordability fails, the renter can add a guarantor, who goes through the same identity and affordability checks | As above |

**Fairness rules**

- The affordability rule is set by the operator, the same for everyone, and shown to the renter in advance.
- Housing Assistance Payment (HAP) and other housing supports count towards affordability. Refusing someone because they receive housing assistance is unlawful under the Equal Status Acts.
- A failed check is never an automatic refusal. It is shown to the operator with the reason, and the renter can explain or add a guarantor.
- No credit checks. Landlords cannot access the Central Credit Register, and a full credit report at this stage would very probably be excessive.

**The renter's side**

- Each check is explained before it starts: who sees the result and when it is deleted.
- Checks are free to the renter; the operator's fee per letting covers them.
- A renter who passes can keep the verified result in their Gaff profile and reuse it for the next home they apply for through Gaff. This is the seed of the renter side of the marketplace.

## Compliance requirements

Eight sets of rules shape the product. Each has a requirement above; a solicitor confirms them before the first pilot letting.

| Rule | What it means for Gaff |
| --- | --- |
| Data protection: staged collection ([DPC guidance](https://www.dataprotection.ie/en/dpc-guidance/requesting-personal-data-prospective-tenants), [DPC case study](https://dataprotection.ie/en/dpc-guidance/case-studies/general-accountability/complaint-excessive-personal-data-requested-letting-agent)) | Contact details and self-declared answers before an offer; documents and checks only for the chosen applicant; references deleted once the tenancy starts |
| Data protection: automated decisions (GDPR Article 22) | Gaff sorts and suggests; a person makes every decision about a renter |
| Equal Status Acts | No questions or criteria touching the protected grounds, including family status and housing assistance (HAP); criteria picked from a fixed lawful list |
| Payments to secure a tenancy | Nothing beyond the deposit and first month's rent may be sought, each capped at one month; renters are never charged, including for checks |
| Property services licensing (PSRA) | A service that vets, takes deposits and produces leases for a fee looks like letting agency; Gaff stays software operated by the licensed agent or the landlord, and never holds money |
| 2026 rent rules ([RTB](https://rtb.ie/?p=55320)) | Market rent only in set cases; otherwise the 2% or CPI cap. Setting rent needs three comparables from the [RTB Rent Register](https://rtb.ie/?p=55258) |
| RTB registration | Every new tenancy is registered with the RTB within a month of starting (deadline to confirm); Gaff prepares the pack and reminds |
| EU AI Act transparency | Renters are told they are dealing with an AI assistant |

## AI behaviour and guardrails

The AI writes almost every message, so one wrong fact or unfair sort damages the operator's reputation. These rules are tested before each release.

- **Facts only from the letting.** The AI answers from the facts the operator entered. If unsure, it says it will check and asks the operator.
- **Never decides.** It ranks and drafts; it does not reject, choose or make offers without a person's approval.
- **Blind to protected grounds.** It never infers or uses nationality, family status, housing assistance or any other protected ground, and never comments on names, photos or language.
- **Says it is an AI.** The first message says so, and a renter can always reach a person.
- **Enquiry text is untrusted.** Instructions written inside an enquiry are ignored.
- **Fixed wording where it matters.** Offer, outcome and check messages come from templates reviewed by a solicitor; the AI only fills in names and dates.
- **Every message logged.** The operator can see and correct what was sent, and corrections improve future answers.
- **Approve-before-send mode** for the first pilot lettings, switched off per operator once they trust it.
- **Plain, warm Irish English.** Short messages that say what happens next.

## Integrations and providers to evaluate

Gaff builds the workflow and buys the regulated or commodity parts. The candidates below are a shortlist to compare on price, Irish coverage and EU data handling; none is chosen yet.

| Need | Approach in the MVP | Candidates to evaluate |
| --- | --- | --- |
| Receiving enquiries | A Gaff inbound address per operator; parse Daft and MyHome email formats | Postmark, SendGrid, Mailgun |
| Sending email | From the operator's own domain once verified, otherwise a Gaff address | Same as above |
| SMS and WhatsApp | Viewing reminders by SMS; WhatsApp later | Twilio, Bird |
| Identity verification | Document and selfie check for the chosen applicant | Stripe Identity, Onfido, Veriff |
| Affordability | Read-only open banking income check, payslips as fallback | TrueLayer, Tink, Yapily, Plaid (check coverage of AIB, Bank of Ireland, PTSB and Revolut) |
| E-signature | Tenancy agreement signed by all parties | Dropbox Sign, DocuSign, Yousign |
| Payments | A payment request to the landlord's or agent's own account; Gaff never holds money | IBAN request first; open banking payment to the landlord's account later, after legal review |
| AI | Message drafting, ranking explanations, reading payslips | Claude via the API |
| Agents' software | Not in the MVP | Acquaint, Reapit and others, after pilots |

## Data model and non-functional requirements

The core objects mirror the workflow, and every change to them writes an event to the letting's record.

| Object | What it holds |
| --- | --- |
| Organisation | An agency or portfolio landlord; its users, sending domain, templates and affordability rule |
| Letting | One home to let: facts, rent check, comparables, criteria, viewing times, stage |
| Landlord | The owner's contact details and approvals |
| Renter profile | Owned by the renter: contact details, self-declared answers, verified results they chose to keep |
| Application | A renter's application to one letting, with its status at each stage |
| Message | Every inbound and outbound message, with sender, channel and whether the AI or a person wrote it |
| Viewing | Slot or group viewing, bookings, waitlist and attendance |
| Check | Identity, affordability or reference: provider, result, expiry and deletion date |
| Decision | Who decided what, when, and on which criteria |
| Tenancy pack | Agreement, signatures, payment request, rent-setting pack and RTB registration pack |
| Event | The append-only log behind the letting's record |

**Non-functional requirements**

- Data hosted in the EU, encrypted in transit and at rest, with role-based access per organisation.
- A data protection impact assessment completed before the first pilot letting.
- Retention periods enforced by scheduled jobs, not by hand.
- Renter pages work on a phone with no app and no account, and meet WCAG 2.2 AA.
- Operator screens work on a laptop and a phone.
- Enquiry intake never loses a message: failed parses are queued and shown to the operator.

## Out of scope for the MVP

These wait until the pilots prove agents will pay:

- Creating or posting adverts on Daft, MyHome or elsewhere
- A Gaff search site or marketplace for renters
- Answering phone calls
- Holding deposits or collecting rent
- Property management after move-in: maintenance, rent reviews, renewals
- Credit checks
- Native mobile apps
- Links to agents' own software
- Homes for sale
- Languages other than English

## Build order and pilot plan

The MVP is the whole workflow, built in four slices so a real letting can run through Gaff early, with people filling the gaps by hand at first.

1. **Slice 0, by hand:** one or two pilot agents. Their enquiries come to Gaff, the AI drafts and we approve every message; viewings, checks and paperwork are done by hand. Purpose: learn where the time goes and set each pilot's baseline.
2. **Slice 1, enquiry to viewing:** stages 1 to 4 automated (R1 to R15, R27 to R29).
3. **Slice 2, application to offer:** stages 5 to 7, including the checks (R16 to R21).
4. **Slice 3, tenancy set-up and close:** stages 8 and 9 (R22 to R26).

**MVP done** means one pilot letting runs from first enquiry to signed tenancy through Gaff, with no step done outside it.

**Pilot:** 3 to 5 paying operators and 50 or more lettings, then the go/stop tests in Goals. Timing is set once the founders agree their hours.

## Open decisions

For Sean and Ann:

- [ ] Which 3 to 5 operators run the pilots, and who goes first
- [ ] Price per letting for the pilots (€79 to test; €50 is the floor in the go/stop test)
- [ ] The default affordability rule offered to operators
- [ ] Providers for identity, open banking, e-signature, email and SMS
- [ ] Whether "Gaff" stays the name
- [ ] How many hours a week each of us puts in, which sets the timing

For a solicitor, before the first pilot letting:

- [ ] Can Gaff, as software operated by a licensed agent or a landlord, run every stage without a PSRA licence? Can any element (referencing, lease generation) be offered on its own?
- [ ] Gaff's data protection roles: processor for operators, controller for renter profiles, or both; and the impact assessment
- [ ] Lawful basis for renters keeping and reusing a verified profile
- [ ] Whether ranking enquirers against criteria, with a person approving, satisfies GDPR Article 22
- [ ] Whether open banking affordability checks at offer stage are proportionate
- [ ] Review of the criteria list, the offer and outcome templates, and the tenancy agreement template
- [ ] Collecting the PPSN for RTB registration, and the registration deadline

## Sources

- [DPC: Requesting personal data from prospective tenants](https://www.dataprotection.ie/en/dpc-guidance/requesting-personal-data-prospective-tenants)
- [DPC case study: excessive personal data requested by a letting agent](https://dataprotection.ie/en/dpc-guidance/case-studies/general-accountability/complaint-excessive-personal-data-requested-letting-agent)
- [RTB: Rental law changes from 1 March 2026](https://rtb.ie/?p=55320)
- [RTB: Setting and reviewing private rents](https://rtb.ie/renting/setting-and-reviewing-private-rents/)
- [RTB Rent Register](https://rtb.ie/?p=55258)
- [Daft support: contacting advertisers](https://support.daft.ie/hc/en-ie/articles/360003993957-Searching-for-Property)

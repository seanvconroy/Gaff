# 11. Compliance check and vendors

Part of the [UX redesign PRD](README.md). The first table shows how each legal and product constraint is kept in the new design. The second shows where the founder's feedback met a constraint and what was decided. The third lists every vendor the design needs and where its approval stands. The fourth is what has to be true before real users.

The redesign changes how things work. It changes none of the product rules in `CLAUDE.md`, and each rule's mechanism in the code and its test stay.

## How each constraint is kept

| Constraint | How the redesign keeps it | Requirements | Mechanism that stays |
| --- | --- | --- | --- |
| **People make every decision** (GDPR Article 22) | The three decisions are three focused flows, each ending in "Check and send" pressed by a person. Gaff pre-ticks and pre-fills; nothing goes until a person confirms. AI never ranks, scores or recommends a person, even when asked. Not fitting never removes anyone | UX-DC-2, UX-DC-6, UX-DC-12, UX-DC-20, UX-MT-8, UX-MT-17, UX-MT-18, UX-AI-6, UX-RN-4 | `PersonDecision`, created only in `src/server/decisions` from a signed-in member (ADR-0007) |
| **No protected grounds** (Equal Status Acts) | Criteria stay the fixed four, with no free text anywhere an operator describes who they want. Gaff writes the Letting details line itself. Search and "ask who fits" use fixed fields only, and discard the rest. A renter's profile has no photo and no free text, and no operator can browse profiles. References have no free text. An owner's decline takes no written reason | UX-LT-6, UX-LT-11, UX-MT-1 to 5, UX-MT-12, UX-SR-4, UX-SR-7, UX-AV-5, UX-PF-4, UX-LP-15, UX-RF-3, UX-OP-8, UX-AI-7 | The strict criteria schema; the protected-ground check on facts and answers; ranking that reads only answers and enquiry time (ADR-0008) |
| **Fair advertising** (Equal Status Acts, section 12). New, because Gaff now shows homes to the public | A home's page is built from facts and the four criteria. Its description is checked for wording about who should apply before it's public. Nothing in Gaff is labelled "who it suits". Anyone can report a listing | UX-LS-5, UX-LS-6, UX-MT-3, UX-MT-4, UX-TS-3, UX-TS-4 | The protected-ground check, extended to descriptions |
| **HAP counts as income; assistance dogs aren't pets** | The income question tells renters to include housing support and never asks whether they receive it. "Assistance dogs always welcome" is part of the pets line renters see | UX-RN-12, UX-LT-11, UX-MT-3 | The fixed lawful answers (Q7); Q17 |
| **Staged data** (DPC guidance) | Asking to view collects a name, an email and the answers to that home's questions, and nothing more. The renter's path table lists what each later stage collects. Documents and checks only for the chosen applicant and backup. The PPS number is one optional step, for the RTB only | UX-AV-4, UX-RN-1, UX-RN-14 to 18, UX-RN-24, UX-LP-9, UX-DC-7 | Staged collection in the use cases (ADR-0005) |
| **A renter's profile is theirs** | A profile holds only what the renter chose to keep, and Gaff is its controller. An operator sees a renter only through an enquiry to their home, and only what that stage collects. Kept details are offered back to the renter to confirm before anything is sent | UX-AC-3, UX-AC-5, UX-PF-1 to 7, UX-MT-14, UX-MT-15 | Q25: profiles are separate from the operator's copy |
| **A verified identity** (Q35) | Checked the first time a step needs it, never before. Kept only by choice. Gaff keeps the result, the name and the date: no image, document details, country or date of birth. Shared with an operator only at the checks stage, with the renter's yes each time. Nobody can see who's verified before choosing | UX-PF-8 to 14, UX-TS-2 | Sealed results (ADR-0005); no date of birth (Q19) |
| **Retention** | Unchanged for the operator's copy: deleted on schedule, and each closed page says when. A profile lasts while the renter wants it, or two years unused. Deleting a profile is immediate. Searches aren't kept unless saved | UX-RH-5, UX-PF-6, UX-PF-7, UX-SR-11, UX-TN-5 | The retention job (R26) |
| **Renters never pay** | No renter page has a fee, a paid option or a payment field. Search results can't be bought. The offer says "No other fees". Checks are free | UX-RN-19, UX-SR-7, UX-LS-4 | The deposit and first-rent caps in the domain rules |
| **Gaff never holds money** | The payment page shows the lister's own account and a number to ring to check it. Changing that account needs re-confirmation. Gaff is free in the pilot and takes no payment at all | UX-RN-22, UX-RN-23, UX-TN-2, UX-SI-10, UX-TS-6 | No payment integration receives funds |
| **Gaff is software, not a letting agent** (PSRA) | A home is always listed and let by a licensed agency or by its own landlord. An agency's licence is matched to the register and re-checked weekly. Gaff's team can confirm an agency and hide a reported listing; they never run a letting or approve a message | UX-AG-1 to 7, UX-TS-1, UX-TS-5 | Q13: Gaff staff never approve or send |
| **AI disclosure** (EU AI Act) | The first message says it's an AI assistant, and so does the screen that confirms an enquiry made on Gaff. Every answer the assistant writes is marked. "Talk to a person" is on every page | UX-PP-3, UX-AI-1, UX-AI-2, UX-AV-7 | The first-reply template |
| **Grounded answers; fixed templates** | Replies come only from the home's facts. Import never invents a value and shows its source. First replies, invitations, offers, outcomes and check messages keep their fixed, reviewed wording; the redesign changes layout only | UX-AI-3 to 5, UX-AI-10, UX-DC-6, UX-PP-10 | Fact IDs checked by guardrails; templates in `src/copy/templates` |
| **Untrusted text; no personal details to the model** | Pasted adverts, uploads, renters' searches and questions are information, never instructions. Names and contact details are stripped first | UX-LT-7, UX-AI-8, UX-AI-9 | Redaction before model calls |
| **Every step logged, with no personal data in the log** | Funnel events hold IDs, codes, numbers and dates only. A search's web address holds filters and nothing personal. Today's rows show a first name at most | UX-ME-1, UX-HM-10, UX-SR-12 | The event payload check (ADR-0006) |
| **Approved vendors only** | Every vendor and new use is in the table below, with where its approval stands | The vendor table | Rule 10; Q26 |
| **Portal terms** | Gaff doesn't fetch pages from Daft or MyHome. Import works from what the operator pastes, describes, uploads or is emailed, or from a home Gaff already holds | UX-LT-8, UX-LT-23; [import routes](04-operator-flows.md#the-import-route-and-portal-terms) | None yet; this is new |
| **Accessibility** | WCAG 2.2 AA on every screen in both themes; 44px targets; 48px controls; 16px minimum on renter pages; drag always has a button; sheets and pickers work by keyboard | UX-PP-4, UX-DS-15, UX-DS-17, UX-DS-21 | axe in every end-to-end test; contrast tests on tokens |
| **Renters need no account** | Searching, asking to view and every later step work with no account. A profile is offered and never required | UX-AC-3, UX-AV-1, UX-SR-11, UX-PP-8, UX-RF-5 | Private links with hashed tokens (ADR-0013) |

## Where the feedback met a constraint

In each case the intent was kept and the closest lawful version designed.

| The feedback | The constraint | What was decided | Record |
| --- | --- | --- | --- |
| Letters say who they're looking for: "a working couple", "college students only" | Equal Status Acts; section 12 on advertising | Matching on the home and the terms of the let. Objective fit, never a recommendation | Q36 |
| One click: paste a link and see a complete letting | Daft's and MyHome's terms on automated access | No fetching. The same result from pasted text, an upload, the first enquiry, or letting a home again | Q31 |
| Once verified, always verified | Staged data: identity only for the chosen applicant and backup | Verified the first time a step needs it, then kept and reused with no expiry. Never asked for early; never visible before choosing | Q35 |
| Familiar sign-in: Google, Apple | Approved vendors only | Approved | Q30 |
| Find the agency's licence from its name | The register names individuals | Gaff keeps the business entries only | Q39 |
| Fewer disclaimers | Some lines are required by law at the moment of collection | Four one-line notices on the renter's whole path; everything else behind a link | Q46 |
| A full renter side in the MVP | Gaff becomes a publisher of adverts | The fair-advertising row above; reporting a listing; verified listers | Q27, Q47 |

## Vendors

A vendor needs the founders' approval, a signed data processing agreement where it processes data for Gaff, an EU region where one exists, and a named transfer basis for anything outside the EU (rule 10). The build never waits for a vendor: each sits behind an interface with a local stand-in, as email, SMS and AI do today.

| Vendor | What for | Data it touches | Status | Still to do |
| --- | --- | --- | --- | --- |
| **Google** (Sign in with Google) | Sign-in | Account ID, email, name | **Approved** (Q30) | Create the sign-in credentials. Name it in the privacy notice |
| **Apple** (Sign in with Apple) | Sign-in | Apple ID; email and name at first sign-in only | **Approved** (Q30) | An Apple developer account; register Gaff's sending domain so "Hide My Email" addresses can be reached. Name it in the privacy notice |
| Passkeys | Sign-in | A public key per device, in Gaff's own database | No vendor | |
| **Resend** | The six-digit sign-in code; alerts for saved searches | Email address | Approved. New uses | |
| **Autoaddress** | Address search when adding a letting | The address typed. A private landlord's own address can be personal data | **Chosen** (Q40) | Sign its DPA; confirm in writing where it's hosted. Loqate is the fallback |
| **Supabase Storage** (Ireland) | Photos of homes | Photos of homes; no personal data intended | Approved vendor. New use | Files rest in Ireland and are served through a worldwide content network, which suits public photos. Never use this path for identity documents or anything personal |
| **Claude on Amazon Bedrock** (EU) | Reading adverts; turning a search or a question into filters | The operator's own advert; a renter's search words; an operator's question | Approved. New uses | Names and contact details are stripped first. Search words aren't stored. Add the new uses to the DPIA |
| **Veriff** | The identity check: chosen applicants, and private landlords before going live | ID document and selfie, at the provider. Gaff receives the result and the name | **Recommended** (Q48) | Founders confirm. Get EU hosting in writing; sign its DPA. The build uses the stand-in until then. Never ask for a Public Services Card: only bodies named in law may |
| An open banking provider | The income check | Read-only bank data, at the provider | Pending, on the launch checklist | Unchanged by the redesign |
| **Sinch** | Text reminders | Mobile number | Approved. Unchanged | |
| The PSRA register | Finding an agency's licence | A public register | Public source, not a vendor | Keep business entries only; credit the PSRA (Q39) |
| OpenStreetMap | Gaff's list of Irish places; the map | Open map data, held by Gaff | Open data, not a vendor | Credit "© OpenStreetMap contributors". No renter's search leaves Gaff. Confirm it's practical to serve the map ourselves ([OQ-7](12-phasing-and-decisions.md#still-open)) |
| The RTB Rent Register | Finding comparable rents | A public register | To find out ([OQ-2](12-phasing-and-decisions.md#still-open)) | Use it only if its terms allow software to read it |
| Product analytics | None | | **Not added** | Funnels run on Gaff's own events (UX-ME-2) |

### Later, each needing approval then

| Vendor | What for |
| --- | --- |
| Google Calendar and Microsoft 365 | Two-way calendar sync (R31) |
| Microsoft | "Continue with Microsoft" |
| Browser push services | Notifications from an installed app |
| A WhatsApp provider | WhatsApp as a channel (R30) |
| Stripe | Charging operators, once there's a price (Q33) |
| The EU Digital Identity Wallet | Another way to verify once. Not open to private businesses in Ireland yet |

## Before real users

None of this holds up the build. All of it has to be done before a real renter's details enter Gaff. It is also on [`docs/launch-checklist.md`](../launch-checklist.md).

### For the solicitor

| # | Question |
| --- | --- |
| 1 | Terms of use for both sides: operators and renters. They carry what the screens no longer say, such as only uploading photos you may use, and a landlord letting their own home |
| 2 | The privacy notice: Gaff as controller for profiles, saved searches and verified identities, and as processor for an operator's applications. Google and Apple named |
| 3 | The matching design (Q36), with the criteria list (Q9) |
| 4 | A home's public page: what an advert for a home to rent must show, including the BER, and whether the wording check is enough |
| 5 | What a small platform that hosts other people's listings must offer under the EU Digital Services Act: a way to report a listing, a contact point, and reasons when one is taken down |
| 6 | Whether showing homes to the public changes Gaff's position under the PSRA, given every home is listed by a licensed agency or by its own landlord |
| 7 | The consent wording for keeping and reusing an identity check and an income result (Q35) |
| 8 | Identity checks for private landlords: the lawful basis, and what "Identity verified" may claim (Q47) |
| 9 | Agents' own PSRA licences (Q38) |
| 10 | The DPIA, updated for all of the above |

### For the founders

| # | To do |
| --- | --- |
| 1 | Google sign-in credentials; an Apple developer account |
| 2 | Autoaddress: an account, a signed DPA, hosting confirmed |
| 3 | Veriff, if confirmed: an account, a signed DPA, EU hosting confirmed |
| 4 | An open banking provider for income checks |
| 5 | The gaff.ie domain, for the site, the inbound addresses and sending |
| 6 | Everything already on the launch checklist |

## Sources for the legal points in this PRD

These are the public sources the design relies on. They were gathered by web search on 14 November 2026. Not every page could be opened from the build environment, so each is on the solicitor's list above before it's relied on.

| Point | Source |
| --- | --- |
| Section 12 of the Equal Status Act: advertising | [Revised Acts](https://revisedacts.lawreform.ie/eli/2000/act/8/revised/en/html) |
| The 2019 WRC decision on discriminatory rental adverts on Daft | [IHREC](https://www.ihrec.ie/news-press/human-rights-and-equality-commission-uses-legal-powers-in-successful-challenge-of-daft-ie-discriminatory-rental-adverts); [Law Society Gazette](https://www.lawsociety.ie/gazette/top-stories/2019/08-august/rental-ads-can-no-longer-specify-preferred-tenants-as-ihrec-wins-equality-case) |
| Examples of discriminatory wording | [IHREC: discrimination in housing](https://www.ihrec.ie/factsheets/discrimination-in-housing) |
| What may be asked before a viewing | [DPC guidance](https://www.dataprotection.ie/en/dpc-guidance/guidance-collection-personal-data-prior-viewing-property) |
| What may be asked before an offer | [DPC guidance](https://www.dataprotection.ie/en/dpc-guidance/requesting-personal-data-prospective-tenants) |
| Daft's terms on automated access, and advertisers owning their adverts | [Daft terms of use](https://www.daft.ie/legal/); [Daft terms for advertisers](https://support.daft.ie/hc/en-ie/articles/360017985818-Terms-and-Conditions-for-Advertisers) |
| The PSRA register and its re-use terms | [PSRA register](https://www.psr.ie/psra-registers/register-of-licensed-property-services-providers/); [re-use of public sector information](https://www.psr.ie/re-use-of-public-sector-information/) |
| Eircode licensing | [Eircode pricing and licensing](https://www.eircode.ie/files/eircode-pricing-information.pdf) |
| Supabase Storage: where files are kept and served from | [Supabase docs](https://supabase.com/docs/guides/storage/cdn/fundamentals) |
| A BER on every advert; a small platform's duties under the Digital Services Act | Not yet checked against a source. Items 4 and 5 on the solicitor's list |

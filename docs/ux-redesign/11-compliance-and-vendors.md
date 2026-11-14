# 11. Compliance check and new vendors

Part of the [UX redesign PRD](README.md). The first table shows how each legal and product constraint is kept in the new design. The second shows where the founder's feedback met a constraint. The third lists every new vendor or new use of a vendor.

The redesign changes how things work. It changes none of the product rules in `CLAUDE.md`, and each rule's mechanism in the code and its test stay.

## How each constraint is kept

| Constraint | How the redesign keeps it | Requirements | Mechanism that stays |
| --- | --- | --- | --- |
| **People make every decision** (GDPR Article 22) | The three decisions are three focused flows, each ending in "Check and send" pressed by a person. Gaff pre-ticks and pre-fills; nothing goes until a person confirms. AI never ranks, scores or recommends a person. Not fitting never removes anyone | UX-DC-2, UX-DC-6, UX-DC-12, UX-DC-20, UX-MT-8, UX-AI-6, UX-RN-4 | `PersonDecision`, created only in `src/server/decisions` from a signed-in member (ADR-0007) |
| **No protected grounds** (Equal Status Acts) | Criteria stay the fixed four, with no free text anywhere an operator describes who a home suits. Gaff writes the "This home suits" line itself. Unlawful wording in imports is left out with a reason. A renter's sentence is reduced to fixed fields and the rest discarded. References have no free text. An owner's decline takes no written reason | UX-LT-6, UX-LT-11, UX-MT-1 to 5, UX-MT-12, UX-RF-3, UX-OP-8, UX-AI-7 | The strict criteria schema; the protected-ground check on facts and answers; ranking that reads only answers and enquiry time (ADR-0008) |
| **HAP counts as income; assistance dogs aren't pets** | The income question tells renters to include housing support and never asks whether they receive it. "Assistance dogs are always welcome" sits under the pets criterion on both sides | UX-RN-12, UX-LT-11, UX-MT-3 | The fixed lawful answers (Q7); Q17 |
| **Staged data** (DPC guidance) | The renter's path table lists what each stage collects, and no page asks for more. Documents and checks only for the chosen applicant and backup. A person's sheet shows only what their stage has collected. The PPS number is one optional step, for the RTB only | UX-RN-1, UX-RN-14 to 18, UX-RN-24, UX-LP-9, UX-DC-7 | Staged collection in the use cases (ADR-0005) |
| **A renter's profile is theirs** | The profile is opt-in. An operator sees kept details only through an application to their home, and identity, income and references only for the chosen applicant, with the renter's yes each time. Operators can't search renters or see who has a verified identity before choosing | UX-AC-3, UX-AC-5, UX-MT-14, UX-MT-15, UX-RN-19 | Q25: Gaff is controller for profiles; the operator's copy is separate |
| **Retention** | Unchanged. Closed pages tell each person when their details go. The operator's copy is deleted on schedule. A profile lasts while the renter wants it, or two years unused | UX-PP-5, UX-TN-5 | The retention job (R26) |
| **Renters never pay** | No renter page has a fee, a paid option or a payment field. The offer states there are no other fees. Checks are free and say so | UX-RN-20, UX-RN-16 | The deposit and first-rent caps in the domain rules |
| **Gaff never holds money** | The payment page shows the operator's own account, with the agency's phone number to confirm it. Nothing is paid through Gaff. Changing that account needs re-confirmation | UX-RN-23, UX-TN-2, UX-SI-10 | No payment integration receives funds |
| **Gaff is software, not a letting agent** (PSRA) | An agency's licence is confirmed before its first letting goes live and re-checked weekly. A private landlord confirms they're letting for themselves. Gaff staff confirm that an agency is who it says; they never run a letting or approve a message | UX-AG-1 to 7; [what a person needs](02-accounts-and-sign-in.md#what-a-person-needs-and-when) | Q13: Gaff staff never approve or send |
| **AI disclosure** (EU AI Act) | The first message says it's an AI assistant. Every private page says so in its top line. "Talk to a person" is on every page | UX-PP-3, UX-AI-1, UX-AI-2 | The first-reply template |
| **Grounded answers; fixed templates** | Replies come only from the home's facts. Import never invents a value and shows its source. First replies, invitations, offers, outcomes and check messages keep their fixed, reviewed wording; the redesign changes layout only | UX-AI-3 to 5, UX-AI-10, UX-DC-6, UX-PP-10 | Fact IDs checked by guardrails; templates in `src/copy/templates` |
| **Untrusted text; no personal details to the model** | Pasted adverts, uploads and renters' sentences are information, never instructions. Names and contact details are stripped first | UX-LT-7, UX-AI-8, UX-AI-9 | Redaction before model calls |
| **Every step logged, with no personal data in the log** | Funnel events hold IDs, codes, numbers and dates only. Today's rows show a first name at most, and never contact details | UX-ME-1, UX-HM-10 | The event payload check (ADR-0006) |
| **Approved vendors only** | Every new vendor and new use is in the table below, each marked as needing approval. Nothing here assumes approval | The vendor table | Rule 10; Q26 |
| **Portal terms** | Import works from what the operator pastes, describes, uploads or is emailed. Gaff doesn't fetch portal pages. A pasted link is kept only to match enquiries | UX-LT-8; [import routes](04-operator-flows.md#the-import-route-and-portal-terms) | None yet; this is new |
| **Accessibility** | WCAG 2.2 AA on every screen in both themes; 44px targets; 48px controls; 16px minimum on private pages; drag always has a button; sheets and pickers work by keyboard | UX-PP-4, UX-DS-15, UX-DS-17, UX-DS-21 | axe in every end-to-end test; contrast tests on tokens |
| **Renters need no account** | Every renter, owner and referee step works from a private link. A profile is offered and never required | UX-AC-3, UX-PP-8, UX-RF-5 | Private links with hashed tokens (ADR-0013) |

## Where the feedback met a constraint

In each case the intent is kept, the closest lawful version is designed, and the point is on the list for the founders or the solicitor.

| The feedback | The constraint | What the redesign does | Open question |
| --- | --- | --- | --- |
| Letters say who they're looking for: "a working couple", "college students only" | Equal Status Acts; section 12 on advertising | Matching on the home and the terms of the let. A table of each example and its lawful version | OQ-1 |
| One click: paste a link and see a complete letting | Daft's and MyHome's terms on automated access | The same result from pasted text, an upload or the first enquiry email. Link fetching held | OQ-6 |
| Anything done once is stored on the profile and never repeated, including identity | Staged data: identity only for the chosen applicant and backup | A renter can keep a result they've already had to give. It's offered to an operator only at the checks stage, with their yes. Operators never see who's verified before choosing | OQ-8 |
| Familiar sign-in: Google, Apple | Approved vendors only | Designed in, and listed for approval. Email code and passkeys need no new vendor and can ship first | OQ-3 |
| Find the agency's licence from its name | The register names individuals, so a copy is personal data | Keep business entries only; acknowledge the source; add to the DPIA | OQ-7 |
| Guide owners and renters towards Gaff (growth loops) | Agencies must trust Gaff with their clients; contact details are for the letting only | One footer line. No prompts to owners or referees | OQ-15 |
| A renter-facing side | The current PRD rules out a renter marketplace for the MVP | Presented as a scope decision with phases, not built in | D-1 |

## New vendors and new uses

Nothing below is approved by being in this document. Each needs the founders' approval, a signed data processing agreement where the vendor processes data for Gaff, an EU region where one exists, and a named transfer basis for anything outside the EU (rule 10).

| Vendor | What for | Data it touches | Phase | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| **Google** (Sign in with Google) | Sign-in | A user's Google account ID, email, name | 1 | **New. Needs approval** | Google acts as its own controller for its sign-in service; Gaff is controller of what it receives. Name it in the privacy notice. Confirm Google's terms for this with the solicitor |
| **Apple** (Sign in with Apple) | Sign-in | A user's Apple ID, and email and name at first sign-in only | 1 | **New. Needs approval** | Needs an Apple developer account. Users can hide their email; Gaff's sending domain must be registered with Apple to reach relay addresses |
| Passkeys | Sign-in | A public key per device, in Gaff's own database | 1 | No vendor | Through the existing sign-in library |
| **Resend** | The six-digit sign-in code | Email address | 1 | Approved. New use | Replaces the sign-in link it already sends |
| **An Eircode address provider** (recommended: Autoaddress) | Address search when adding a letting | The address typed. A private landlord's own address can be personal data | 1 | **New. Needs approval** | Eircode data must come through a licensed provider. Autoaddress is Irish and on Eircode's provider list, at about €0.20 a lookup. Its hosting region and DPA are to be confirmed before approval. Loqate is the alternative |
| **Supabase Storage** (Ireland) | Hosting photos of homes | Photos of homes; no personal data intended | 1 | Approved vendor. New use | Files are stored in Ireland. Supabase serves them through a worldwide content network, which is acceptable for photos of homes that are shown to renters anyway. Never use this path for identity documents or anything personal |
| **Claude on Amazon Bedrock** (EU) | Reading adverts, brochures and screenshots into a letting | The operator's own advert text and files | 1 | Approved. New use | Text is stripped of names and contact details first. Uploaded files may carry the agent's own business contact details; cover this in the DPIA |
| The PSRA register | Finding an agency's licence | A public register that names licence holders | 1 | Public source, not a vendor | The PSRA allows re-use if reproduced accurately and acknowledged. Gaff keeps business entries only |
| An identity verification provider | The ID check on the chosen applicant | ID document and selfie, at the provider | 1 | **Already pending** on the launch checklist | The redesign adds nothing. Keeping a result for reuse (Phase 2) is done in Gaff and needs no extra vendor feature. Never ask for a Public Services Card: only bodies named in law may |
| An open banking provider | The income check | Read-only bank data, at the provider | 1 | **Already pending** on the launch checklist | Unchanged |
| **Sinch** | Text reminders | Mobile number | 1 | Approved. Unchanged | |
| **Google Calendar and Microsoft 365** | Showing busy times and adding viewings to the operator's calendar (R31) | The operator's calendar entries | 2 | **New. Needs approval** | Phase 1 offers a calendar file to download, which needs no vendor |
| **Microsoft** (Continue with Microsoft) | Sign-in | Account ID, email, name | 2 | **New. Needs approval** | Only if pilot data shows the need |
| Browser push services (Apple, Google, Mozilla) | "Needs you" notifications for an installed web app | A device token; the notification's text | 2 | **New. Needs approval** | Keep renter names and message text out of notifications |
| A WhatsApp provider | WhatsApp as a channel for renters (R30) | Phone number, message text | 2 | **New. Needs approval** | Already a "Should" in the PRD |
| **Stripe** | Charging operators | The operator's card or bank details | After the pilots | Approved for this use only | Not for identity checks without a new approval |
| A map provider | A map of homes in renter search | Search area | 3 | **New. Needs approval** | "Get directions" in Phase 1 opens the phone's own maps app and needs no vendor |
| The EU Digital Identity Wallet | A reusable identity | A verified identity, presented by the person | 3, watch | Not available to private businesses yet | Ireland's wallet was in pilot in 2026. Check its state before Phase 3 |
| Product analytics | None | | | **Not added** | Funnels run on Gaff's own events (UX-ME-2) |

## Sources for the legal points in this PRD

These are the public sources the design relies on. They were gathered by web search on 14 November 2026; the pages themselves could not all be opened from the build environment, so each should be checked by the solicitor before it is relied on.

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

# Launch checklist: first pilot letting

Everything that has to be true before a real renter's details enter Gaff. The code side is tracked in [status.md](status.md). This list covers what code can't do on its own: accounts, legal sign-off and operations.

## Founders

- [ ] Register gaff.ie and point it at Gaff (for the site, the inbound addresses and sending) (Q29)
- [ ] Get 3 to 5 real Daft and 3 to 5 MyHome enquiry emails, with the personal details changed, to confirm the parsers
- [ ] Pick the first pilot operator(s)
- [x] Price per letting for the pilots: free (Q33)
- [ ] Confirm two decisions made for you: private landlords verify their identity before their first home goes live (Q47), and Veriff for identity checks (Q48)
- [ ] Confirm that a private landlord's identity is kept at their first go-live without the "Keep this?" question a renter gets (Q47): their homes can't stay on gaff.ie without it. "Confirm it's you" says, before the check, that Gaff keeps the result, the name and the date so they aren't asked again, and that deleting their profile removes it and takes their homes off gaff.ie
- [ ] Confirm two places where the redesign's PRD disagrees with itself, each built one way: the results screen's one next action is "Send the owner the summary" first (UX-TN-6), not "Add your next letting" (section 9's table); and the reference form is one screen (section 5), not one question per screen
- [ ] Run the current flows on the test copy, open `/internal/funnels`, and copy the numbers into the note at the end of section 9 as baselines
- [ ] Check the forwarding steps for Gmail and Outlook (`/forwarding`) against the live settings screens
- [ ] Replace the hand-made list of places search knows (26 counties, Dublin's districts, about 150 towns and 90 neighbourhoods) by running `scripts/places/build-places.ts` against OpenStreetMap, which couldn't be reached from the build

## Accounts (founders create; CTO wires in)

- [ ] **Vercel (Pro):** a production project with Gaff's domain; functions in Dublin (`dub1`, set in `vercel.json`). Sign the DPA ([deploy.md](deploy.md), Q26).
- [ ] **Supabase:** a production project in West EU (Ireland), on a paid plan with point-in-time recovery; Data API off; Enforce SSL on. Sign the DPA.
- [ ] **AWS:** account with Amazon Bedrock access to Claude through the EU geographic inference profile; invocation logging off. Sign the DPA.
- [ ] **Resend:** sending domain in `eu-west-1` with SPF and DKIM, open and click tracking off; receiving on the inbound subdomain (MX record); `email.received` webhook to `/api/inbound/resend`. Sign the DPA (data is stored in the US under the Data Privacy Framework, Q26). Mailgun EU remains an alternative.
- [ ] **Sinch:** EU region SMS account; check Irish sender ID rules. Sign the DPA.
- [ ] **Google and Apple sign-in (approved, Q30):** Google sign-in credentials; an Apple developer account, with Gaff's sending domain registered so "Hide My Email" addresses can be reached. Name both in the privacy notice.
- [ ] **The PSRA register (Q39):** check the reader against the real download from psr.ie, then set `PSRA_REGISTER_SOURCE=url` and `PSRA_REGISTER_URL` ([deploy.md](deploy.md), "The PSRA register"). Read the PSRA's re-use terms and check the credit shown where an agency is picked. Add Gaff's copy of the register to the DPIA: it names sole traders, who are people.
- [ ] **Confirming agencies (Q32):** set `STAFF_EMAILS` to the founders' addresses. Agencies that sign up by themselves wait at `/internal/agencies` for one press of Confirm; pilot agencies are set up there, confirmed, with their first admin's invitation.
- [ ] **Autoaddress (chosen, Q40):** an account, a signed DPA, and where it's hosted, in writing. Until then people type the address.
- [ ] **ID checks:** Veriff is recommended (Q48). Confirm it, get EU hosting in writing, sign the DPA, and add its adapter. Private landlords now need this check before their first home goes live (Q47), as well as chosen applicants.
- [ ] **Income checks:** choose an open banking provider (for example TrueLayer, Tink or Yapily, checking AIB, Bank of Ireland, PTSB and Revolut coverage), sign the DPA, and add its adapter. Until both exist, production runs with `IDENTITY_PROVIDER=none` and `INCOME_PROVIDER=none`, and operators arrange those checks themselves.
- [ ] **GitHub:** push access and Actions enabled for CI.
- [ ] **Search indexing:** set `SEARCH_INDEXING=on` in production only, so search engines may find live homes' pages. Leave it off on the test copy and on preview deployments ([deploy.md](deploy.md)).
- [ ] **The RTB's Rent Register (OQ-2):** whether software may read it. Until it's settled, people type three comparable rents themselves.

## Solicitor (before the first pilot letting)

- [ ] PSRA: can Gaff run every stage as software operated by a licensed agent or a landlord?
- [ ] Data protection roles (processor for operators; controller for opt-in renter profiles, Q25) and the DPIA
- [ ] Transfers outside the EU: the privacy notice names Vercel, Supabase and Resend and the transfer basis (Data Privacy Framework or standard contractual clauses, Q26)
- [ ] Article 22: ranking with a person approving
- [ ] Retention periods: 30 days for personal details after the letting closes, 12 months for the anonymous decision record (open question Q3)
- [ ] Rent-check rule table (Q8): `src/domain/rent/rent-check.ts` cites its sources
- [ ] Criteria list, pets wording and assistance-dog rule (Q9)
- [ ] Fixed answers on protected grounds (Q7)
- [ ] Message templates in `src/copy/templates/`: first reply (with AI disclosure), holding message, invitation, waiting list, booking confirmation, reminders (email and SMS), place offered, letting closed, and later offer and outcome
- [ ] The new email wordings from the redesign, each pinned by a test so it can't change unnoticed: the email that sends an owner their link (`src/copy/templates/owner.test.ts`); a saved search's confirmation and its alert (`src/copy/saved.test.ts`); and the two emails to a lister about a listing taken off gaff.ie and put back (`src/copy/trust-emails.test.ts`)
- [ ] Reports of a listing: deleted six months after Gaff's team answers them, and the reporter, who gives no contact details, is never told the outcome
- [ ] "Stop taking enquiries" (UX-LP-5) needs a new fixed message to everyone who enquired; it isn't built until the wording is agreed
- [ ] Privacy notice for renters (GDPR Article 14), now also covering Gaff as controller for profiles, saved searches and verified identities (Q25, Q35), and naming Google and Apple
- [ ] Terms of use for both sides: operators and renters (they carry what the screens no longer say, Q46)
- [ ] The matching design: objective fit, the Letting details line, "No smoking indoors", asking who fits (Q36)
- [ ] A home's public page: what an advert for a home to rent must show, including the BER, and whether the wording check is enough
- [ ] What a small platform that hosts other people's listings must offer under the EU Digital Services Act: a way to report a listing, a contact point, reasons when one is taken down
- [ ] Whether showing homes to the public changes Gaff's position under the PSRA
- [ ] Consent wording for keeping and reusing an identity check and an income result (Q35); the basis for private landlords' identity checks and what "Identity verified" may claim (Q47)
- [ ] Agents' own PSRA licences (Q38)
- [ ] Collecting the PPSN for RTB registration (optional, sealed, deleted once registered; no date of birth, Q24), and the registration deadline
- [ ] Gaff’s standard tenancy agreement wording (`src/copy/templates/tenancy-agreement.ts`), and whether it can be signed electronically or must be signed on paper (Electronic Commerce Act 2000, s.10(1)(b); Q23)

## Operations

- [ ] DPIA completed
- [ ] Retention job running in production (daily, 02:30 UTC), with its log checked: personal details on their date, references at tenancy start, the anonymous record after 12 months
- [ ] `DATA_ENCRYPTION_KEY` set in production (32 random bytes, base64), and stored safely: check results and PPS numbers can’t be read without it
- [ ] `DATABASE_CA_CERT` set in production, so the database's certificate is checked
- [ ] The job tick running every minute (Supabase, Integrations, Cron: `gaff-tick`), and the daily call (`gaff-daily`, and Vercel's daily cron), with `CRON_SECRET` set
- [ ] Backups: a restore tested from point-in-time recovery
- [ ] Error alerts going to a founder
- [ ] Test copy on Vercel and Supabase ([deploy.md](deploy.md)), made-up details only
- [ ] Approve-before-send on for the pilot operator
- [ ] Gaff's internal page open to named founders only; a founder confirms each agency that signs up by itself, before its first home goes live (Q32)
- [ ] Reports of a listing answered within one working day

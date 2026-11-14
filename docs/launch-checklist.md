# Launch checklist: first pilot letting

Everything that has to be true before a real renter's details enter Gaff. The code side is tracked in [status.md](status.md). This list covers what code can't do on its own: accounts, legal sign-off and operations.

## Founders

- [ ] Choose the domain Gaff will use (for the app, the inbound addresses and sending)
- [ ] Get 3 to 5 real Daft and 3 to 5 MyHome enquiry emails, with the personal details changed, to confirm the parsers
- [ ] Pick the first pilot operator(s)
- [ ] Price per letting for the pilots

## Accounts (founders create; CTO wires in)

- [ ] **Vercel (Pro):** a production project with Gaff's domain; functions in Dublin (`dub1`, set in `vercel.json`). Sign the DPA ([deploy.md](deploy.md), Q26).
- [ ] **Supabase:** a production project in West EU (Ireland), on a paid plan with point-in-time recovery; Data API off; Enforce SSL on. Sign the DPA.
- [ ] **AWS:** account with Amazon Bedrock access to Claude through the EU geographic inference profile; invocation logging off. Sign the DPA.
- [ ] **Resend:** sending domain in `eu-west-1` with SPF and DKIM, open and click tracking off; receiving on the inbound subdomain (MX record); `email.received` webhook to `/api/inbound/resend`. Sign the DPA (data is stored in the US under the Data Privacy Framework, Q26). Mailgun EU remains an alternative.
- [ ] **Alerts (M86):** a separate sending subdomain for alerts (`ALERTS_MAIL_FROM_DOMAIN`, for example `alerts.gaff.ie`) with its own SPF and DKIM, so a spike in alerts can't affect sign-in codes. Check one-click unsubscribe (List-Unsubscribe and List-Unsubscribe-Post) in Gmail and Outlook.
- [ ] **Sinch:** EU region SMS account; check Irish sender ID rules. Sign the DPA.
- [ ] **Identity and documents** ([providers PRD](providers/prd.md), Q48 to Q50, Q60): Stripe Identity's live keys and webhook for everyone's identity check (`IDENTITY_PROVIDER=stripe`), a photo ID and a live selfie with no other way through, and a private `documents` bucket in Supabase Storage for chosen renters' work and income documents. No open banking provider is needed at launch. A test-mode check with each Irish document type (passport card, driving licence, Irish Residence Permit) first.
- [ ] **AI:** Bedrock access to Claude Opus 5.5 in `eu-west-1`, the evals passing there, and `AI_MONTHLY_BUDGET_EUR` set. Production refuses the Claude API (Q37).
- [ ] **Privacy notice and DPIA** cover Stripe Identity for everyone (biometric data), renters' documents and the AI tasks (P50, P51), and the solicitor has answered Q42, Q43, Q45, Q52 and Q61 (a required selfie with no other way through: GDPR consent, the DPC's guidance and the Equal Status Acts).
- [ ] **Google Maps Platform (Q58, ADR-0027):** a billing account in Gaff's name, with budget alerts at 50%, 80% and 100% of the monthly budget (search redesign PRD S1) and a daily quota cap on map loads. Separate API keys for production and the test copy, each restricted to Gaff's domains (HTTP referrers) and to the Maps JavaScript API only. Light and dark Map IDs, styled from the tokens. Accept the Controller-Controller Data Protection Terms, and record that Google offers no EU region (transfers under the EU–US Data Privacy Framework).
- [x] **Place index (ADR-0027):** built from OpenStreetMap and committed (8 November 2026; the **Build the place index** workflow rebuilds and checks it every quarter).
- [ ] **Sign in with Google (Q64):** approved under rule 10; a Google Cloud project in Gaff's name; a consent screen with the privacy notice and terms; one OAuth client each for production and the test copy; `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set ([auth-tech-spec.md](auth-tech-spec.md), section 11). Until then the button doesn't show.
- [ ] **Sign in with Apple (Q64, Q68):** approved under rule 10; an Apple Developer account in Gaff's name; a Services ID, a key and the return address; the four `APPLE_…` settings; and Gaff's sending domains registered with Apple, so emails reach people who use Hide My Email.
- [ ] **Passwords seen in breaches (Q65):** approve Have I Been Pwned's Pwned Passwords and set `PASSWORD_BREACH_CHECK=pwned_passwords`, or set it to `off`. Production won't start without one or the other.
- [ ] **Passkeys (Q69):** `PASSKEY_RP_ID` set to the domain Gaff will keep, before anyone adds a passkey. It can't change afterwards.
- [ ] **`pg_trgm` on the production database** ([deploy.md](deploy.md), step 7). It's on for the test copy (`gaff-test`, in `public`).
- [ ] **GitHub:** push access and Actions enabled for CI.

## Solicitor (before the first pilot letting)

- [ ] PSRA: can Gaff run every stage as software operated by a licensed agent or a landlord?
- [ ] Data protection roles (processor for operators; controller for opt-in renter profiles, Q25) and the DPIA
- [ ] Transfers outside the EU: the privacy notice names Vercel, Supabase and Resend and the transfer basis (Data Privacy Framework or standard contractual clauses, Q26)
- [ ] Article 22: ranking with a person approving
- [ ] Retention periods: 30 days for personal details after the letting closes, 12 months for the anonymous decision record (open question Q3)
- [ ] Rent-check rule table (Q8): `src/domain/rent/rent-check.ts` cites its sources
- [ ] Criteria list, pets wording and assistance-dog rule (Q9)
- [ ] Fixed answers on protected grounds (Q7)
- [ ] Message templates in `src/copy/templates/`: first reply (with AI disclosure; version 2 adds the M28 line that no money is asked for before signing, and thanks renters who answered on Gaff), holding message, invitation, waiting list, booking confirmation, reminders (email and SMS), place offered, letting closed, and later offer and outcome
- [ ] Privacy notice for renters (GDPR Article 14)
- [ ] Sign-in (Q70): a privacy notice and terms for everyone with an account, naming Google and Apple (if approved), the breached-password check, and that sign-in sets only strictly necessary cookies; the fixed emails in `src/copy/account-emails.ts` and the team invitation in `src/copy/verification.ts`
- [ ] Google Maps on renter pages: Gaff's terms carry Google's notice (Google Maps Additional Terms of Service and Privacy Policy), the privacy notice names Google Maps, and the DPIA covers it, including whether the map needs a tap before it loads (search redesign PRD S2)
- [ ] OpenStreetMap data in the place index: OSM rows kept separate, the build method published, and the wording of the "Map and place data" credits page (`/map-and-place-data`, drafted) (ODbL)
- [ ] Collecting the PPSN for RTB registration (optional, sealed, deleted once registered; no date of birth, Q24), and the registration deadline
- [ ] Gaff’s standard tenancy agreement wording (`src/copy/templates/tenancy-agreement.ts`), and whether it can be signed electronically or must be signed on paper (Electronic Commerce Act 2000, s.10(1)(b); Q23)

## Operations

- [ ] DPIA completed
- [ ] Retention job running in production (daily, 02:30 UTC), with its log checked: personal details on their date, references at tenancy start, the anonymous record after 12 months, and sign-in's leftovers (ended sessions, used-up codes, unconfirmed sign-ups after 7 days, lapsed invitations; AU14)
- [ ] `DATA_ENCRYPTION_KEY` set in production (32 random bytes, base64), and stored safely: check results and PPS numbers can’t be read without it
- [ ] `DATABASE_CA_CERT` set in production, so the database's certificate is checked
- [ ] The job tick running every minute (Supabase, Integrations, Cron: `gaff-tick`), and the daily call (`gaff-daily`, and Vercel's daily cron), with `CRON_SECRET` set
- [ ] Backups: a restore tested from point-in-time recovery
- [ ] Error alerts going to a founder
- [ ] Test copy on Vercel and Supabase ([deploy.md](deploy.md)), made-up details only
- [ ] Approve-before-send on for the pilot operator

## Marketplace (before the public launch)

The [marketplace PRD](marketplace/prd.md) was approved for build on 7 November 2026. On top of everything above:

**Founders**

- [ ] **Stripe Identity:** a Stripe account with Identity enabled; sign the DPA; the privacy notice names it and its transfer basis, for letters (Q29) and now for renters too (Q48)
- [ ] The budget and target cost per active renter (Q31)
- [ ] Decide Q32 to Q34 (workflow free during launch; listing defaults; partner services). Q35, "Ready to move", is superseded by Q48
- [ ] The letter beta: invite pilot agencies, Ann's network and two or three developments, aiming for 300 live homes in Dublin

**Solicitor**

- [ ] The marketplace questions in Q36: Equal Status Acts section 12, the Digital Services Act, data protection roles, badge wording, the HAP statement, the PSRA register, private landlords as consumers, report retention, BER display
- [ ] Terms for renters and letters, the listing policy (`/listing-policy`) and the statement-of-reasons templates in `src/copy/listings.ts` (`listing_removed@2`, `listing_paused_automatically@1`, `account_action@1`, and the appeal outcome) (M98, M101)
- [ ] `CONTACT_EMAIL` set: the Digital Services Act contact point for users and authorities, shown at `/contact` (M101). Someone reads it every working day
- [ ] Who at Gaff reviews reports and appeals, with at least two reviewers so an appeal always goes to someone else (M98), and the review targets (4 working hours for scams, 1 working day otherwise) staffed

**Operations**

- [ ] DPIA updated for renter accounts, profiles, alerts and checks on letters
- [ ] Supabase Storage: a private bucket for uploads and a public bucket for listing photos, behind the CDN
- [ ] The weekly PSRA register import running, with its log checked
- [ ] Gaff staff added with `pnpm staff:add` (they sign in once first). Each adds a passkey under “How you sign in”, with someone who knows them present, before production asks for it (M5, Q73). Review cover for the first weeks after launch
- [ ] Stripe Identity's webhook (`identity.verification_session.*`) pointing at `/api/webhooks/stripe-identity`, with `IDENTITY_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` set
- [ ] The licence queue (`/staff/checks`) worked every working day, until the PSRA register's weekly file is matched automatically

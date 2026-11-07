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
- [ ] **ID and income checks:** choose providers (for example Veriff or Onfido for ID; TrueLayer, Tink or Yapily for open banking, checking AIB, Bank of Ireland, PTSB and Revolut coverage), sign DPAs, and add their adapters. Until then production runs with `IDENTITY_PROVIDER=none` and `INCOME_PROVIDER=none`, and operators arrange those checks themselves.
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

## Marketplace (before the public launch)

The [marketplace PRD](marketplace/prd.md) was approved for build on 7 November 2026. On top of everything above:

**Founders**

- [ ] **Stripe Identity:** a Stripe account with Identity enabled; sign the DPA; the privacy notice names it and its transfer basis (Q29)
- [ ] The budget and target cost per active renter (Q31)
- [ ] Decide Q32 to Q35 (workflow free during launch; listing defaults; partner services; "Ready to move")
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
- [ ] Gaff staff added with `pnpm staff:add` (they sign in once first), with passkeys, and review cover for the first weeks after launch
- [ ] Stripe Identity's webhook (`identity.verification_session.*`) pointing at `/api/webhooks/stripe-identity`, with `LETTER_IDENTITY_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` set
- [ ] The licence queue (`/staff/checks`) worked every working day, until the PSRA register's weekly file is matched automatically

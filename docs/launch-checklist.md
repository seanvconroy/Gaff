# Launch checklist: first pilot letting

Everything that has to be true before a real renter's details enter Gaff. The code side is tracked in [status.md](status.md). This list covers what code can't do on its own: accounts, legal sign-off and operations.

## Founders

- [ ] Choose the domain Gaff will use (for the app, the inbound addresses and sending)
- [ ] Get 3 to 5 real Daft and 3 to 5 MyHome enquiry emails, with the personal details changed, to confirm the parsers
- [ ] Pick the first pilot operator(s)
- [ ] Price per letting for the pilots

## Accounts (founders create; CTO wires in)

- [ ] **Render:** workspace, Frankfurt region, paid Postgres plan with point-in-time recovery. Sign the DPA.
- [ ] **AWS:** account with Amazon Bedrock access to Claude through the EU geographic inference profile; invocation logging off. Sign the DPA.
- [ ] **Mailgun:** EU region account; sending domain with SPF and DKIM; inbound route to `/api/inbound/mailgun`. Sign the DPA.
- [ ] **Sinch:** EU region SMS account; check Irish sender ID rules. Sign the DPA.
- [ ] **ID and income checks:** choose providers (for example Veriff or Onfido for ID; TrueLayer, Tink or Yapily for open banking, checking AIB, Bank of Ireland, PTSB and Revolut coverage), sign DPAs, and add their adapters. Until then production runs with `IDENTITY_PROVIDER=none` and `INCOME_PROVIDER=none`, and operators arrange those checks themselves.
- [ ] **GitHub:** push access and Actions enabled for CI.

## Solicitor (before the first pilot letting)

- [ ] PSRA: can Gaff run every stage as software operated by a licensed agent or a landlord?
- [ ] Data protection roles (processor for operators; controller for opt-in renter profiles) and the DPIA
- [ ] Article 22: ranking with a person approving
- [ ] Retention periods: 30 days for personal details after the letting closes, 12 months for the anonymous decision record (open question Q3)
- [ ] Rent-check rule table (Q8): `src/domain/rent/rent-check.ts` cites its sources
- [ ] Criteria list, pets wording and assistance-dog rule (Q9)
- [ ] Fixed answers on protected grounds (Q7)
- [ ] Message templates in `src/copy/templates/`: first reply (with AI disclosure), holding message, invitation, waiting list, booking confirmation, reminders (email and SMS), place offered, letting closed, and later offer and outcome
- [ ] Privacy notice for renters (GDPR Article 14)
- [ ] Collecting the PPSN for RTB registration (optional, sealed, deleted once registered; no date of birth, Q24), and the registration deadline
- [ ] Gaff’s standard tenancy agreement wording (`src/copy/templates/tenancy-agreement.ts`), and whether it can be signed electronically or must be signed on paper (Electronic Commerce Act 2000, s.10(1)(b); Q23)

## Operations

- [ ] DPIA completed
- [ ] Retention job running in production (daily, 02:30 UTC), with its log checked: personal details on their date, references at tenancy start, the anonymous record after 12 months
- [ ] `DATA_ENCRYPTION_KEY` set in production (32 random bytes, base64), and stored safely: check results and PPS numbers can’t be read without it
- [ ] Backups: a restore tested from point-in-time recovery
- [ ] Error alerts going to a founder
- [ ] Staging environment with test accounts
- [ ] Approve-before-send on for the pilot operator

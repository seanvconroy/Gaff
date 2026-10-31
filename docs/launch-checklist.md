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
- [ ] **GitHub:** push access and Actions enabled for CI.

## Solicitor (before the first pilot letting)

- [ ] PSRA: can Gaff run every stage as software operated by a licensed agent or a landlord?
- [ ] Data protection roles (processor for operators; controller for opt-in renter profiles) and the DPIA
- [ ] Article 22: ranking with a person approving
- [ ] Retention periods: 30 days for personal details after the letting closes, 12 months for the anonymous decision record (open question Q3)
- [ ] Rent-check rule table (Q8): `src/domain/rent/rules.ts` cites its sources
- [ ] Criteria list, pets wording and assistance-dog rule (Q9)
- [ ] Fixed answers on protected grounds (Q7)
- [ ] Message templates: first reply (with AI disclosure), holding message, invitations, reminders, and later offer and outcome
- [ ] Privacy notice for renters (GDPR Article 14)
- [ ] Collecting the PPSN for RTB registration, and the registration deadline (Slice 3)

## Operations

- [ ] DPIA completed
- [ ] Retention job running in production, with its log checked
- [ ] Backups: a restore tested from point-in-time recovery
- [ ] Error alerts going to a founder
- [ ] Staging environment with test accounts
- [ ] Approve-before-send on for the pilot operator

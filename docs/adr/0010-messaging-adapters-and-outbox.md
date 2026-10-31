# ADR-0010: Email and SMS through adapters and an outbox

- Status: Accepted (CTO decision, 31 October 2026): Mailgun EU for email, Sinch EU for SMS.
- Date: 2026-10-31

## Context

Enquiries arrive by email (R5). Replies, confirmations and reminders go out by email and SMS (R7, R13). The PRD hasn't chosen providers yet. The founders must approve any service that handles personal data. The build shouldn't wait for that choice.

## Decision

- **Ports:** `InboundEmailSource` turns a provider's webhook into a normalised email, `EmailSender` sends email and `SmsSender` sends SMS.
- **Local adapters, now:** a development outbox stores sent mail in the database and shows it at `/dev/outbox`, an inbound simulator posts fixture emails, and a fake SMS sender stands in for SMS. Tests and local development use only these.
- **Outbox:** every outbound message is a row in `messages`. Its status moves from draft to awaiting approval, scheduled, sending, then sent or failed. Each row has a `send_at` time, which is how reminders are scheduled. A dispatcher job sends due messages with retries. Failures show on the operator's screen.
- **Addresses:** each organisation gets an inbound address (`<slug>@<inbound domain>`) for its forwarding rule. Each letting gets a reply address, so renters' replies come back to Gaff and stay in the right thread.
- **Sender:** mail goes from the operator's own domain once it's verified. Until then it goes from "Name at Agency via Gaff" at a Gaff address.
- **Providers:** email through **Mailgun's EU region**, which receives (inbound routes), sends and stores message data in the EU (Postmark reportedly stores data only in the US). SMS through **Sinch's EU region**. Sinch is a Swedish company and owns Mailgun, so one vendor group covers both. Amazon SES in Ireland and Twilio are the fallbacks; switching means writing one adapter.

## Consequences

- Building and testing never need a real provider or real addresses.
- Switching providers means writing one adapter.
- Webhook signatures are verified for each provider. The raw email is stored before anything else happens.

## Alternatives considered

- **Choose a provider now.** It would block on an approval that isn't needed until a pilot.
- **Send directly from request handlers.** Messages would be lost when a provider is down or a process crashes.

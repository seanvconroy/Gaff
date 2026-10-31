# ADR-0006: The event log holds no personal data

- Status: Proposed
- Date: 2026-10-31

## Context

The PRD wants an append-only event log behind each letting's record (R27), so operators keep a record they can stand over. It also wants unsuccessful applicants' data deleted on schedule (R26). An append-only log that contains names or messages can't honour deletion.

## Decision

- `events` is append-only: a database trigger rejects updates and deletes. The only exception is a deliberate maintenance procedure, for example deleting a whole organisation's data at the end of a contract.
- Each event records the organisation, the letting, when it happened, the actor (person, AI, system, renter or landlord), the type, the subject's ID, and a small payload.
- **Payloads never contain personal data.** Every event type has a Zod schema that allows only IDs, enums, counts, dates, criteria and reason codes. There are no names, contact details or message text. A test fails if a payload schema allows free text.
- Personal data lives in its own tables (`applications`, `messages`, `inbound_emails`), which the retention job can delete.
- The timeline joins events with whatever personal data still exists. After deletion, it shows "Applicant 14 (details deleted on 14 December)" alongside the full decision history.
- The PRD's metrics (reply times, days to let, no-shows, outcomes told, deletions on schedule) are computed from events.

## Consequences

- Deletion and an unbroken record can both be honoured.
- Every use case writes its event in the same transaction as its change, so the record can't drift from the data.
- Timeline queries need a join, which is cheap at our volumes.

## Alternatives considered

- **Personal data in events, with crypto-shredding** (encrypt per renter and delete the key). It works, but it's more complex than not putting personal data in events at all.
- **Event sourcing for everything.** Too heavy for a two-person team.

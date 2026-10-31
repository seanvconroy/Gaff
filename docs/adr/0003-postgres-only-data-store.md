# ADR-0003: Postgres is the only data store

- Status: Proposed
- Date: 2026-10-31

## Context

Gaff needs relational data (lettings, applications, bookings), an append-only event log, a job queue (parsing, sending, reminders, retention) and a guarantee that no enquiry or message is lost. Every extra data store is another thing to secure, back up, put in the DPIA and pay for.

## Decision

- **PostgreSQL 16+** holds everything: data, the event log, the job queue and the message outbox.
- **Drizzle ORM** defines the schema in TypeScript. drizzle-kit generates SQL migrations, which are committed and reviewed like code.
- **graphile-worker** runs jobs from Postgres. Jobs start immediately via LISTEN/NOTIFY, can be scheduled for a time, can be replaced or cancelled by key, and periodic tasks run from a crontab.
- **Outbox:** every outbound message is a row in `messages`, written in the same transaction as the change that caused it. A dispatcher job sends it, so a message is never lost and never sent twice, even if a process crashes.
- **Inbound:** the webhook stores the raw email first and queues parsing second, so an email that can't be parsed is still kept and shown to the operator.
- No Redis and no separate queue service. No file storage in Slice 1: photos are a link, and documents don't arrive until Slice 2 (and then only verification results, not images).

## Consequences

- One thing to back up and restore. Jobs and data commit together, so there are no half-done states.
- Postgres can comfortably handle the job volumes of thousands of lettings a year.
- graphile-worker ties us to Postgres, which we're committed to anyway.

## Alternatives considered

- **pg-boss.** Similar and also good. graphile-worker's job keys make it simpler to reschedule reminders.
- **BullMQ with Redis.** Another service to run and secure.
- **Prisma.** Heavier, with a less SQL-like model.
- **Kysely.** A good query builder, but Drizzle adds schema-as-code and migrations.

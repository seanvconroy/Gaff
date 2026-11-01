# ADR-0014: Vercel and Supabase, with approved vendors instead of EU-only

- Status: Accepted (Sean, 1 November 2026, on the CTO's advice). Supersedes [ADR-0002](0002-eu-hosting-render-frankfurt.md), and the "separate worker process" part of [ADR-0001](0001-modular-monolith-typescript-nextjs.md). Changes the email provider in [ADR-0010](0010-messaging-adapters-and-outbox.md).
- Date: 2026-11-01

## Context

- Sean already has accounts with Vercel, Supabase, Resend and Stripe, and trusts them.
- ADR-0002 chose Render in Frankfurt because the build had turned the PRD's "data hosted in the EU" into "EU only". GDPR doesn't require EU hosting. A transfer to a US provider is lawful under the EU–US Data Privacy Framework or standard contractual clauses, with a signed DPA and the provider named in the privacy notice (open question Q26).
- Vercel runs functions on request. There's no always-on worker process, but Gaff still has work that happens when nobody is clicking:
  - offer deadlines and viewing reminders;
  - chasing referees;
  - reading enquiries;
  - drafting answers with the AI;
  - sending with retries;
  - the nightly retention job.

## Decision

- **Web:** Next.js on Vercel, with functions pinned to Dublin (`dub1`). Vercel Pro, because:
  - the job tick needs a per-minute cron;
  - Hobby is for non-commercial use only.
- **Database:** Supabase Postgres in West EU (Ireland).
  - The app connects as its own role, `gaff`, through the Supavisor session pooler. `gaff` owns the tables and can't bypass row-level security, so [ADR-0004](0004-tenant-isolation-row-level-security.md) is unchanged.
  - The Data API (PostgREST) is switched off, because Gaff never uses `supabase-js`.
  - Supabase Auth and Storage aren't used. Sign-in stays with Better Auth, in our own tables ([ADR-0013](0013-sign-in-operators-links-for-renters.md)). Photos stay in Postgres.
- **Background jobs:** still graphile-worker, with the queue in Postgres ([ADR-0003](0003-postgres-only-data-store.md) is unchanged). On Vercel:
  - Vercel Cron calls `/api/cron/tick` every minute. It runs every job that is due, within a time budget, then stops cleanly.
  - A request that queues work starts the same runner straight after its response (`after()`). A reply goes out in seconds, not at the next minute.
  - The 02:30 UTC tick also queues the nightly retention job.
  - Locally, `pnpm worker` still runs jobs continuously.
- **Email:** Resend, for sending and receiving (signed webhooks), behind the existing email port ([ADR-0010](0010-messaging-adapters-and-outbox.md)). Mailgun stays as an alternative adapter.
- **Migrations** run in the Vercel build, as the `gaff` role, before the app is built.
- **Vendors:** approved vendors only. Use the EU region wherever one is offered, with a signed DPA and a lawful transfer basis for anything outside the EU (rule 10 in `CLAUDE.md`).

## Consequences

- Sean already knows the tools. Every push to the production branch deploys.
- Vercel caps a request body at 4.5 MB, so inventory photos are shrunk in the browser before they're uploaded.
- A timed job (a reminder or a deadline) can run up to a minute late. Work queued by a request runs straight away.
- If a function is stopped mid-job, graphile-worker keeps that job locked until its lock expires (4 hours), then retries it. The tick's time budget keeps every run well inside the function's limit.
- Resend and Vercel store some data in the US, under the Data Privacy Framework. The privacy notice names them, and the DPIA covers the transfer.
- Moving off Vercel later stays easy. Gaff is a standard Next.js app with Postgres, and the long-running worker entry point still exists.

## Alternatives considered

- **Keep Render.** It works and was configured, but it's another vendor to learn, and EU-only is no longer the rule.
- **Supabase pg_cron and pg_net calling the tick.** It's free and works on Vercel Hobby. It's kept as the fallback if Pro isn't wanted.
- **A hosted job service (Inngest, Trigger.dev).** It would be one more vendor seeing job payloads, and it isn't needed at this scale.
- **Supabase Auth.** It would move sign-in out of our tables and rework ADR-0013's flow, for no gain now.

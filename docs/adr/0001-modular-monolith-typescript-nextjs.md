# ADR-0001: A TypeScript modular monolith on Next.js, with a separate worker process

- Status: Accepted. On Vercel, background jobs run from a per-minute cron and straight after requests instead of a separate always-on process: see [ADR-0014](0014-vercel-supabase-approved-vendors.md).
- Date: 2026-10-31

## Context

Two part-time founders will build and run Gaff, with heavy use of AI coding tools. The product has three web surfaces (operator workspace, renter pages, landlord pages), inbound webhooks, and a lot of background work: parsing enquiries, drafting answers, sending messages, reminders, waitlist offers and retention. The compliance rules are the product's core value, so they need to be precise, typed and easy to test.

## Decision

- One repository, one TypeScript codebase (strict mode), one deployable image that runs as two processes: **web** (Next.js) and **worker** (background jobs).
- **Next.js (App Router)** serves every web surface and the webhooks. Pages are server-rendered, and forms use Server Actions, so they work without JavaScript. That matters on renter phones and for accessibility.
- Business rules live in `src/domain` as pure functions with no I/O and no framework imports. Use cases live in `src/server`. Next.js routes and worker tasks are thin wrappers, so the web framework can be replaced without touching the rules.
- Zod validates every input from outside: forms, webhooks, AI output and environment variables.
- date-fns with `@date-fns/tz` handles dates in Europe/Dublin, formatted the Irish way ("Thursday 6 November, 6pm").
- pnpm manages packages; Node.js LTS.

## Consequences

- One language from database to screen. TypeScript has the largest pool of developers and the best-supported SDKs for the providers we'll add (Anthropic, AWS, e-signature, open banking).
- Next.js moves fast and has its own caching rules. Keeping business logic outside it limits the damage of upgrades.
- A monolith is simpler to run and debug. If one part ever needs to scale separately, the `domain` and `server` boundaries make it possible to split.

## Alternatives considered

- **Rails 8.** Excellent for small teams (Action Mailbox for inbound email, Solid Queue for jobs). Not chosen because of weaker static typing on rules-heavy code and the TypeScript-first provider SDKs.
- **React Router 7 (Remix).** A simpler model for forms, but a smaller ecosystem.
- **A separate single-page app and API.** Twice the moving parts, and worse for renters on slow phones.

# ADR-0007: People decide: renter-affecting changes need a decision record

- Status: Accepted
- Date: 2026-10-31

## Context

Principle 1 and GDPR Article 22: Gaff sorts and suggests, but a person makes every decision about a renter. Gaff asks for three decisions: who views, who is offered the home, and what is signed. The AI and the background jobs must never be able to make one, even by accident.

## Decision

- A `Decision` is a record of who decided what and when, with a snapshot of the criteria and ranking they saw.
- Domain functions that change a renter's chances require a `Decision` argument. These include inviting to view, adding to the waitlist, choosing the preferred applicant and backup, offering, declining, and sending an outcome. Without one they fail.
- Only the server layer can create a `Decision`, and only from a signed-in person's request with the right role.
- Worker jobs and AI code can't import the code that creates decisions. Lint import rules enforce this, and compliance tests prove it.
- What jobs and the AI may do: parse, draft, rank, send fixed messages that a person's decision triggered, schedule reminders, and offer freed places to a waitlist a person has already approved (open question Q2).

## Consequences

- "Nobody is rejected without a person's approval" (R11) is enforced by the code, not just by the screens.
- Every decision is on the timeline with its criteria, which is the record an operator needs if they're challenged.
- New features that touch a renter's chances must take a `Decision`. Reviewers check for it.

## Alternatives considered

- **Screen-level confirmation only.** Easy to bypass from a job or a future feature.

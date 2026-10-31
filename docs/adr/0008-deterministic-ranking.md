# ADR-0008: Ranking is deterministic code, not AI

- Status: Proposed (ordering details wait on open questions Q9 and Q10)
- Date: 2026-10-31

## Context

R10: Gaff ranks enquirers against the operator's criteria, then by enquiry time, and shows the reason for each position. The ranking must be fair, applied the same way to everyone, blind to protected grounds, and explainable to a renter, a landlord or the Workplace Relations Commission.

## Decision

- Criteria are a closed, typed list: move-in date, length of stay, maximum occupants and pets, each with typed parameters. There's no free-text criterion anywhere in the schema or the UI.
- Each criterion has a pure function that takes a renter's answer and returns met, not met or unknown, with a reason code.
- Ranking is a pure function. The proposed order: criteria met (most first), people who haven't answered after those who have, then enquiry time (earliest first). Ties are broken by the time the email was received.
- Reasons come from templates in plain words: "Meets all 4 criteria. Enquired Tuesday 4 November, 9:12am."
- The only inputs are the criteria answers and the enquiry time. Names, messages, nationality, language and source are never read. No AI is involved.
- The ranking shown when the operator approves invitations is saved with their `Decision` (ADR-0007).

## Consequences

- Same input, same output. Easy to test exhaustively and to explain.
- Strengthens the Article 22 position: Gaff suggests with a visible rule, and a person decides.
- The PRD's "AI: ranking explanations" line is covered by templates instead.

## Alternatives considered

- **AI scoring.** Opaque, inconsistent, and liable to pick up protected grounds from names or language.
- **Weighted scores.** Harder to explain. The operator can't say why 7.3 beats 7.1.

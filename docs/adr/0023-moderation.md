# ADR-0023: Moderation: rules first, a hold for a person, people decide

- Status: Accepted (the AI classifier is milestone 7)
- Date: 2026-11-07

## Context

In 2019 the WRC found Daft liable for discriminatory ads placed by others. Scam listings are renters' biggest fear. The Digital Services Act requires a statement of reasons when a hosting service removes content. Gaff's own rule 1 says people make decisions.

## Decision

- **Rules first** (`domain/moderation/listing-text.ts`), as the letter types and again at publishing:
  - protected-ground wording blocks publishing, with the reason and what to do (M46), reusing the workflow's list (Q7) with a few ordinary property words let through ("family bathroom");
  - contact details and links block publishing (M45);
  - wording typical of rental scams holds the listing (M29).
- **Risk signals hold a listing** for a person (`server/listings/risk.ts`, M29): a photo matching another letter's, a rent far below similar homes, words copied from another letter, a new account listing many homes at once.
- **A person decides** every hold on `/staff/listings` (M97, M98): let it go live, or remove it with a reason. A removal emails the letter a statement of reasons (what, why, how to appeal; a different person reviews an appeal).
- **AI second** (milestone 7): a classifier for subtler wording will only add holds; it never removes anything.
- Every hold, release and removal is in the letting's record, with reason codes only.

## Consequences

- A blocked word can't reach renters by any route: create, edit, or a live listing's edit.
- Some honest listings wait for a person; the targets are 4 working hours for suspected scams, 1 working day otherwise.
- The rules list needs care: false alarms annoy letters, misses risk complaints. The solicitor reviews it (Q36).

## Alternatives considered

- **Publish first, review reports later.** Faster for letters, but a scam or a "no HAP" ad would reach renters first.
- **AI deciding.** Breaks rule 1, and is hard to explain to a letter or a court.

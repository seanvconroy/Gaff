# ADR-0026: A home's description drafted from its facts

- Status: Accepted
- Date: 2026-11-20

## Context

In the redesign a lister writes a home's description by hand, or it comes from a pasted advert. The live line could draft one from the home's facts and mark it "Drafted by AI" until the lister changed it (P10, P11, the live line's ADR-0025). BA-11 brings this across as a fourth task of the one AI adapter (ADR-0017).

## Decision

- **A task, `description`**, in `aiTasks`, with its prompt (`src/adapters/ai/prompts/description.ts`, `description@1`), a structured output (the text and the IDs of the facts it used), medium effort and one try in 30 seconds. It has the budget, the log and the switch every task has (`AI_TASKS_OFF=description`).
- **What it is given** is `descriptionFacts` (`src/domain/lettings/drafted-description.ts`): the type, the area and county by name, the rooms, furnishing, the BER, parking, the date it's available, and the lister's own statements about the home. Never the rent, the criteria, the house rule, the street, the house number, the Eircode or an advert link, and nothing about any renter. A statement that names the lister, their organisation or the owner, or gives a phone number, email or link, is left out whole (rule 7). The words already in the field are never sent.
- **What is used**: a draft is shown only if `descriptionProblem` finds nothing: between 200 and 1,500 characters, `homeWordingProblem` passes (the check a hand-written description must pass, rule 3), no contact details, no number the facts don't have, and it cites at least one fact and only facts it was given. Otherwise, or with no output, the lister is told to write their own, as a plain line, not an error. Switched off or out of budget (`aiTaskIsOffered`), the action isn't shown.
- **Where**: "Draft a description" is a quiet button beside the description in the home step, the review's description sheet and Change on Home. The draft fills the field; nothing is saved until the lister saves. The facts on the screen are used before they're saved.
- **The mark**: the draft comes back with an HMAC of the home's ID and the words (keyed from `AUTH_SECRET`). A save that hands it back with the same words is marked (`lettings.description_by_ai`, `descriptionByAi` in a draft's answers). The mark stays on a save that leaves the words as they were, and goes as soon as a word changes. It shows "Drafted by AI" on the lister's side (the field, and Home) and is never shown to renters; the public page reads the description alone.
- **Logged**: `letting.description_drafted` with whether the draft was shown and, if not, a code for why. Never the facts or the words.
- **Evals**: 30 made-up homes in `tests/evals/description.ts`, built through `descriptionFacts`, run by `pnpm evals description --confirm`, never in CI.

## Consequences

- A description saved as drafted is the lister's choice to publish; the wording check at go-live (BA-10) applies to it as to any other.
- "Let it again" carries the description over without the mark: the next letting's words are treated as the lister's.

## Alternatives considered

- Trusting the browser to say a text was drafted (the live line): any text could then carry the pill. The HMAC costs nothing and needs no table.
- Sending the existing description for the model to improve: it is the lister's free text and could carry anything; left out.

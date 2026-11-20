# ADR-0025: Checks as a home goes public, holds as cases, and pausing a lister

- Status: Accepted (brought across from the live line's M29, M45, M46, M48, M107 and P12 to P14, and its ADR-0023 and ADR-0025, on 20 November 2026; Q53)
- Date: 2026-11-20

## Context

In the redesign a home goes public on gaff.ie once it is live, "On gaff.ie" is on, it has a BER and a photo, and its words pass the protected-ground word list. Nothing looked for a scam. The live line checks every listing as it is published and holds risky ones for a person at Gaff. On 19 November (Q53) the founder agreed that Gaff's team may review a listing held as suspicious, and still never open a letting, read a renter, send a message or decide anything about a person. ADR-0024 left pausing a lister's account as a seam.

## Decision

- **Two kinds of check, never mixed.** What the lister can put right is told at the field and never held: wording on a protected ground (as before) and, new, contact details in a description or a fact (M45). The bar for being shown stays a BER and one photo (Q51). Risk signals never refuse anything: they hold the listing for a person.
- **Risk signals (M29), as codes** (`src/domain/listings/checks.ts`): a photo matching one on a different lister's home (the pipeline's hash, within `DUPLICATE_DISTANCE`, and only for a photo with enough detail to match: a plain picture matches nothing); a rent below 60% of the median of at least five similar homes on gaff.ie (same place, same bedrooms); a description of 200 characters or more that is word for word another lister's; a burst (an account under seven days old putting its sixth home on gaff.ie within 24 hours); wording typical of rental scams; and the AI's wording check. They read across listers as the system (`src/server/trust/checks.ts`) and return only counts.
- **The AI's wording check (P12 to P14)** is the fourth task of the one adapter (`wording`, ADR-0017), with a prompt version, a golden set of 160 descriptions (pass: 90% caught, at most 5% false alarms), the budget and its switch. It runs after the word list, on the home's public words with names stripped. Only a phrase copied from the text and a ground from the fixed list are kept. No output means the home goes ahead on the word list alone.
- **When.** A home that will be public is checked inside the go-live step, before it goes live, so a held home is never public. Any later change to a public home's words, photos or rent, switching it back on, or an agency's confirmation releasing a home, queues `check_listing`, which looks again at what changed (a home never checked in full while public is checked in full). A home that isn't public isn't checked until it is.
- **A hold is a case** (ADR-0024's `listing_cases`, kind `hold`, with `signals` and `findings`). The home is hidden the way a reported one is (`hidden_stage = 'held'`, new `hidden_after = 'check'`): no page, not in search, enquiries wait. It is due in four working hours for a sign of a scam, one working day for wording alone. The lister is emailed at once, in fixed words, that a person will look and by when, with any phrase the wording check found. A person releases it (`listing.released`) or keeps it off with a reason and facts from the fixed lists (a new fact: "the checks"); the lister can ask Gaff to look again once, and someone else decides. A signal a person released doesn't hold the home again without new evidence.
- **Pausing a lister (M107)**, after a case decided against one of their homes: `lister_pauses` (Gaff's own record) and `organisations.listings_paused_at`, which closes `goLiveGate` (`paused`) and the public query's SQL twin. None of the lister's homes is public and none goes live; their live lettings carry on with the renters already in them. A statement of reasons is emailed; the lister may appeal once; anyone on the team may lift it. Suspending outright is not built.
- **Events** hold IDs, codes and counts: `listing.held_by_checks` (signals, number of findings, grounds), `listing.released`, `organisation.listings_paused`, `organisation.pause_appeal_asked`, `organisation.pause_appeal_decided`, `organisation.listings_unpaused`. Never a phrase.
- **Retention:** a hold is deleted with its case, six months after it's decided; an ended pause six months after it ended.

## Consequences

- Between a change to a public home and its queued check there are a few seconds when the change is public unchecked; at go-live there are none.
- A deposit isn't asked at go-live in the redesign (it's capped at the offer), so the live line's deposit check has nothing to check here.
- The new emails and the "checks" fact are new wording for the solicitor's list.

## Alternatives considered

- **Refusing scam wording at the field.** A scammer would only reword it; holding it puts a person in front of it.
- **A second mechanism for holds.** One case mechanism keeps one decision, one statement of reasons and one appeal.

# ADR-0018: Homes, lettings and listings

- Status: Accepted
- Date: 2026-11-07

## Context

The workflow's `lettings` table holds one home to let, with its facts (R1). The marketplace needs a home that outlives a letting, so it can be relisted (M31, M94), homes grouped into developments (M32 to M35), and a public advert that can be published, paused and closed on its own schedule (M48 to M50).

## Decision

- **A home** (`homes`) is the lasting record: address, Eircode, location, type, rooms, BER and features. It may belong to a development (`developments`) and a unit type (`unit_types`).
- **A letting** (`lettings`) is one time the home is let, as now. It keeps its own copy of the home's facts as advertised, which is the record behind the rent-setting pack and the timeline. While the letting is open, an edit to the home updates the letting's copy in the same transaction. Once it closes, its copy never changes.
- **A listing** (`listings`) is a letting's public advert: its status, description, photos order and freshness. One listing per letting.
- **What renters see** is `public_listings`, written by the publishing use case in the same transaction as the change (ADR-0017).
- Existing lettings get a home each, backfilled one-to-one, and a draft listing. Nothing becomes public until a letter publishes it.

## Consequences

- The workflow keeps working unchanged: it reads the letting's copy of the facts.
- The same fact lives in two places while a letting is open. One use case writes both, and a test checks they match.
- A development's homes inherit its location, amenities and photos (M33) without copying them into every home.

## Alternatives considered

- **Move every fact from `lettings` to `homes`.** One copy, but every workflow query changes, and closed lettings would no longer show the facts they were let with.
- **Listings as a column set on `lettings`.** Fewer tables, but relisting and developments have nowhere to live.

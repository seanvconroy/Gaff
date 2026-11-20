# ADR-0029: Developments, unit types and letting many alike homes

- Status: Accepted (brought across from the live line's M32 to M35 and M75, BA-15, on 20 November 2026)
- Date: 2026-11-20

## Context

An agency letting a new scheme has dozens of near-identical homes. The live line has developments with unit types and a public development page, and copies a template home many times. The redesign's unit is the letting: there is no separate home or listing table, and every home was added one at a time.

## Decision

- **Two tenant tables, facts about homes only.** `developments` (name, street address, area, county, Eircode, pin, parking, description, a random `public_ref`) and `unit_types` (name, type, bedrooms, bathrooms, furnishing, BER, floor area, rent, how many, a random `public_ref`), both with `tenantPolicy()`. A development belongs to an agency or a landlord's team (`mayHaveDevelopments`); a private landlord's own homes are added one at a time.
- **Each home is an ordinary letting.** `makeHomesOfType` makes the type's homes in one transaction through `makeLettingIn`, with `development_id`, `unit_type_id`, `unit_label` ("Apartment 12") and `unit_floor`. Its address is "Apartment 12, The Waterside" with the street as its second line, so Today, Inbox, emails and the record name the development without any change. From then on it has its own people, viewings, decisions and tenancy.
- **The shared-value rule** (`src/domain/developments/development.ts`, `src/server/developments/shared.ts`). A change on the development or the type passes to every open home still sharing that value; `lettings.own_values` lists what a lister changed by hand on one home (any edit through the existing use cases: the home's facts and description, the pin, the asking rent, its photos), and a shared change never reaches it. Each pass-on writes the home's own events and queues the checks a public change needs.
- **Photos are shared as copies of the same picture.** A development's and a type's photos are `letting_photos` rows owned by the development or the type. Each home sharing photos holds copies (`shared_from_id`, cascading) pointing at the same stored picture; a picture leaves the store only when no row uses it. Changing a home's photos by hand detaches its copies as its own.
- **Going live together, honestly.** "Put 4 homes live" calls `startTakingEnquiries` per home: each is the person's own recorded decision, held while an agency is being confirmed, and checked as it goes public (ADR-0027). The letting details and rent check are given once and recorded on each home. Every use case that reaches a home checks `assertMayActOn` for each home first.
- **The burst signal counts a scheme once.** `homesShownLately` counts distinct `coalesce(development_id, id)`: a scheme from a new account is weighed as one home, and six schemes, or six homes on their own, are still a burst. It is not an exemption: the other signals look at every home.
- **Viewings across a type** give each home the same time as its own viewing session, so people stay with the home they asked about and every decision is per home (rule 1). Places are per home.
- **Public side.** `/developments/<public_ref>` is built from the public query for homes (`publicHomes({ developmentRef })`), so it lists only homes with pages of their own, and exists only while one does. Search groups a development's alike homes into one card per type (`groupAlike`) as a step after the matcher, and one map pin; a home's page links to its development. Development pages are not indexed until robots.txt and the sitemap name them.

## Consequences

- Events added: `development.created`, `development.changed`, `development.photos_changed`, `unit_type.added`, `unit_type.changed`, `unit_type.homes_made`, `unit_type.viewing_offered`, `unit_type.put_live`, `letting.own_values_set`: IDs, codes and counts.
- A let or withdrawn home no longer takes shared changes. Homes are never deleted, so a type's count can only grow past the homes made.
- Floor and floor area sit on the letting (`unit_floor`) and the type; a richer set of home facts (BA-14's) should read them when merged.

## Alternatives considered

- **A separate home and listing table (the live line's ADR-0018).** The redesign's letting already is the unit; a second model would split every query.
- **Reading shared values at render time.** Every reader (AI answers, checks, search, emails) would need to know about developments; copying with an own-values list keeps them unchanged.
- **Exempting developments from the burst signal.** Silent and exploitable; counting a scheme once says what it does.

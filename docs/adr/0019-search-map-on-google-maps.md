# ADR-0019: The search map and the lister's pin are on Google Maps, with homes' own points

- Status: Accepted (Q51 in open-questions.md). Brought across from the live line's ADR-0027 (its map part, decided by Sean on 8 November 2026, the other line's Q58), with the live map's build of 13 and 14 November. Replaces Q49's "the list alone" (UX-SR-8, OQ-7). Builds on ADR-0018 (Gaff's own place index).
- Date: 2026-11-19

## Context

- UX-SR-8 asks for a map beside search's results, behind "Map" on a phone. Q49 found Gaff's own copy of OpenStreetMap impractical to serve (a renderer dependency, tiles to build and host, and no points for homes), so search shipped the list alone.
- The live line built the map on Google Maps (the Maps JavaScript API only), approved by Sean, and hardened it against every way Google's script fails.
- A letting held an address, not a point. The live line's listers place a pin; no geocoding service is used. A pin at an area's centre misleads, so a home without a placed pin isn't on the map at all (M125).
- A private landlord's home is personal data. The redesign shows its address on its page, but a pin at its door says more, and a home's web address is a random reference so the map never names a person.
- Google's EEA terms forbid Places content beside a map: Gaff's place index (ADR-0018) suggests places, and Google draws the map.

## Decision

- **A point for each home:** `lettings.latitude`, `longitude`, `point_source` (`letter`) and `point_set_at`, whole or absent (a check), in Ireland (a check); a draft keeps it in its answers. The lister places or confirms it on "Where is it on the map?" after the address, starting on the address's street from the place index, or the area's middle (`src/server/lettings/location.ts`), and moves it from Home. Its event holds the area check and nothing of the point (rule 8).
- **What renters see:** an agency's or a landlord team's home at its pin; a private landlord's within about 150 metres (`publicPoint`: the live line's street-only rule). Pins are known by the home's public reference.
- **The map:** at 900px and up the list sits beside the map; below it, one control swaps them (the live line's 1128px split doesn't come across). Pins with the rent, clusters, homes at one point on one pin, a card for a chosen pin, a card and its pin lighting each other, and "Search this area" after the renter moves it: a map area (`area=` in the search's address) takes the place's role. The camera fits only when the area changes (M127).
- **"Near"** a street or landmark measures from homes' pins (M113), with "Within" from 500 m to 5 km; a home without a pin is matched by its address, as before.
- **Providers:** `MAP_PROVIDER` is `google`, `static` (the stand-in drawn from Gaff's own data, for development, tests, a preview copy and any copy without a key) or `none` (the list alone, and no pin to place). Production refuses the stand-in. No map for robots.
- **Failures:** every way Google's map can fail (blocked, no answer, a refused key, development mode, a map that never starts, a throw) ends in Gaff's one sentence, and the list carries on (`GoogleLoader`, `MapErrorBoundary`).
- **Counts:** `map_daily_counts`, fixed codes by Irish day (M133), on `/internal`, swept after 13 months.
- **The real map** is tested in its own build (`pnpm build:map && pnpm test:map`), nightly in `map.yml` with a key from the repository's secrets, and inert there without one.

## Consequences

- Renters see where homes are; the list stays complete without the map.
- Renters' devices call Google when a map is on screen. The privacy notice names Google Maps (an independent controller, under its Controller-Controller Data Protection Terms; no EU region; transfers under the EU–US Data Privacy Framework), and the DPIA covers it. Google is told the site's origin, never a page's address or what was searched.
- Map loads cost money past Google's free tier: a monthly budget with alerts, a daily cap per environment, one map reused across a visit, no map for robots or previews (docs/deploy.md).
- Homes listed before this, and homes read from an advert, have no pin until their lister places one from Home: they're in the list, not on the map.
- Drawing an area on the map (M128's drawing half) doesn't come across: the redesign's search has no drawn area (UX-SR-4's fixed list). The pan and zoom buttons do.

## Alternatives considered

- **The list alone** (Q49). Replaced by Sean's decision (Q51).
- **MapLibre with Gaff's own OpenStreetMap tiles** (Q49's plan). No vendor, but a renderer, tile building and hosting. It stays possible behind `MAP_PROVIDER`.
- **Points from an Eircode lookup** (Autoaddress, once its DPA is signed: Q40). One more `point_source`; the lister still confirms the pin.
- **Pinning every home at its area's centre.** Misleads renters about where a home is (M125).

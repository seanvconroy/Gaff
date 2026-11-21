# ADR-0018: Search uses Gaff's own place index, built from OpenStreetMap and kept in Postgres

- Status: Accepted (Q51 in open-questions.md). Brought across from the live line's ADR-0027 (its places part, decided by Sean on 8 November 2026), without its map: the redesign has no map yet (UX-SR-8, OQ-7).
- Date: 2026-11-19

## Context

- "Where" in search (UX-SR-4, UX-SR-5) matched a hand-made list of about 270 places, held in the browser (`src/domain/search/places-list.ts`). It was a stopgap: the environment it was built in couldn't reach OpenStreetMap. The founder found that "Kinsale" and "Highfield Road" suggested nothing.
- The live line already searches a real index: 100,310 places built from OpenStreetMap (every county, city, town, village, area, Dublin district, townland, street and landmark in the Republic), in Postgres, searched with `pg_trgm`.
- UX-SR-5 and rule 10: no search may be sent to a map or address provider. Google's Places terms also forbid storing its places or showing them beside another map, so places renters search and save must be data Gaff may keep.
- A search's address carries its place (UX-SR-12), a saved search keeps it (UX-SR-10), and search reads a sentence for a place (UX-SR-3). All of these used the list in code, synchronously.

## Decision

- **The index.** A `places` table: slug, kind (county, city, town, village, district, area, townland, street, landmark), names (English, Irish, aliases), context ("Rathgar, Dublin 6"), county, routing key, centre, box, a street's line, population, and `search_text` (the names normalised in TypeScript: no fadas, lower case, so no `unaccent`). A GIN trigram index and a prefix index on `search_text`. Reference data, the same for everyone, like the PSRA register: no organisation, no person, no row-level security.
- **The curated base stays the trusted core.** `src/domain/places/curated.ts`: every county and Dublin district, the main towns and the Dublin areas, hand-checked, with each Dublin area's district. The build keeps them slug for slug, and the loader puts them over the file's copies on every load. So is a short list of the other names the best-known landmarks go by (`src/domain/places/other-names.ts`, Q60: "UCD", "The Mater", "Kent Station"): each row of the index takes them as aliases as it is written, and a load of an index that hasn't changed writes the landmarks again, so the list needs no rebuild either.
- **Built offline, loaded on deploy.** `pnpm places:build` (osmium, in a GitHub workflow, quarterly) writes `data/places/places.ndjson.gz` to the repository; `pnpm places:check` tests it against the places renters must find; `pnpm places:load --deploy` in the Vercel build loads it, in one transaction, when its version is newer. Otherwise it refreshes the curated base only.
- **Suggestions from the server.** `GET /api/places?q=` ranks candidates the database finds (every word typed starts a word of the place, or a near spelling by `pg_trgm`) with the live line's rules (`src/domain/places/suggest.ts`), groups them as Places, Streets and Landmarks, counts the homes on Gaff beside areas (M121), and says when only near spellings matched ("Did you mean"). What found nothing is counted by day in `place_misses`, without digits, person or device, and deleted after 30 days (M124). With nothing typed, it gives the places with the most homes. Surnames are compared joined (Q60): "O Connell", "O'Connell" and "OConnell" are one name, as are "Mc Curtain" and "McCurtain", in what was typed and in each name it is compared with (`joinSurnames`); the stored text isn't changed, and the database is asked for both forms.
- **A search holds a slug.** Domain code never loads the index: the server passes a `Gazetteer` (the ~3,000 areas, cached in memory and checked for a new version once a minute, plus any street or landmark a search names) to the rules that read a sentence, match a home and name a place. A slug the index doesn't know is left out of a search. The first list's six IDs that differ from the index are mapped (`src/domain/search/place-slug.ts` for addresses, the migration for saved searches).
- **Areas and "near".** A county, city, town, village, district or area is matched against the home's address (UX-SR-4). A routing key is the home's Eircode's. A street, landmark or townland is searched "near" (M113): within 1 km in Dublin or a city and 3 km elsewhere, measured from the home's point once homes have one; until then, as far as the address allows (the street's name, or the landmark's neighbourhood, in the same county and Eircode area).
- **Recent places** are kept in the browser tab for the visit, for everyone, and never sent (M114 as UX-SR-11 allows: searching isn't recorded against a person).
- **Credit.** "© OpenStreetMap contributors" (ODbL) under the suggestions and on `/map-and-place-data`, linked from the suggestions, the map and Help (since Q60, 20 November 2026; before that, from under the search).

## Consequences

- Every place in Ireland the index knows can be searched, by its name, its Irish name, an alias, a typo or a routing key, and nothing typed leaves Gaff.
- Showing a chip, a saved search or an alert's words now needs the server (`placeNames`, `resolveSearch`); the browser holds no list of places.
- The repository carries a 7 MB data file, replaced each quarter. Each production deploy takes a second or two to check it, and about 20 seconds when it changes.
- The map package must give each home a point (`HomeAddress.point`) for "near" to measure distance, and may then add the distance control (M113's "Within" and "+ km"), which this package leaves out.
- `pg_trgm` must be enabled on Supabase if the app's role can't create it.

## Alternatives considered

- **Keep the list in the browser, made bigger.** 100,000 places is too much to send to every visitor, and streets would still be missing.
- **Google Places or Autoaddress for suggestions.** Sends what renters type to a vendor (rule 10, UX-SR-5); Google's terms forbid keeping its places.
- **`unaccent` in SQL.** Can't be used in an index; normalising in TypeScript when loading is simpler and faster.
- **Recent searches in the database (the live line's M114 for signed-in renters).** UX-SR-11 says searching isn't recorded against a person, so the redesign keeps them in the tab only.

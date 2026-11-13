# Renter search redesign: technical specification

Proposed, 8 November 2026 · goes with the [search redesign PRD](prd.md) · Sean took the product and vendor decisions the same day (Q57 to Q59); the CTO accepts this design before the build starts · [ADR-0027](../../adr/0027-places-index-on-google-maps.md)

## Summary

- **Place suggestions** come from a new `places` table in Postgres: every county, town, village, area, Dublin district, Eircode area, townland, street and landmark in the Republic. It's built from open data and searched with `pg_trgm`; names are normalised (fadas, apostrophes, "Co.") in TypeScript when they're loaded, so `unaccent` isn't needed. It replaces the 136 hand-typed places in `src/domain/places/gazetteer.ts`, which become its curated base.
- **The map** is Google Maps, through the Maps JavaScript API. It shows only Gaff's own content (homes, places, shapes), and is loaded only when it's on screen. No other Google API is called.
- **The page** is still server-rendered from its web address, so it works without JavaScript and search engines can read it. Small client islands handle the Where box, the filter bar, the Filters sheet, sort and the map. A change becomes a new web address, rendered in a transition.
- **It ships in one release** (Q59), on its own branch rather than behind `SEARCH_V2` (amended in the build; see decision 7).

Everything in the [marketplace technical specification](../tech-spec.md) still holds unless this document says otherwise. This document replaces its decision 6 (MapLibre with self-hosted tiles), and adds to decision 5 (search on Postgres).

## Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | Place suggestions | Gaff's own `places` index in Postgres, built from OpenStreetMap, Tailte Éireann, the CSO and the NTA | Google's EU terms forbid Places content "on, next to, or ... visually associated with any map, including a Google Map", except in Google's own widget. Area pages and alerts need places we can store. No per-search cost, and renters' typing stays in Gaff |
| 2 | Map | Google Maps JavaScript API: a vector map with a Map ID styled to match the tokens, and Advanced Markers | Sean's decision (Q58). Google hosts the tiles, which removes the tile-hosting spike. Only Gaff's content is on the map, and the API key allows the Maps JavaScript API only |
| 3 | Map libraries | `@vis.gl/react-google-maps` (MIT) and `@googlemaps/markerclusterer` (Apache-2.0) | The standard React components for the Maps JavaScript API, maintained by vis.gl with Google's support. They load only with the map |
| 4 | Drawing an area | A small freehand tool of our own on `google.maps.Polygon`, simplified in domain code | Google deprecated its Drawing Library in August 2025, with removal set for May 2026. A freehand outline is all M56 needs |
| 5 | State | The web address is the search. One codec reads and writes it, and changes go through `router.push` or `router.replace` in a transition | Shareable, bookmarkable and cacheable (M58). Back works, and so do alerts |
| 6 | UI building blocks | Native `<dialog>` for sheets, the Popover API for filter popovers, and the WAI-ARIA combobox for the Where box. No UI library | Accessible by default, small, and styled only with tokens (ADR-0011) |
| 7 | Release | On its own branch, which merges once the release checks pass; the old page goes in the same change. (Planned behind `SEARCH_V2`; dropped in the build, because a flag would have kept the old place list and page alive beside the index.) | Q59 |

## The shape

```
 phone / laptop (renter)
   │  GET /to-rent/dublin/rathmines?beds=2&max=2400   (server-rendered, cached 30 s; area pages static)
   │  GET /api/places?q=highf                          (our index; CDN-cached 10 min)
   │  GET /api/search/count?…   GET /api/search/points?…&bbox=…   (CDN-cached 30 s)
   │  Maps JavaScript API ──────────────▶ Google (only while a map is on screen)
   ▼
 Next.js on Vercel (Dublin) ──▶ Postgres on Supabase (Ireland)
                                  places (reference) · listing_places · public_listings
                                  place_misses (anonymous counts) · saved_searches
 GitHub Actions (quarterly): build the place index from open data ─▶ review ─▶ load
```

## Code layout

| Path | What changes |
| --- | --- |
| `src/domain/places/normalise.ts` | New. Lower case, no fadas, abbreviations ("rd" to road), "Co." and "County" dropped, Dublin districts and routing keys recognised. Used by the import, the API and the tests |
| `src/domain/places/suggest.ts` | New. Ranks candidate rows: match quality, kind, homes and population, and the mix of places, streets and landmarks |
| `src/domain/places/geo.ts` | Adds: point in polygon, distance to a line, bounding-box maths, and shape simplification (Douglas–Peucker) |
| `src/domain/places/gazetteer.ts` | Removed at release. A fixture of about 300 places replaces it in unit tests |
| `src/domain/search/area.ts` | New. Search areas: everywhere, county, place (with "+ km"), near (with "within"), routing key, map area, shape |
| `src/domain/search/url.ts` | New. The codec: path and query to a `Search` and back, in one canonical order (it extends `filters.ts`) |
| `src/domain/search/labels.ts` | New. Button labels, chips, counts and headings, in words from `src/copy/search.ts` |
| `src/domain/search/histogram.ts` | New. Rent buckets for M122 |
| `src/server/places/` | New. `suggest.ts` (SQL), `resolve.ts` (slug to place), `counts.ts` (homes per place), `misses.ts` (M124) |
| `src/server/search/search.ts` | Area conditions for the new kinds; `count.ts` and `points.ts` alongside |
| `src/app/api/places/route.ts` | The new grouped response |
| `src/app/api/search/count/route.ts`, `src/app/api/search/points/route.ts` | New |
| `src/app/(public)/to-rent/` | The page rebuilt: `SearchPage.tsx`, `bar/` (WhereBox, DistanceMenu, FilterButtons, FiltersSheet, Chips, SortMenu, SaveSearch), `results/` (ResultCard, Results, Pages, EmptyState), `map/` (SearchMap, GoogleMap, StaticMap, PricePin, ClusterPin, MiniCard, DrawTool) and `near/[slug]/page.tsx` |
| `src/ui/` | New components: `Combobox`, `Popover`, `Sheet`, `Chip`, `Segmented`, `MenuButton`, `PhotoCarousel` |
| `src/db/schema/places.ts` | New: `places`, `listing_places`, `place_misses` |
| `scripts/places/` | New: `build.ts`, `load.ts`, `check.ts`, `aliases.csv`, `test-set.csv`, `SOURCES.md` |
| `.github/workflows/places.yml` | New: build and check the index quarterly, or on demand |
| `src/copy/search.ts` | New words |

## Data model

### `places` (reference data: public zone, read-only for the app)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `slug` | text, unique | Area pages keep today's slugs ("rathmines"); clashes add the county ("highfield-road-rathgar-dublin-6") |
| `kind` | enum | `county`, `city`, `town`, `village`, `district`, `routing_key`, `area`, `townland`, `street`, `landmark` |
| `landmark_kind` | enum, null | `college`, `hospital`, `station`, `park`, `shopping_centre` |
| `name`, `irish_name` | text | From OSM `name` and `name:ga`, or the Tailte Éireann name |
| `context` | text | Shown under the name: "Rathgar, Dublin 6", "Town in County Cork" |
| `county` | text | One of the 26 counties |
| `parent_id` | uuid, null | The smallest area that contains it |
| `routing_key` | text, null | Districts and Eircode areas; for others, the routing key at the centre, where known |
| `centre_lat`, `centre_lng` | double | |
| `min_lat`, `min_lng`, `max_lat`, `max_lng` | double | The bounding box, which the map fits to |
| `boundary` | jsonb, null | Simplified polygon (at most 500 points), for counties, towns, areas and townlands |
| `line` | jsonb, null | Simplified line, for streets |
| `radius_metres` | integer | Used when there's no boundary |
| `aliases` | text[] | "D6", "Dublin 6", "Dun Laoghaire", and others from `aliases.csv` |
| `search_text` | text | Normalised name, Irish name, aliases and context |
| `population` | integer, null | CSO 2022, for towns and areas |
| `live_homes` | integer | Refreshed by a job (M121) |
| `indexable` | boolean | True for counties, cities, towns, districts and areas: these have area pages |
| `source`, `source_id` | text | `osm`, `tailte`, `cso`, `nta`, `gaff`; OSM rows stay separate from others (licence, below) |
| `version` | integer | The index build that loaded it |

Indexes: GIN `gin_trgm_ops` on `search_text`; B-tree on `slug`; B-tree on `(kind, live_homes desc)`. Expected size: about 5,000 places, 61,000 townlands, 80,000 to 120,000 streets and 2,000 landmarks, roughly 200,000 rows and under 150 MB. `pg_trgm` and `unaccent` are trusted extensions, installed in the migration. If the `gaff` role can't create them on Supabase, they're installed once from the dashboard, and the migration checks they're there.

### `listing_places` (public zone)

`(listing_id, place_id)`, written when a listing is published or moved. It records every area whose boundary contains the home's point, found in domain code (point in polygon). Area pages and counts read it, so they need no geometry in SQL.

### `place_misses` (M124, staff zone)

`(day, text, count)`: what renters typed that found nothing.

- Text with a digit is never kept, so no house numbers or full Eircodes. Text over 40 characters isn't kept either.
- No user, visitor hash or address is kept.
- Rows are deleted after 30 days. Staff see the top misses in their tools and add aliases.

### `recent_searches` (M114, renter zone)

`(user_id, area_path, query, label, searched_at)`, the last 5 for each signed-in renter. It's written once a search of a place is sent (after the response), is part of the renter's data download, and is deleted with the account. As built, it holds the place only: choosing a recent search keeps the renter's current filters, as choosing a suggestion does, so `query` stays empty for now. Signed-out visitors' recent searches stay in `sessionStorage` for the visit and are never sent to the server.

### Saved searches

No new columns. `area_path` can now be `/to-rent/near/{slug}`, and `query` can hold `km`, `bbox` and `shape`. A map area or shape is the renter's own search, kept in their zone and deleted with their account.

## The place index

### Sources

| Source | What we take | Licence and attribution | Refresh |
| --- | --- | --- | --- |
| OpenStreetMap, Ireland extract from Geofabrik | Places (city, town, village, hamlet, suburb, neighbourhood, quarter), townlands (admin level 10), named streets, and landmarks (universities and colleges, hospitals, rail, DART and Luas stations, large parks, shopping centres) | ODbL 1.0: "© OpenStreetMap contributors" | Quarterly |
| Tailte Éireann open data | County boundaries, Census towns, Electoral Divisions (to group Dublin areas where OSM has no boundary) | CC BY 4.0 | Yearly |
| CSO Census 2022 | Population of towns and areas, for ranking | CC BY 4.0 | With each census |
| National Transport Authority GTFS | Station names and positions, to check OSM's | CC BY 4.0, provided "as is" | Quarterly |
| Eircode routing keys | The 139 routing keys and the area each is named after | Public list | When it changes |
| `scripts/places/aliases.csv` | Our own aliases: "D6", "Dublin 6", spellings without fadas, common nicknames | Gaff's | When staff add one |

Only the Republic is loaded: anything outside the 26 counties' boundaries is dropped.

### Build, check and load

1. **Build** (`pnpm places:build`, in GitHub Actions, never in the Vercel build):
   - download the sources;
   - filter the OSM extract with `osmium` and convert it with GDAL's `ogr2ogr`. Both are command-line tools in the Action, not app dependencies;
   - merge the street segments that share a name within 300 m into one street per locality;
   - give every row its parent and context, from the boundaries;
   - normalise the names and attach the aliases;
   - write `places.ndjson.gz`, about 20 MB, as the build's artefact.
2. **Check** (`pnpm places:check`): load the artefact into a throwaway Postgres and run the 1,000-name test set (`test-set.csv`, Goals in the PRD). It must reach 98% or better, and 100% for counties, cities, towns and districts. It also writes a report against the last build: rows added, removed and renamed by kind, plus 50 random new names, for a person to look over.
3. **Load** (`pnpm places:load`, run by a person once the check passes):
   - copy into a staging table;
   - swap it in, in one transaction;
   - rebuild `listing_places`, then refresh `live_homes`;
   - bump the version that suggestion URLs carry, so cached answers expire.

### Licences

OSM-derived rows are kept separate from rows from other sources. Following the OSMF's Collective Database guideline, the index is then a collective database, not one derivative. The build scripts are published as the method of making it (ODbL 4.6), and a "Map and place data" page credits every source. The suggestions panel's footer links to it: "Places from OpenStreetMap and Tailte Éireann". The solicitor confirms this as part of Q36.

## Suggestions

### `GET /api/places?q=…&v=…`

- **Input:** `q`, 1 to 60 characters, validated with Zod. `v` is the index version, for caching.
- **Matching:**
  1. normalise the text (`normalise.ts`);
  2. if it's an Eircode or a routing key, look up the routing key first;
  3. in SQL, take up to 50 candidates whose `search_text` starts with the text, has a word starting with it, or is similar to it (`pg_trgm`'s `%` and `<%` operators, with the word-similarity threshold at 0.45).
- **Ranking** (`suggest.ts`, pure and unit-tested):

  ```
  score = match × kind + 0.05 × log10(1 + live_homes) + 0.02 × log10(1 + population)
  match: exact name or alias 1.0 · name starts with it 0.9 · a word starts with it 0.8 · similarity × 0.7
  kind:  county, city 1.0 · district, town 0.95 · area 0.9 · routing key, village 0.85
         street 0.75 · landmark 0.72 · townland 0.6
  ```

  Equal scores go by live homes, then the size of the place's county (Census 2022, `counties.ts`), then name, so of the many streets called "Highfield Road" or "Main Street", Dublin's come first. The SQL keeps its candidates in the same order, so a common name never loses a Dublin street to the limit. Then at most 3 streets and 2 landmarks (unless nothing else matches), one row per name and context, and 8 rows in all. Groups come in the order of their best item, so the best match is always first.
- **Response:**

  ```json
  { "groups": [
      { "kind": "places",    "items": [ { "slug": "kinsale", "name": "Kinsale", "context": "Town in County Cork", "homes": 4, "path": "/to-rent/cork/kinsale" } ] },
      { "kind": "streets",   "items": [ { "slug": "kinsale-road-ballyphehane-cork", "name": "Kinsale Road", "context": "Ballyphehane, Cork", "path": "/to-rent/near/kinsale-road-ballyphehane-cork" } ] },
      { "kind": "landmarks", "items": [] } ],
    "didYouMean": null }
  ```

- **No match:** the response includes the closest names by similarity (`didYouMean`), and the miss is counted (M124).
- **Caching:** the answer is our own data, so the CDN keeps it for 10 minutes (`s-maxage=600, stale-while-revalidate=86400`). Home counts can be up to 10 minutes old.
- **Limits:** the Vercel firewall rate-limits by IP address, and the response is at most 8 rows.
- **Budget:** p95 under 100 ms on the server, load-tested at 200 requests a second.

### The Where box on the client

- It fetches 120 ms after the last keypress and cancels any request still waiting.
- It keeps the last 20 answers in memory, so deleting a letter is instant.
- Recent searches (M114):
  - for signed-in renters, a `recent_searches` list of 5 in their zone, deleted with their account;
  - for everyone else, `sessionStorage` for this visit only, so nothing stays on the device.
- Choosing a suggestion navigates to its `path`, with the filters kept.

## Search areas

`SearchArea` (`src/domain/search/area.ts`):

| Kind | From | Homes that match |
| --- | --- | --- |
| `everywhere` | `/to-rent` | All live homes |
| `county` | `/to-rent/cork` | The home's county |
| `place` | `/to-rent/cork/kinsale`, optionally `km=3` | A `listing_places` row for the place. With `km`, also homes within that distance of its boundary (a box in SQL, then the exact distance in domain code). Places without a boundary use centre and radius, as today |
| `routing_key` | `/to-rent/dublin/dublin-6`, `/to-rent/cork/p17` | The home's routing key |
| `near` | `/to-rent/near/highfield-road-rathgar-dublin-6?km=1` | Within `km` of the street's line or the landmark's point |
| `map` | any path, plus `bbox=w,s,e,n` | Inside the box. The path's place is kept for the "back to Rathmines" link |
| `shape` | any path, plus `shape=` | Inside the drawn polygon: at most 100 points and 2,000 km², encoded with Google's polyline format |

Best match (the marketplace tech spec's formula, in `src/domain/search/ranking.ts`) uses the distance from the place for `near` and `+ km` searches, as it does for today's radius searches.

## Web addresses

- **Paths:** `/to-rent`, `/to-rent/{county}` and `/to-rent/{county}/{place}` are area pages, indexable when they have homes. `/to-rent/near/{place}` is `noindex, follow`.
- **Query, in canonical order:**
  - today's filters: `min`, `max`, `beds`, `baths`, `type`, `by`, `furnished`, `pets`, `parking`, `outdoor`, `access`, `ber`, `new`;
  - then `km`, `bbox`, `shape`, `sort`, `page` and `view` (`map` on phones).
- **`/search`** still turns a typed place into its canonical address, and now reaches the whole index.
- **History:** a new place, Show N homes, sort and page each push a new history entry. Map moves and quick-filter changes within a second replace the current one, so Back isn't flooded.
- **Redirects:** old addresses keep working. Every slug in today's list keeps its address, which the load step checks.

## Rendering and client state

- **The server component renders the whole page from the address:** results, count, chips, wider searches and the area heading. Without JavaScript, the bar falls back to plain GET forms, as today.
- **Client islands:**
  - `WhereBox`, the filter bar (`FilterButtons`, `DistanceMenu`, `SaveSearch`), `FiltersSheet` and `SortMenu`;
  - `PhotoCarousel` on each card;
  - `SearchMap`, loaded separately.
- **A change on desktop:**
  1. the codec writes the next address;
  2. `router.replace` or `router.push` runs inside `startTransition`;
  3. until the new page arrives, the results get `aria-busy`, dim, and show a progress bar;
  4. a polite live region then says the count ("23 homes in Rathmines").
- **The Filters sheet** keeps its choices locally. The count comes from `GET /api/search/count?…`, 250 ms after the last change: `{ total, histogram }`, cached 30 seconds. "Show 23 homes" sends the choices to the address.
- **Map and list stay in step** through a small React context: the home being hovered and the home chosen. A card sets them on hover or focus; a pin on hover or click.
- **Caching** follows the marketplace tech spec: area pages are static and regenerated by tag, and filtered pages are cached for 30 seconds. The count and points answers are also cached for 30 seconds.

## The map

### Loading

- `SearchMap` is a dynamic import. It loads after the results and only when its container is on screen (an `IntersectionObserver`, then `requestIdleCallback`). On phones that's when the renter taps "Map".
- Until then, nothing calls Google (M119). An end-to-end test checks this by watching requests.
- `MAP_PROVIDER` is `google` or `static`. `static` draws pins on a plain grid, for tests and for development without a key.
  - Production refuses `static`, as it refuses other stand-ins (`src/lib/env.ts`).
  - If Google's script fails, the map column shows M120's message and the list carries on.

### Points

`GET /api/search/points?{query}&bbox=…` returns `[{ id, lat, lng, rentCents }]`:

- every matching home in view, up to 2,000;
- about 30 bytes each, under 60 KB gzipped;
- cached 30 seconds;
- fetched 300 ms after the map stops moving, cancelling any request still waiting.

The mini card's details come from `GET /api/search/card?id=…`, cached 5 minutes.

Points are `public_listings.latitude` and `longitude`. These are already approximate (`approximate()`, a 150 m grid) when the letter chose not to show the exact address (M38). Homes on the same point cluster.

### Markers and clusters

- **Pins** are Advanced Markers whose content is our own element, a `PricePin`: a pill styled with tokens, showing "€2,250".
  - Chosen or hovered: navy with nav-ink text, and raised above the others.
  - Visited: a quieter tint.
- **Every pin is a button**, named "€2,250 a month, 2 bed apartment in Ranelagh, Dublin 6".
- **Clusters** use `MarkerClusterer` with our own renderer, a count in a circle. Choosing a cluster zooms in.
- Advanced Markers need a Map ID, so there's one per environment.

### Style

- **Cloud-based map styling** gives us light and dark Map IDs, picked from the theme. The colours are taken from the tokens: land `surface-2`, water a quiet Atlantic tint, roads `border`, and labels `ink-muted`.
- **Business markers are hidden; transport lines stay.** Design signs off the style.
- **Attribution:** our controls (Draw, the expand button) sit in the top corners. Google's logo, terms and "Report a map error" in the bottom corners are never covered. On the phone map view, the map ends above the row of cards, rather than running under it.
- **Floating elements** (pins, clusters, Draw, zoom, the mini card, the phone search pill) use `shadow-overlay`; the rest of the page keeps to hairlines.

### Moving and drawing

- **A move by the renter** (not one made by the code) commits `bbox` to the address with `replace`. The heading and the Where box then say "Map area", and the results refresh.
- **Reduced motion:** `prefers-reduced-motion` turns off animated camera moves.
- **Draw:**
  - pointer events on an overlay record the outline;
  - `geo.ts` simplifies it to 100 points or fewer;
  - it shows as a `google.maps.Polygon` and goes into `shape=`.
  - Esc cancels, and "Remove shape" clears it.
  - For keyboard users, the shape list has a "Use the map area instead" button.

### Google's terms, kept in code

The EEA terms apply, because Gaff is billed in Ireland.

- **Only Gaff's own content is on or next to the map.** We never call the Places, Geocoding, Directions, Routes or other Google content APIs. The key allows only the Maps JavaScript API, so a mistaken call fails.
- **The "Open in Google Maps" link** on listing pages stays a plain link with our coordinates.
- **Notices:**
  - Gaff's terms say the site includes Google Maps features and content, subject to Google's Additional Terms of Service and Privacy Policy (EEA Terms of Service 3.2.2);
  - the privacy notice names Google Maps.
- **No copying:** we never cache, copy or store anything from Google's map (Terms of Service 3.3.2(a) and (b)).
- **Roadmap only:** no satellite imagery or Street View in Gaff's maps; renters get those on Google's own site through the link. Pins and shapes are the letter's or renter's own input, never traced from Google's imagery. Point-in-polygon only ever uses our own points and boundaries (3.3.2(c)).

### Keys, quotas and cost

- **The key** is `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, with `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID_LIGHT` and `_DARK` beside it.
  - It's restricted to Gaff's domains by HTTP referrer: production, the test copy and the preview pattern.
  - It's restricted to the Maps JavaScript API.
  - Each environment has its own key and Map IDs.
- **The only billed item is map loads (Dynamic Maps):** 10,000 free a month, then about $7 per 1,000, falling at volume. Rough costs:

| Map loads a month | About |
| --- | --- |
| 10,000 | Free |
| 50,000 | $280 |
| 100,000 | $630 |
| 500,000 | $2,900 |

- **Spending is capped:**
  - the billing account has budget alerts at 50%, 80% and 100% of the founders' budget (PRD S1);
  - the API has a daily quota cap, so a spike can't run up the bill;
  - map loads go on the dashboard beside visits.

### Privacy

- **Google acts as an independent controller** for Google Maps Platform (its Controller-Controller Data Protection Terms; EEA Terms of Service 4.5). It offers no EU region. Google LLC is certified under the EU–US Data Privacy Framework.
- **When a map is on screen,** a renter's device sends Google its IP address and the map area. Nothing else is sent: no account, no search text, no home IDs.
- **Spike (first week):**
  - list every request Google's script makes, every cookie or storage item it writes, and anything it fetches from other Google hosts;
  - block Google's Roboto font with `font-src 'self'`. Google says loading it is optional.
- **If the script stores anything on the device,** the DPIA decides whether the map needs a "Show the map" tap the first time (PRD S2). The design is ready either way.
- **Records:** the privacy notice, the DPIA and the vendor list are updated before release (rule 10).

### Content Security Policy

`next.config.ts` adds the hosts in Google's CSP guide for the Maps JavaScript API, on the search pages (`/to-rent/...`) only, and only when the build has `MAP_PROVIDER=google`. Every other page keeps the policy without Google:

- `script-src` (with `'unsafe-eval'` and `blob:`, as the guide's allowlist has them), `img-src` and `connect-src` for `*.googleapis.com`, `*.gstatic.com` and `*.google.com` (and `*.ggpht.com` and `*.googleusercontent.com`, as listed);
- `frame-src *.google.com`, and `worker-src blob:` for the vector map.

`font-src` stays `'self'`: Google's Roboto is blocked, and the map's buttons use the page's font. The policy applies only in production builds, so a production-mode end-to-end run with the Google provider checks it before release.

## The letter's map pin (M38)

- The listing editor's location section shows a Google map on the home's area, with a pin to drag to the door. "Use the area's centre" is the fallback.
- The point is the letter's own data. No geocoding service is used: Google's geocoding results can't be stored or shown with a map under the EEA terms, and Autoaddress is still optional (rule 10).
- On publish, the point sets the home's area by point in polygon, its routing key when no Eircode was entered, and its `listing_places` rows.
- The public point is approximate when the letter chose that (`approximate()`).
- The test copy's made-up homes get realistic points in their seed.

## Accessibility

- **Combobox (WAI-ARIA APG):**
  - `role="combobox"` on the input, a `listbox` with `group`s labelled Places, Streets and Landmarks, and `aria-activedescendant`;
  - the number of suggestions in a polite live region;
  - a clear button named "Clear where";
  - Esc closes the list, then clears the text.
- **Popovers:** buttons with `popovertarget` and `aria-expanded`. Focus moves to the first control and returns to the button on close; a click outside closes them.
- **Sheets:** `<dialog>` with `showModal()`, named by their heading. Focus starts on the heading and returns to the opener on close. Esc closes. On phones they're full screen with safe-area padding, and the footer stays on screen.
- **Map:**
  - Google's keyboard controls;
  - pins are focusable buttons with names;
  - a "Skip the map" link;
  - every home on the map is also in the list.
- **Live regions** announce the count after any change, "Loading homes" while waiting, and the number of homes in the map area.
- **Targets and text:** controls at least 44px (48px on renter pages); text at least 16px; the page reflows at 320px. The chip row scrolls inside itself, and focus scrolls it.
- **Colour:** new pairs (ink on a white pin, nav-ink on a navy pin, a chip that's on) are added to `docs/design-tokens.json`'s contrast list first. The token tests check them in both themes.

## Performance

| Budget | Target |
| --- | --- |
| Search page JavaScript before the map | 120 KB gzipped (unchanged) |
| Our map code (Google's script not counted) | 60 KB gzipped |
| Keypress to suggestions, mid-range Android, 4G, p95 | 300 ms |
| `/api/places` server time, p95 | 100 ms |
| `/api/search/count`, p95 | 150 ms |
| `/api/search/points` for 2,000 homes, p95 | 200 ms |
| LCP, INP and CLS at p75 on phones | 2.5 s, 200 ms, 0.1 |

The first two cards' photos load first (as today). Skeleton cards keep their real size. The map column has a fixed size before the map arrives, so nothing moves.

## Measurement

First-party and cookieless (M103), through the existing views pipeline, as daily counts:

- `search_view`: area kind, how many filters are on, and a bucket of the result count;
- `suggestion_chosen`: kind, position and how many letters were typed;
- `filter_changed`: which filter;
- `map_opened`, `map_area_searched`, `shape_drawn`, `pin_opened`;
- `card_opened`: its position;
- `search_saved`.

None of them holds what was typed. Misses are counted only in `place_misses`.

## Security and abuse

- **The new endpoints** are GET-only, validated with Zod, and bounded:
  - `q` up to 60 characters;
  - a `bbox` centred on Ireland, up to 600,000 km² (the whole country, zoomed out);
  - a shape of at most 100 points and 2,000 km².
- **They hold no personal data,** are cached at the CDN, and are rate-limited by the Vercel firewall.
- **The Google key** is public by design, so it's locked to Gaff's referrers and to one API, with a daily quota. Rotating it is in `docs/deploy.md`.

## Testing

Test names start with the requirement ID (`M56: …`).

- **Unit tests (domain):**
  - the normaliser: fadas, abbreviations, "Co.", districts, routing keys, full Eircodes;
  - ranking, on the 300-place fixture with tricky names (Kinsale and Kinsealy, Highfield Road in Rathgar and in Cork, Dún Laoghaire, Cionn tSáile, Rathmins);
  - the codec's round trips and canonical order;
  - every kind of search area, including `+ km` around a boundary and distance to a line;
  - shape simplification and limits;
  - labels and chips, and histogram buckets.
- **The place test set:** `pnpm places:check` runs the 1,000 names against each new build. CI runs it weekly against the last artefact.
- **Integration tests:**
  - suggestion SQL on the fixture;
  - searches of each kind of area;
  - the count, points and card endpoints;
  - `listing_places` on publish;
  - `place_misses` keeping no digits;
  - row-level security: the public zone is read-only.
- **End to end (Playwright, with axe on every state, on phone and desktop):**
  - "Kins", then Kinsale's page;
  - "Highf", then Highfield Road, Rathgar, as a "near" search, then changing the distance;
  - "Kinsael" gives "Did you mean Kinsale?";
  - quick filters update the results and the address, and Back works;
  - the Filters sheet's live count and Clear all;
  - removing a chip;
  - sort;
  - pins and cards lighting each other up (static provider);
  - map area search;
  - drawing a shape (the static provider takes a scripted outline);
  - the phone map view and Back;
  - Save search, signed out and in;
  - every empty and error state;
  - no request to Google while no map is on screen.
- **The Google provider,** in a production-mode run with a test key, nightly and before release: the map loads, pins render, the CSP holds, and attribution is visible.
- **Screenshots** of every state, light and dark, in `screenshots/`.

## Migration from today

- **Places:**
  - the import gives every place in today's list the same slug, which the check enforces;
  - `gazetteer.ts` goes once the flag is on;
  - `placesWithHomes` and the sitemap read `places` and `listing_places`.
- **The suggestions API** gets a new response shape. The old Where box goes with the old page.
- **Saved searches** keep working unchanged.
- **The old page** stays behind the flag until release, then goes.

## Delivery plan

One release (Q59). Built in this order, with requirement IDs in commits and tests; L and M are as in the marketplace tech spec.

| # | Step | Requirements | Size |
| --- | --- | --- | --- |
| 1 | Spikes, in the first week: what Google's script stores and fetches; the CSP; a Map ID styled from the tokens; the `pg_trgm` extension on Supabase | M119, ADR-0027 | S |
| 2 | The place index: schema, build, check, load, the test set, `listing_places`, counts and misses | M56, M121, M124 | L |
| 3 | Search areas and the codec: `near`, `+ km`, map area, shape; the count, points and card endpoints | M56, M57, M113 | M |
| 4 | UI building blocks: Combobox, Popover, Sheet, Chip, Segmented, MenuButton, PhotoCarousel | ADR-0011 | M |
| 5 | The page: Where box, filter bar, Filters sheet, chips, sort, cards, pages, and the empty, loading and error states, on phone, tablet and desktop | M58 to M61, M114 to M116, M118, M122 | L |
| 6 | The map: Google provider and static provider, pins, clusters, mini card, map area search, drawing, the phone map view, the letter's map pin | M38, M57, M117, M119, M120 | L |
| 7 | Release checks: speed on a mid-range phone, load tests, a manual pass with VoiceOver and NVDA, privacy notice, terms, DPIA, budget alerts, the founders' walkthrough; then switch on and remove the old page | All | M |

## Risks and spikes

| Risk | Answer |
| --- | --- |
| Google's script stores something on renters' devices, so ePrivacy needs consent | Spike in week one. If so, a "Show the map" tap the first time (PRD S2), decided with the DPIA |
| Map costs grow with traffic | Loads only when on screen, a daily quota cap, budget alerts, and map loads on the dashboard. If it's needed later, MapLibre and self-hosted tiles still work behind `MAP_PROVIDER` |
| Something next to the map breaks Google's EEA terms | Only our own content; the key allows one API; a code review checklist item; the solicitor reviews the page (Q36) |
| OSM gaps: missing streets, or neighbourhoods without boundaries | Electoral Divisions grouped by hand for the top 200 areas, aliases, `place_misses` to find the rest, and the test set as the bar |
| Townlands crowd the suggestions | Ranked last, always with context, and only after more places match (PRD S3) |
| Duplicate street names in one town | Context from the smallest area, and merged segments within 300 m |
| The extensions can't be installed by the `gaff` role on Supabase | Install once from the dashboard; the migration checks they're there |
| Homes at approximate points pile up on one spot | Clusters, and the mini card lists every home at that point |
| Releasing everything at once delays renters getting better search | The flag lets the founders test on the test copy as each step lands |

## Vendors and data sources

| Need | Choice | Status |
| --- | --- | --- |
| Map | Google Maps Platform: the Maps JavaScript API only | Approved by Sean on 8 November 2026 (Q58). Google is an independent controller (Controller-Controller Data Protection Terms), with no EU region; transfers under the EU–US Data Privacy Framework. Named in the privacy notice before release |
| Place data | OpenStreetMap (ODbL), Tailte Éireann (CC BY 4.0), CSO (CC BY 4.0), NTA GTFS (CC BY 4.0) | Open data; attribution on the "Map and place data" page |
| Libraries | `@vis.gl/react-google-maps` (MIT), `@googlemaps/markerclusterer` (Apache-2.0) | Client-side only, loaded with the map |
| Build tools | `osmium-tool`, GDAL (`ogr2ogr`) | In GitHub Actions only |
| Address and Eircode lookup | Autoaddress | Still optional, and still needs approval. Not part of this release |

## ADR

- [ADR-0027](../../adr/0027-places-index-on-google-maps.md): Renter search uses our own place index, on Google Maps. It replaces the marketplace tech spec's decision 6 (MapLibre with self-hosted tiles; ADR-0020 was planned but never written).

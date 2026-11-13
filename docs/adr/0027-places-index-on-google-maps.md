# ADR-0027: Renter search uses our own place index, on Google Maps

- Status: Accepted (Sean, 8 November 2026: Q57 and Q58). Replaces decision 6 of the [marketplace tech spec](../marketplace/tech-spec.md) (MapLibre with self-hosted OpenStreetMap tiles; ADR-0020 was planned but never written). Adds to decision 5 (search on Postgres).
- Date: 2026-11-08

## Context

- Renters type a place and expect suggestions. Today's search knows 136 hand-typed places (`src/domain/places/gazetteer.ts`), so towns such as Kinsale, every village, every street and every landmark find nothing.
- The marketplace PRD has always needed a map (M57), but it was never built. The plan was MapLibre with self-hosted tiles. That carried a hosting spike (range requests and egress from Supabase Storage) and an OpenStreetMap extract to refresh.
- Sean asked what the best marketplaces use:
  - Airbnb suggests places with Google Places and shows Google Maps;
  - Zillow suggests from its own index of regions, schools and addresses, on Google Maps;
  - Rightmove and Daft suggest from their own location indexes.
- Gaff is billed in Ireland, so Google's EEA terms apply. They:
  - define "With any Map" as showing content "on, next to, or ... visually associated with any map, including a Google Map";
  - forbid Places API content (other than latitude, longitude and place ID) With any Map, except through Google's ready-made Places UI Kit (Service Specific Terms 15.1 to 15.3);
  - forbid copying and saving addresses, and caching beyond what's allowed (Terms of Service 3.3.2).
- So Airbnb's set-up isn't open to Gaff: our own dropdown of Google suggestions above a Google map would break 15.1. Google's widget is allowed, but it can't be styled as Gaff, show home counts or recent searches, or lead to our area pages. Area pages, sitemaps and alerts need places we can store, whatever suggests them.
- Google Maps handles personal data (renters' IP addresses), so it needs the founders' approval (rule 10).

## Decision

- **Places:** a `places` table in Postgres, searched with `pg_trgm` and `unaccent`. It holds every county, city, town, village, area, Dublin district, Eircode area, townland, street and landmark in the Republic, built quarterly from open data:
  - OpenStreetMap (ODbL);
  - Tailte Éireann and the CSO (CC BY 4.0);
  - the NTA (CC BY 4.0).

  Suggestions, area pages, alerts and the sitemap all read it. It replaces the hand-typed list.
- **Map:** Google Maps through the Maps JavaScript API (approved by Sean, Q58), with `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer`.
  - Only Gaff's own content is on or next to the map: homes, places and drawn shapes.
  - No other Google API is called. The API key is restricted to the Maps JavaScript API and Gaff's domains.
  - The map loads only when it's on screen, so renters' devices don't call Google otherwise.
  - Google's attribution is never covered.
- **Map pins for listings** come from the letter dragging a pin (M38). No geocoding service is used.
- **A switch:** `MAP_PROVIDER` is `google` or `static`. The static provider serves tests and development without a key. Production refuses it, as it refuses other stand-ins.

## Consequences

- Renters find any place, street or landmark, in Gaff's own dropdown, with home counts and recent searches. Suggestions cost nothing per search and are cached at the CDN.
- The tile-hosting spike and the OSM tile refresh go away. A place-index build replaces them: a GitHub Action, a 1,000-name test set, and a person who checks each build before it's loaded.
- **Renters' devices call Google when a map is on screen.** That changes a principle of ADR-0011 and the marketplace tech spec ("No Google or Mapbox scripts"). Consequences:
  - the privacy notice names Google Maps;
  - Gaff's terms carry Google's required notice;
  - the DPIA covers the transfer, under the EU–US Data Privacy Framework;
  - a spike checks what Google's script stores on the device, which decides whether the map needs a tap the first time;
  - Google's Roboto font is blocked by the CSP.
- **Google acts as an independent controller,** under its Controller-Controller Data Protection Terms, not a processor DPA, and offers no EU region. Rule 10's vendor list records this exception and its scope.
- **Map loads cost money** past 10,000 a month (about $7 per 1,000, falling at volume). Budget alerts and a daily quota cap keep it in hand.
- **The CSP** adds Google's hosts for the Maps JavaScript API.
- **Staying on Google** for good would make leaving costly. The map sits behind `MAP_PROVIDER`, and nothing else depends on Google, so MapLibre can come back if costs or rules change.
- **Licences:** OSM-derived rows are kept separate from other sources, as a collective database. The build scripts are published as the method, and a "Map and place data" page credits every source. The solicitor confirms this (Q36).

## Alternatives considered

- **Google Places in our own dropdown, as Airbnb does.** Not allowed under Google's EEA terms when a map is on or near the page.
- **Google's Places UI Kit widget.** Allowed, but Google-styled. It can't show home counts, recent searches or our area pages, it loads Google's script on every search page (phones included), and it's billed per session. Sean chose our own index instead (Q57).
- **Our own index, with Google for misses.** Still Google content in our dropdown, so the same EEA problem.
- **MapLibre with self-hosted OpenStreetMap tiles** (the old plan). No vendor and no per-load cost, but a tile-hosting spike, a less familiar map, and more work before launch. Sean chose Google Maps (Q58). It stays possible behind `MAP_PROVIDER`.
- **Mapbox** for the map and search. Another vendor, per-load and per-search costs, and the same question of storing its results.
- **An Eircode address service (Autoaddress)** for suggestions. Renters search for areas, not addresses, and it adds a cost per lookup. It stays optional for letters' addresses.

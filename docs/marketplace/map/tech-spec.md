# The live map: technical specification

Draft, 8 November 2026 · CTO · goes with the [PRD](prd.md) (M125 to M137; amends M38, M117, M119 and M120) · builds on the [search redesign technical specification](../search-redesign/tech-spec.md) and [ADR-0027](../../adr/0027-places-index-on-google-maps.md)

## Summary

The map is built. This work makes it real and ready for renters. It stays inside the monolith, with no new vendor and no new service:

- **a week of spikes** on a development key, for the answers only Google's real script can give;
- **a hardened provider:** every failure caught; a camera that moves only when it should; one clusterer per map; same-point pins; bigger, keyboard-friendly pins; the theme; a loading state; and drawing without dragging;
- **real points:** the letter's map pin (M38), points that record where they came from, and realistic points for the test copy;
- **headers per page:** Google's content security policy, and a referrer policy Google's key restriction can work with, only on pages that show a Google map;
- **spending and counts:** daily caps and budget alerts, no map for robots or previews, and first-party counts;
- **a real-map test run,** every night and before each release, beside the stand-in runs on every change;
- **a runbook** for setting up, watching, turning off and rotating.

Everything in the search redesign's technical specification still holds unless this document says otherwise.

## Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | Detecting failure | Three signals: the script's load error (`APIProvider`'s `onError`), Google's `gm_authFailure` hook, and a watchdog that fails the map if Google hasn't drawn it (no first `tilesloaded`) within 10 seconds | Google documents `gm_authFailure` for key problems only. Over the cap, Google logs `OverQuotaMapError` to the console, with no documented hook. The watchdog catches whatever's left, including a content security policy block |
| 2 | Google's script version | The quarterly channel in production and on the test copy. The nightly test run also tries the weekly channel | Fewer surprises in production, and a warning of the next quarter's changes |
| 3 | The dark map | `colorScheme`, set from Gaff's theme when the map is created, on one Map ID whose style has light and dark variants, if spike D shows Map IDs support that. Otherwise today's two Map IDs | Google applies `colorScheme` only when a map is created |
| 4 | Clustering | One `MarkerClusterer` per map, created in an effect and removed in its cleanup. Homes at one point are grouped in domain code first. Hovering changes a pin's look, never the clusters | Today's clusterer outlives its map, and every hover re-clusters every pin |
| 5 | The camera | It fits only when the search area's key changes. A move counts as the renter's only when one of their gestures started it | Filter changes and resizes mustn't move the map or search its area |
| 6 | Drawing | Screen points converted with an `OverlayView`'s projection; tilt and rotation off; a mode for tapping corners | Correct on any map; WCAG 2.5.7 |
| 7 | Headers | Pages that show a Google map get Google's content security policy and, if spike B shows it's needed, `Referrer-Policy: strict-origin`. Every other page is unchanged | Private links still never leak. Google's website restriction can check the origin |
| 8 | The page's address | If spike A shows Google's script sends Google the page's address, the map runs in a same-origin frame at a fixed address, `/to-rent/map-frame`, and talks to the page with `postMessage` | The only reliable way to keep the search, including accessibility features, from Google |
| 9 | Points | `homes.point_source` records where each point came from. Only the letter's points (and the test copy's seeded points) go on the map | M125 |
| 10 | Counts | A small `map_daily_counts` table, written through the existing beacon route | M133, with no cookies and no visitor hash |
| 11 | Testing the real map | A `google` Playwright project, run nightly and before each release, with a key restricted to the test server's address and a tiny daily cap | Real behaviour, without a Google key in every pull request |

## Week one: spikes

On a development key restricted to `http://localhost:3000/*` and the Maps JavaScript API, in a production build (`pnpm build && pnpm start`), so the content security policy applies. Each spike ends with a few lines under [Findings](#findings).

| # | Question | How | Decides |
| --- | --- | --- | --- |
| A | What does Google's script send, store and fetch? | DevTools and a HAR file, in a fresh browser profile and one signed in to Google, on Chrome for Android, Safari on iOS and a laptop. List every request (host, path, the names of its query parameters, and whether the page's address or its query appears in any of them), the cookies sent and set, what's written to `localStorage`, `sessionStorage`, IndexedDB and Cache Storage, and any frames | S2 and M134, decision 8, the DPIA and the privacy notice |
| B | Does `Referrer-Policy: no-referrer` break the key's website restriction? | Load the map with the restricted key under `no-referrer`, then under `strict-origin`, and read the console for `RefererNotAllowedMapError` | Decision 7 |
| C | Does the map work without `'unsafe-eval'`, and is every host in the policy needed? | Remove sources one at a time and watch for violations. Try Google's nonce-based policy with Next.js nonces | A tighter policy |
| D | Can one Map ID carry light and dark styles, chosen by `colorScheme`? | Style a Map ID with both, and create maps with `LIGHT` and `DARK` | Decision 3, S7 |
| E | What does each failure look like? | A cap of 5 map loads a day on the development project; a wrong key; a scratch project with billing off; Google's hosts blocked. Time each to Gaff's sentence | The watchdog's timing |
| F | Does the map run in a sandboxed frame? | The frame with `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, without `allow-same-origin` | Whether decision 8's frame is sandboxed |
| G | How heavy is the real map? | 2,000 synthetic pins on a mid-range Android phone: frame times while panning and hovering, INP, and memory | The cluster radius and how pins render |

### Findings

Empty until the spikes run. Each finding records the date, the browser and what was seen, and links the decision it settles.

## Code layout

| Path | What changes |
| --- | --- |
| `src/app/(public)/to-rent/map/GoogleMap.tsx` | Split into `google/Loader.tsx` (the provider, failure detection and the watchdog), `google/Camera.tsx`, `google/Pins.tsx` (the clusterer, raised pins and same-point pins), `google/AreaOutline.tsx` and `google/DrawLayer.tsx` |
| `src/app/(public)/to-rent/map/SearchMap.tsx` | Load timing, the theme, counts, failure kinds, and the same-point list in the mini card |
| `src/app/(public)/to-rent/map/StaticMap.tsx` | Same-point pins, drawing by tapping corners, and the same gesture rules, so the stand-in keeps behaving like the real map in tests |
| `src/app/(public)/to-rent/map/map.module.css` | The pin's hit area and `border-strong` edge, the focus ring, raised pins, the fade-in, and pins that follow the map's scheme |
| `src/app/(public)/to-rent/map-frame/` | New, only if decision 8 applies: the frame page and its side of the messages |
| `src/domain/map/` | New, pure and unit-tested: `points.ts` (grouping by point), `camera.ts` (the area key, and when to fit), `gestures.ts` (whose move it was), `theme.ts`, and `messages.ts` (the frame's messages, as Zod schemas) |
| `src/domain/places/street.ts` | New: the address's street among candidate streets, by normalised name (`normalise.ts`) |
| `src/server/listings/location.ts` | New use case: `setHomePoint` |
| `src/app/(workspace)/lettings/[lettingId]/listing/LocationPicker.tsx` | New: the letter's pin, on the same providers |
| `src/server/search/search.ts` and `src/app/api/search/points/route.ts` | Only homes with a placed point |
| `src/server/dev/seed.ts` | Points on real streets for the made-up homes |
| `src/db/schema/homes.ts`, `listings.ts`, `measurement.ts` | `homes.point_source` and `point_set_at`; `public_listings.on_map`; the `map_daily_counts` table |
| `src/app/api/v/route.ts` | Also accepts the map's counts |
| `src/app/(public)/to-rent/SearchPage.tsx` | No map for robots |
| `next.config.ts` | Headers for map pages |
| `src/lib/env.ts` | `GOOGLE_MAPS_VERSION`, and the production checks |
| `tests/e2e/map-google.spec.ts`, `playwright.config.ts`, `.github/workflows/map.yml` | The real-map run |
| `tests/compliance/no-trackers.test.ts` | The referrer policy, page by page |
| `docs/deploy.md` | The runbook |

## The provider, hardened

### Loading and failure (M119, M120, M131)

- **When it loads:** `SearchMap` mounts the provider once the column is on screen (`IntersectionObserver`), the page's `load` event has fired (the first photos load eagerly, so they're in by then), and the browser is idle (`requestIdleCallback`, with a 2-second timeout). Google's script then never competes with the photos that decide LCP. On phones, the tap on Map already does this.
- **Robots:** `SearchPage` passes no map settings when `isLikelyBot()` (`src/domain/measurement/views.ts`) matches the request's user agent.
- **Failures,** each reported once, with its kind:
  - `script`: `APIProvider`'s `onError` (a blocker, the network, the content security policy);
  - `auth`: `window.gm_authFailure`, set before the script loads and removed on unmount (the key, the allowed websites, billing, an expired key);
  - `timeout`: no first `tilesloaded` within 10 seconds of creating the map (the cap, an outage, anything else);
  - `frame`: the frame didn't say it was ready within 10 seconds (decision 8 only).
- **On a failure,** the provider unmounts, so Google's error box is never seen, and M120's sentence takes its place. The phone's map view keeps the List button.
- **Fading in:** the map's element stays transparent until the first `tilesloaded`, then fades in over `motion-fast` with `ease-standard`. With reduced motion it appears at once. The column's background (`surface-2`) holds the space meanwhile, so nothing moves.
- **Reuse:** `reuseMaps` stays, so moving between searches in a visit doesn't create (and bill) another map. The clusterer, overlays and listeners are removed on unmount, so a reused map starts clean.

### The camera (M127)

- **`cameraKey(area)`** (`src/domain/map/camera.ts`): the area's kind and the values that define it: the place and distance, the street and distance, the box, or the shape. Filters, the sort and the page aren't part of it.
- **`shouldFit(previousKey, nextKey, lastRenterBox)`:** fit when the key changes, except when the new area is the map area the renter has just made by moving the map.
- **Whose move it was** (`src/domain/map/gestures.ts`): a move is the renter's only if a gesture started it:
  - `dragstart`;
  - `wheel`, `pointerdown` or `touchstart` on the map;
  - the pan and zoom buttons;
  - the map's keyboard keys.

  A `ResizeObserver` on the map's element marks the next `idle` as the page's own, as do the page's fits and the mini card opening. `onMoved(view, byRenter)` keeps its signature, so `SearchMap` and the stand-in don't change.
- **Fitting** uses `fitBounds` with `space-6` of padding, so the area's outline never touches the edge. It's never repeated after a renter's move.

### Pins and clusters (M117, M125)

- **`groupByPoint(points)`** (`src/domain/map/points.ts`): points within 5 m of each other form one group, `{ key, lat, lng, homes, fromRentCents }`. A group of one is a price pin; a larger group is a same-point pin, "3 homes", named "3 homes here, from €1,850 a month".
- **One `AdvancedMarker` per group.** Clicking one chooses it. Focusing it (the marker is an HTML element) sets the hovered home, as the stand-in does, so its card lights up.
- **`MarkerClusterer`** keeps our renderer. Its radius is set from the pin's width (spike G), so pins don't overlap at middle zooms. Its maximum zoom sits below the map's, so homes at one point stop clustering and become a same-point pin before the last zoom.
- **Hovering** sets `data-on` and raises the `zIndex` of that home's marker, and nothing else. If the hovered home is inside a cluster, a separate raised pin shows above the cluster. The clusterer isn't touched.
- **Hit area:** a transparent `::before` makes each pin at least 44px tall, while the pill looks as it does today.
- **Edge and focus:** pins are edged in `border-strong`. Google draws its own focus outline on focusable markers. If spike G shows it can be styled, it becomes Gaff's `focus` ring; otherwise Google's stays.
- **Same-point lists:** choosing a same-point pin turns the mini card into a short list (photo, rent, rooms and a link for each home). On phones, the row of cards scrolls to the first of them and marks them all. Each card comes from the cached `GET /api/search/card` answer, as today.

### Only real points (M125)

- **`homes.point_source`:** `area` (today's centre of the area), `letter` (placed by the letter) or `seed` (the test copy's made-up homes).
- **`public_listings.on_map`** is true when the point is `letter` or `seed`, set whenever the listing is projected.
- **`mapPoints`** reads only rows that are `on_map`. The list, the count and alerts read every home, as now.
- **Approximate points** stay as they are: `approximate()` snaps the public point to a grid of about 150 m when the letter shows only the street and area.

### The theme (M129, M130)

- **`resolveTheme(dataTheme, prefersDark)`** (`src/domain/map/theme.ts`): the `data-theme` on `<html>` first, then the device's setting.
- **The map is created** with `colorScheme` from it (decision 3), or with the dark Map ID. If the renter changes the theme while the map is open, the map is created again (one more map load; theme changes are rare).
- **Pins follow the map, not the page:** the map's element carries `data-map-scheme="light"` or `"dark"`, and `scripts/build-tokens.ts` also writes the colour tokens under those two selectors. A light map on a dark page gets light pins.

### Drawing (M56, M128)

- **`DrawLayer`** converts screen points with an `OverlayView`'s `getProjection().fromContainerPixelToLatLng()`, instead of today's arithmetic, so it stays right at any zoom.
- **The map has tilt and rotation off**, and their gestures disabled, so the outline drawn is the outline searched.
- **Tapping corners:** a tap (down and up within 8px and 300 ms) adds a corner. A drag draws freehand, as today. "Done", "Undo" and tapping the first corner again finish or change the shape. The same simplification and limits apply (`MAX_SHAPE_POINTS`, `MAX_SHAPE_KM2`).
- **The stand-in** gets the same two modes, so the end-to-end tests cover both.

### Controls and limits

- **Google's camera control** (pan arrows and zoom) at `RIGHT_TOP` (S8), in place of the zoom control. Fullscreen, map type and Street View controls stay off. `clickableIcons` stays false, and `keyboardShortcuts` true.
- **Draw** stays at the top left. The mini card stays clear of the map's bottom 40px. On the phone's map view, the row of cards ends above Google's logo and terms. The real-map run checks that none of our elements overlaps Google's logo or terms, on a phone and a laptop.
- **The map can't wander:** a `restriction` around the island of Ireland with a margin (`strictBounds: false`), and a minimum zoom chosen so that the largest map column's view stays inside `MAX_BBOX_KM2` (600,000 km²). A unit test checks the zoom against the widest and tallest column.

## The letter's map pin (M38, M126)

### Data

| Column | Type | Notes |
| --- | --- | --- |
| `homes.point_source` | enum: `area`, `letter`, `seed` | Where the point came from. Existing homes get `area`; the seed writes `seed` |
| `homes.point_set_at` | timestamptz, null | When the letter saved the point |
| `public_listings.on_map` | boolean | False for `area` points (M125) |

### The picker

- **`LocationPicker`** (client) is a new "Where is the home?" section in the listing editor, next to "How much of the address can renters see?". It uses the same provider switch: Google, or the stand-in in tests and development.
- **Where it starts** (`startPoint`, server side):
  1. take the street from the first line of the address (`streetOf` in `src/domain/listings/projection.ts`) and normalise it;
  2. find `places` rows of kind `street` with that name in the home's county, whose line passes within 2 km of the area's centre (`src/domain/places/street.ts`);
  3. start at the nearest one's line, at zoom 17. Otherwise start at the area's centre, at zoom 15.
- **Moving the pin:** a draggable Advanced Marker (`gmpDraggable`). A tap on the map moves the pin there. With the pin focused, the arrow keys move it by about 10 m, or 50 m with Shift. When it stops, a polite live region names where it is ("The pin is on Highfield Road, Rathgar, Dublin 6"), from the place index: the nearest street within 50 m, and the smallest area that contains the point.
- **`setHomePoint(member, lettingId, point)`** in `src/server/listings/location.ts`:
  - validates the point with Zod: finite, and inside Ireland (`inIreland`);
  - inside `withOrg()`, writes the point, `point_source = 'letter'` and `point_set_at`, with the event `home.point_set` in the same transaction;
  - the event's payload is `{ homeId, insideAddressArea }`, never the coordinates: a private landlord's home is personal data (rule 8, ADR-0006);
  - if the listing is live, projects it again, which rewrites its public point and its `listing_places` rows.
- **The check (M126):** the point is tested against the boundary of the area in the address (`pointInPolygon` in `src/domain/places/geo.ts`), or against its centre and radius when the area has no boundary. Outside it, the picker asks the letter to confirm, and the letter can keep it.
- **Publishing** needs `point_source` to be `letter` (or `seed` on the test copy). The publish checklist links to the section: "Place the pin".
- **Homes already live without a pin** get a task among "what needs a person today" (R28): "Place the pin for 14 Rathmines Road".
- **The workspace page with the picker** gets the map headers (below), and nothing else in the workspace loads Google.

### The test copy's homes

- `src/server/dev/seed.ts` gives each made-up home a point on a real street in its area. The points are taken once from the place index and written into the seed, so the seed doesn't need the index, with `point_source = 'seed'`.
- About a third of the made-up homes hide the exact address, so approximate points are tested too.
- Street names are real; house numbers are made up, and no point is a real person's home. A unit test checks each seed point is inside its area's bounding box.

## Headers on map pages (decision 7)

- **`next.config.ts`** builds its header rules from one list of map pages: `/to-rent/:path*`, `/lettings/:lettingId/listing` (the picker), and `/to-rent/map-frame` if decision 8 applies.
- **On those pages,** when the build has `MAP_PROVIDER=google`:
  - Google's content security policy, as today, tightened by spike C;
  - if spike B shows `no-referrer` breaks the key's restriction, `Referrer-Policy: strict-origin`, which sends Google the site's origin, never a path or query.
- **Every other page** keeps `no-referrer` and the policy without Google. Renters' and landlords' private links (`/r/…`, `/l/…`) never get either.
- **`tests/compliance/no-trackers.test.ts`** adds: the referrer policy page by page; private links always `no-referrer`; Google's hosts only on map pages.

## Privacy: what Google receives

- **Spike A lists it.** Expected: the device's IP address and browser details with every request to Google; the map's area and zoom in the tile requests; the key; and possibly the page's address, in the calls the script makes to check the key and count usage.
- **Gaff itself sends Google nothing:** no home IDs, no search, no account.
- **If the page's address reaches Google (decision 8):** the search page's address carries the search's filters, and one of them (`access`) lists the accessibility features a renter needs. So the map moves into a frame:
  - `/to-rent/map-frame` renders only the Google provider and has no query string. The search page embeds it in the map column, as `<iframe title="Map of the homes in this search">`;
  - Gaff's pages all send `frame-ancestors 'none'` and `X-Frame-Options: DENY`. The frame page alone sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` instead, so Gaff, and only Gaff, can embed it;
  - the page and the frame talk with `postMessage`. The page accepts a message only from the frame's own window (and from Gaff's origin, unless the frame is sandboxed, when the origin reads `null`), and every message is parsed with a Zod schema (`src/domain/map/messages.ts`):
    - page to frame: `start` (box and theme), `pins`, `hover`, `choose`, `area` and `draw`;
    - frame to page: `ready`, `moved` (box, and whether the renter moved it), `hover`, `choose`, `drawn` and `failed` (with its kind);
  - Draw, the mini card and the row of cards stay in the page, over the frame;
  - the frame gets Google's headers, and the search page itself goes back to the policy without Google, a gain in its own right;
  - the frame is sandboxed if spike F shows the map works that way;
  - the stand-in stays in the page, so the main end-to-end runs don't change, and the real-map run covers the frame.
- **The DPIA and the privacy notice** record what spike A found; Google's role (an independent controller, under its Controller-Controller Data Protection Terms); the lack of an EU region; and the transfer basis (the EU–US Data Privacy Framework).
- **ePrivacy (S2):** if spike A finds Google's script reads Google's cookies or stores anything beyond what the map needs, the solicitor decides whether the map on larger screens waits for a tap (M134). The choice is kept in `sessionStorage` for the visit, or as a setting on a signed-in renter's account. Never a cookie: `no-trackers.test.ts` already forbids Gaff's own cookies, other than the sign-in session.

## Spending (M132, M135)

- **A Google Cloud project per environment** (production, the test copy, and the real-map test run), under one billing account. Caps apply to a project, not a key, so each environment gets its own key, Map ID and cap, while billing adds their usage together.
- **Daily caps** on the Maps JavaScript API's map loads per day: production from S1 (1,500 proposed); the test copy 300; the test run 100.
- **The budget** is on the billing account, with alerts at 50%, 80% and 100% to both founders and the CTO. Budget alerts only warn; the caps are what stop spending.
- **Daily caps reset at midnight Pacific time,** about 8am in Ireland. Until then, M120's sentence shows.
- **No billed map** for robots (above); for preview copies, which get `MAP_PROVIDER=static` in Vercel's Preview environment and no key; or for moving between searches in a visit (reuse).
- **Turning the map off (M135):** `MAP_PROVIDER=none` in Vercel, then a redeploy, a few minutes. The list fills the page. The content security policy follows on the same build.

| Map loads a month | About |
| --- | --- |
| 10,000 | Free |
| 45,000 (1,500 a day) | $245 |
| 100,000 | $630 |

## Counts (M133)

- **`map_daily_counts`** `(day, event, kind, count)`, in the staff zone. `kind` is a short code: `phone` or `larger` for opens, and `script`, `auth`, `timeout` or `frame` for failures. No user, visitor hash, IP address, area or search is kept. Rows are deleted after 13 months by the nightly retention job.
- **The page** sends `navigator.sendBeacon('/api/v?m=opened&k=larger')`. `/api/v` checks `m` and `k` against fixed lists (Zod), adds one, and ignores robots.
- **Events:** `opened`, `shown` (the first tiles drawn), `failed`, `area_searched`, `shape_drawn`, `pin_opened` and `group_opened`.
- **Staff** see a month of counts on a staff page, beside the month's billed map loads, which they copy from Google's console.
- **A daily check** (a job) emails the CTO when failures pass 5% of opens on a day with 50 opens or more.

## Testing

Test names start with the requirement ID (`M127: …`).

- **Unit tests (domain):**
  - `groupByPoint`;
  - `cameraKey` and `shouldFit`: a filter change never fits, and a renter's map area never refits;
  - gestures: resizes, a phone's toolbar and the page's own fits never count as the renter's;
  - `resolveTheme`;
  - the street the picker starts on, including streets of one name in different towns;
  - the minimum zoom against `MAX_BBOX_KM2`;
  - the frame's message schemas, if it's built.
- **Integration tests:**
  - `setHomePoint`: row-level security, the event with no coordinates, projecting again, `listing_places`;
  - points leave out `area` homes, and approximate hidden addresses;
  - `map_daily_counts` takes only the listed codes, and ignores robots.
- **End to end with the stand-in** (every change, with axe on every state, on a phone and a laptop):
  - a filter change keeps the map's view, and resizing the window doesn't search the map area;
  - a same-point pin lists its homes;
  - drawing by tapping corners;
  - focusing a pin lights up its card;
  - the letter places a pin by dragging, tapping and the arrow keys, and sees the area check;
  - M120's sentence when the provider fails (a test-only switch makes the stand-in fail).
- **The real map** (`tests/e2e/map-google.spec.ts`, Playwright project `google`, run by `.github/workflows/map.yml` every night, on demand and before each release):
  - a production build with `MAP_PROVIDER=google` and the test run's key, restricted to `http://localhost:3000/*` and the Maps JavaScript API, with its cap of 100 a day. The key is a GitHub Actions secret, never available to pull requests from forks;
  - nothing requests a Google host (`page.on('request')`) while a phone shows the list, or before the map column is on screen and the results have shown; requests start once the renter taps Map;
  - the map appears (the first `tilesloaded`); price pins are buttons with their names; a pin opens its mini card; a cluster zooms in;
  - Google's logo and terms are visible, and nothing of ours overlaps them, on a phone and a laptop;
  - no content security policy violation, other than Google's font;
  - Google's hosts blocked (`page.route`): M120's sentence; a wrong key: M120's sentence within 10 seconds;
  - the referrer policy and the key's restriction work together;
  - screenshots of each state, for a person to look over. They aren't compared pixel by pixel, because Google's map changes.
- **The manual check list,** before each release that changes the map:

| Area | Check |
| --- | --- |
| Browsers | Safari on iOS (the latest and the one before), Chrome on a mid-range Android phone, and Chrome, Edge, Firefox and Safari on a laptop |
| Screens | 320px, 375px, 744px, 1128px, 1440px and 1920px wide; a tablet in portrait and landscape |
| Settings | Light and dark, chosen in Gaff and from the device; reduced motion; text zoomed to 200% |
| Assistive technology | VoiceOver on iOS, NVDA on Windows, and the keyboard alone |
| Networks | Slow 4G, going offline after the page loads, and an ad blocker that blocks Google (uBlock Origin) |
| Data | All of Ireland with every test home; a place where homes share a point; a development; a home with its address hidden; a search with no homes |
| Cost | After a day of testing, Google's console and `map_daily_counts` agree to within 10% |

## The runbook

[deploy.md](../../deploy.md)'s step 6 becomes a runbook:

1. **Projects and owners (S9):** `gaff-maps-production`, `gaff-maps-test` and `gaff-maps-ci`, under Gaff's billing account, with both founders as owners and the CTO as an editor.
2. **APIs:** the Maps JavaScript API, and nothing else.
3. **Keys:** one per project, restricted to websites and to the Maps JavaScript API: production's own domain; the test copy's `https://gaff-test.vercel.app/*`; and, for the test run, `http://localhost:3000/*`. Preview copies have no key.
4. **Map IDs and styles:** a JavaScript, vector Map ID per project, styled from this table, which comes from `docs/design-tokens.json`. When those tokens change, the styles are updated by hand:

   | Map feature | Token | Light | Dark |
   | --- | --- | --- | --- |
   | Land | `surface-2` | `#ede6da` | `#202836` |
   | Water | `sky` | `#c9d8ea` | `#24334b` |
   | Roads | `border` | `#d8cfc0` | `#2c3544` |
   | Labels | `ink-muted` | `#4a5262` | `#b3bccb` |
   | Label outlines | `surface-1` | `#fffdf9` | `#171d28` |
   | Businesses and other points of interest | hidden | | |
   | Transport lines and stations | shown, in Google's colours | | |

5. **Caps and budget:** the daily caps and the budget alerts above.
6. **Vercel settings,** per environment: `MAP_PROVIDER`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID` (and `GOOGLE_MAPS_MAP_ID_DARK` if decision 3 needs it) and `GOOGLE_MAPS_VERSION=quarterly`, then a redeploy.
7. **Check it:** today's checks, plus no `RefererNotAllowedMapError` in the console, and M120's sentence with the network turned off.
8. **Turning the map off:** `MAP_PROVIDER=none` and a redeploy. Set it back to `google` to restore.
9. **Rotating a key:** create a new key with the same restrictions, set it in Vercel and redeploy, check the map, and delete the old key the next day.
10. **If a key is used elsewhere:** the website restriction turns other sites away in a browser, but a referrer can be faked outside one, so the daily cap is the backstop. If billed loads rise while visits don't, rotate the key.
11. **Every month:** compare billed loads with the counts, review the caps, and read any notice of changes to Google's terms (Google emails the billing contact).
12. **Every live home has a pin:** a query in the runbook lists live listings that aren't `on_map`. It should return none.

## Performance

| Budget | Target |
| --- | --- |
| Search page JavaScript before the map | 120 KB gzipped (unchanged) |
| Our map code, not counting Google's | 60 KB gzipped (unchanged) |
| When Google's script starts | After the results and their first photos; never before LCP |
| Hovering a card with 2,000 pins in view | The pin changes in the next frame, with no re-clustering |
| Panning with 2,000 pins on a mid-range Android phone | INP under 200 ms |
| LCP, INP and CLS at p75 on phones | 2.5 s, 200 ms and 0.1 (unchanged) |

**Should, if map moves load the database:** the points request widens its box to a grid that depends on the zoom, so nearby moves share answers cached at the CDN. The page still shows only the pins in view.

## Security

- **The key is public by design.** Its website and API restrictions and the daily cap protect it.
- **The frame,** if it's built, accepts messages only from the page that embeds it, parses each one with Zod, and can be embedded only by Gaff. It never handles personal data.
- **`strict-origin`** goes only on map pages, and only if spike B needs it. Private links keep `no-referrer`.
- **Google's script** runs on the search pages and the picker only, never on renters' or landlords' private pages.

## Delivery plan

Built in this order, with requirement IDs in commits and tests. S, M and L are as in the marketplace technical specification.

| # | Step | Requirements | Size |
| --- | --- | --- | --- |
| 1 | Spikes A to G, written up under Findings | M119, M134, ADR-0027 | S |
| 2 | The provider: failure detection and the watchdog, the camera and gestures, the clusterer and raised pins, same-point pins, pin size and focus, the controls and limits | M117, M120, M127 | M |
| 3 | The look: the Map IDs and their styles from the tokens, the theme, the fade-in, pins that follow the map | M129, M130, M131 | S |
| 4 | Drawing by tapping corners, and the camera control | M128 | S |
| 5 | Real points: `point_source`, `on_map`, the picker and its check, the seed's points and the task for homes without a pin | M38, M125, M126 | M |
| 6 | Headers per page; the frame, if decision 8 applies | M119 | S (M with the frame) |
| 7 | Spending and counts: robots, caps, the budget, `map_daily_counts`, the staff page, the daily check | M132, M133, M135 | S |
| 8 | The real-map run, the manual check list and the runbook; the OpenStreetMap credit | M136, M137 | M |
| 9 | Release: the test copy on Google, the founders' walkthrough, the records (privacy notice, terms, DPIA), then production | All | S |

## Risks

| Risk | Answer |
| --- | --- |
| Google's script needs consent under ePrivacy | Spike A, then S2. M134 is designed and small |
| The page's address takes the search to Google | Spike A, then the frame (decision 8) |
| `no-referrer` breaks the key | Spike B, then `strict-origin` on map pages only |
| The cap is reached at a busy time | M120's sentence and the list. Alerts come before the cap, and the cap is reset from real traffic after two weeks |
| Costs grow | Caps, the budget, no map for robots or previews, and reuse. MapLibre is still possible behind `MAP_PROVIDER` (ADR-0027) |
| Google changes its script or terms | The quarterly channel; the nightly run on the weekly channel; Google's notices to the billing contact; the monthly check |
| Letters place pins badly | The street start, the area check (M126), and approximate points when the address is hidden |
| Many homes at one point | Same-point pins and their list |
| A view holds more than 2,000 homes | The counts show when a view reaches the limit; clustering on the server comes then, not now |
| The dark style isn't ready | A light map with light pins in both themes (S7) |

## Costs

| Item | Expected |
| --- | --- |
| Map loads in production | Within the S1 budget, held by the daily cap: about $245 a month at 1,500 a day |
| Map loads on the test copy | Small. They share the billing account's free 10,000 a month with production |
| The nightly real-map run | About 30 map loads a night |
| Letters placing pins | One map load per listing edited |

## Vendors

| Need | Choice | Status |
| --- | --- | --- |
| Map | Google Maps Platform: the Maps JavaScript API only | Approved by Sean on 8 November 2026 (Q58). An independent controller, under the Controller-Controller Data Protection Terms, with no EU region; transfers under the EU–US Data Privacy Framework. Named in the privacy notice before release |
| Libraries | `@vis.gl/react-google-maps` (MIT) and `@googlemaps/markerclusterer` (Apache-2.0) | Already in use, loaded only with the map |

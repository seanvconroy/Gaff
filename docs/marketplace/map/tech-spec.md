# The live map: technical specification

Draft, 8 November 2026 · built 13 and 14 November 2026, and amended here with what the build found ([As built](#as-built-14-november-2026), [Findings](#findings)) · CTO · goes with the [PRD](prd.md) (M125 to M137; amends M38, M117, M119 and M120) · builds on the [search redesign technical specification](../search-redesign/tech-spec.md) and [ADR-0027](../../adr/0027-places-index-on-google-maps.md)

## Summary

The map is built. This work makes it real and ready for renters. It stays inside the monolith, with no new vendor and no new service:

- **spikes,** for the answers only Google's real script can give. No key was to hand, so the build read Google's script and ran it without one; what still needs a real key is listed under [Findings](#findings);
- **a hardened provider:** every failure caught; a camera that moves only when it should; one clusterer per map; same-point pins; bigger, keyboard-friendly pins; the theme; a loading state; and drawing without dragging;
- **real points:** the letter's map pin (M38), points that record where they came from, and realistic points for the test copy;
- **headers per page:** Google's content security policy only on pages that show a Google map, and those pages entered and left with a full page load, so Google's script runs nowhere else;
- **spending and counts:** daily caps and budget alerts, no map for robots or previews, and first-party counts;
- **a real-map test run,** every night and before each release, beside the stand-in runs on every change;
- **a runbook** for setting up, watching, turning off and rotating.

Everything in the search redesign's technical specification still holds unless this document says otherwise.

## As built (14 November 2026)

Steps 1 to 8 of the [delivery plan](#delivery-plan) are built. Where this section and the rest of the document differ, this section is right; the tables and sections below have been amended to match, and say where.

**What changed from the plan, and why**

- **No frame, and no change to the referrer policy** (decisions 7 and 8). Google's script is told to send the site's origin alone. Every page keeps `no-referrer`.
- **Full page loads into and out of the map's pages** (decision 12). This was the build's main finding, and it came from the real-map run, not from reading: reached by an in-app link, the search and the listing editor showed "The map isn't available right now", because the document they arrived in carried another page's policy.
- **Nothing thrown inside the map takes the page with it** (decision 1). Also from the real-map run: a refused key, landing while pins waited to go on a map that was still starting, replaced the whole page with "This page couldn't load". An error boundary now wraps the map on the search and in the listing editor, and a fifth failure count, `error`, says when it was needed.
- **Failure is also read from the map's own element** (decision 1), because Google's development-mode map draws tiles and calls no hook.
- **The pin's check uses the area's centre and reach** (M126). The place index holds no boundaries and there is no `listing_places` table, so a pin counts as inside its address's area within the area's radius plus 250 metres. The words for where a pin is come from the place it sits deepest inside.
- **The picker has move buttons** as well as the arrow keys, so a pin can be moved a step at a time by touch. A development's homes share its pin until they have their own.
- **Views are held to Ireland** (`clampToIreland`, and the map's own `restriction`) in place of a minimum zoom.
- **The test copy's addresses stay made up.** Each made-up home's point is on a real street's centre line in its area, and two in three show their address in full.
- **Google is told nothing it doesn't need:** no extra libraries, and none of the map library's own usage tags.
- **The real-map run is its own build and run** (decision 11), with tests that need no key and tests that need one.

**What isn't done**

- Nothing has run with a real key. The tests that need one (`tests/google/map.spec.ts`) were checked against Google's real script in its keyless development mode. Two things rest on Google's documentation alone: that a key restricted to a website accepts the origin-only setting, and what a project over its cap looks like ([deploy.md](../../deploy.md) has the first-time check).
- Spikes C, D and G, and the parts of A that need other browsers ([Findings](#findings)).
- The manual check list below, the records (privacy notice, terms, DPIA) and the release itself: step 9.

## Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | Detecting failure | Five signals: the script's load error (`APIProvider`'s `onError`); Google's `gm_authFailure` hook; a watch on the map's own element for Google's error views; two watchdogs (no script in 20 seconds, no first `tilesloaded` in 10); and an error boundary round the map. _Amended in the build_ | Google calls `gm_authFailure` for a refused key only. In development mode (no billing, and by Google's documentation the daily cap) it draws tiles under its own dialog and calls nothing, and the tiles defeat the watchdog: so the element is watched. When Google refuses a key it takes its map apart and its markers throw as they're removed: so the boundary |
| 2 | Google's script version | The quarterly channel in production and on the test copy. The nightly test run also tries the weekly channel | Fewer surprises in production, and a warning of the next quarter's changes |
| 3 | The dark map | `colorScheme`, set when the map is created, with a second Map ID for the dark style (`GOOGLE_MAPS_MAP_ID_DARK`). Without one, the map and its pins stay light in both themes. The map follows the page's theme (`data-theme`, then the device): Gaff has no theme chooser of its own yet. _Amended in the build: spike D needs the console, so one Map ID with both styles is still untried_ | Google applies `colorScheme` only when a map is created |
| 4 | Clustering | One `MarkerClusterer` per map, created in an effect and removed in its cleanup. Homes at one point are grouped in domain code first. Hovering changes a pin's look, never the clusters | Today's clusterer outlives its map, and every hover re-clusters every pin |
| 5 | The camera | It fits only when the search area's key changes. A move counts as the renter's only when one of their gestures started it | Filter changes and resizes mustn't move the map or search its area |
| 6 | Drawing | Screen points converted with an `OverlayView`'s projection; tilt and rotation off; a mode for tapping corners | Correct on any map; WCAG 2.5.7 |
| 7 | Headers | Pages that show a Google map get Google's content security policy. Every page, these included, keeps `Referrer-Policy: no-referrer`. _Amended in the build: `strict-origin` isn't needed_ | The script tells Google the site's origin itself (`auth_referrer_policy=origin`), so nothing rests on the Referer header |
| 8 | The page's address | No frame. `auth_referrer_policy=origin` makes Google's script send the site's origin where it would send the page's address. _Amended in the build_ | Read in Google's script and seen in its requests: by default it sends the origin and path (which names the place searched, though not the filters); with the setting, the origin alone |
| 9 | Points | `homes.point_source` records where each point came from. Only the letter's points (and the test copy's seeded points) go on the map | M125 |
| 10 | Counts | A small `map_daily_counts` table, written through the existing beacon route | M133, with no cookies and no visitor hash |
| 11 | Testing the real map | A run of its own (`pnpm build:map && pnpm test:map`: `playwright.google.config.ts`, `tests/google`), nightly on the quarterly and weekly channels, on demand, and when the map's code changes. Its key is restricted to `http://localhost:3100`, with a daily cap of 100. Tests that need no key always run. _Amended in the build: a separate build, because the headers are set when the app is built_ | Real behaviour, without a Google key in every pull request |
| 12 | Where Google's script runs | Only in a document loaded for a page that shows the map (`src/lib/map-pages.ts`). Going between a map page and any other page is a full page load, in both directions (`src/ui/map/MapBoundary.tsx`). _Added in the build_ | A content security policy comes with its document, and in-app links swap pages without one. Reached by a link, the search or the listing editor had Google's script refused; left by a link, they took Google's script and the looser policy on to pages where people enter personal details |
| 13 | The map's height | 48px shorter on larger screens, so the whole map is on the first screen. _Added in the build_ | Its bottom 30px, with Google's logo and terms, sat below the first screen until the page was scrolled |

## Week one: spikes

Planned on a development key, in a production build, so the content security policy applies. No key was to hand during the build, so the spikes were done as far as they can be without one: by reading Google's script, and by running it through the app's production build with no key, with a key Google refuses, and with Google's hosts blocked. [Findings](#findings) says what each settled and what is still open.

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

Seen on 13 and 14 November 2026, in Google's script on the quarterly channel (version 3.65.14a), run in Chromium through the app's production build with its content security policy. Three ways: with no key, which gives Google's development-mode map (darkened tiles under its own dialog); with a key Google refuses; and with Google's hosts blocked. The tests in `tests/google` repeat most of these every night.

| Spike | What was found | Settles | Still open |
| --- | --- | --- | --- |
| A | Requests go to `maps.googleapis.com` and `maps.gstatic.com`; Google's font stylesheets are refused by Gaff's policy, and the map's buttons still draw. By default the script sends Google the page's origin and path, without the query string; with `auth_referrer_policy=origin`, the origin alone. No request carries the page's address or anything searched. Google's own data calls carry the browser's `Origin` header, and one image (Google's cursor) carries a `Referer` with the origin alone, the browser's default for a style set by script. The script sets and reads no cookie of Gaff's site, and writes nothing lasting to the device: it tests `sessionStorage` with a key it removes at once, and otherwise only reads keys of its own | Decision 8: no frame. The PRD's finding 5 is corrected: it was the place in the path that reached Google, not the filters | A browser signed in to Google, Safari on iOS and Chrome on Android, for S2 and the DPIA |
| B | Not needed: nothing rests on the Referer header (spike A) | Decision 7 | That a key restricted to a website accepts the origin-only setting: the first-time check in [deploy.md](../../deploy.md) |
| C | Not tried. The policy is the one in Google's guide | | Whether the map works without `'unsafe-eval'` |
| D | Not tried: it needs a Map ID in Google's console | | Decision 3 stays at two Map IDs until it is |
| E | Blocked hosts: the script's load error, at once. A refused key: `gm_authFailure`, a fraction of a second after the map's first call for its viewport, and Google takes its map apart. No key: tiles, Google's dialog, and no hook at all. Each ends in Gaff's sentence within a second or two | Decision 1 | A project over its cap, and one with billing off: by Google's documentation they look like the keyless map |
| F | Not needed: there is no frame | Decision 8 | |
| G | Not measured. The cluster radius (150, in the clusterer's 512px-tile units) comes from the pin's width, checked by eye on Google's real tiles | | 2,000 pins on a mid-range phone, before release |

Two things nobody had asked a spike about, both found by running the real map through the app:

- **A content security policy belongs to a document, not a page** (decision 12).
- **Google's markers throw when removed from a map Google has taken apart** (decision 1). It needs the refusal to land while markers wait for the map's configuration, a tenth of a second wide. The test holds that configuration back, and then it happens every time.

## Code layout

| Path | What changes |
| --- | --- |
| `src/app/(public)/to-rent/map/GoogleMap.tsx` | The camera, the pins (one clusterer per map, raised pins, same-point pins), the area's outline and the draw layer, as components in one file |
| `src/ui/map/` | New, shared by the search map and the picker: `GoogleLoader.tsx` (the one place Google's script is loaded, and every failure signal), `MapErrorBoundary.tsx`, `MapBoundary.tsx` (decision 12), `PinPicker.tsx` and `GooglePinMap.tsx` (the letter's pin), `count.ts` and `useScheme.ts` |
| `src/lib/map-pages.ts`, `src/lib/map.ts` | New: the list of the map's pages, used by the header rules and by the pages' scripts; and which map this deployment shows |
| `src/app/(public)/to-rent/map/SearchMap.tsx` | Load timing, the theme, counts, failure kinds, and the same-point list in the mini card |
| `src/app/(public)/to-rent/map/StaticMap.tsx` | Same-point pins, drawing by tapping corners, and the same gesture rules, so the stand-in keeps behaving like the real map in tests |
| `src/app/(public)/to-rent/map/map.module.css` | The pin's hit area and `border-strong` edge, the focus ring, raised pins, the fade-in, and pins that follow the map's scheme |
| `src/domain/map/` | New, pure and unit-tested: `points.ts` (grouping by point), `camera.ts` (the area key, when to fit, and views held to Ireland), `gestures.ts` (whose move it was), `theme.ts`, `draw.ts` (taps, corners and shapes), `pin.ts` (nudging, the area check, the place a point is in) and `counts.ts` (the codes that may be counted) |
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
| `playwright.google.config.ts`, `tests/google/`, `.github/workflows/map.yml` | The real-map run: `failures.spec.ts` and `boundary.spec.ts` need no key; `map.spec.ts` needs the test run's key |
| `tests/compliance/no-trackers.test.ts` | One referrer rule for every page; Google's hosts only on the map's pages; one place loads Google's script; the map is used only on the map's pages; no other Google service |
| `docs/deploy.md` | The runbook |

## The provider, hardened

### Loading and failure (M119, M120, M131)

- **When it loads:** `SearchMap` mounts the provider once the column is on screen (`IntersectionObserver`), the page's `load` event has fired (the first photos load eagerly, so they're in by then), and the browser is idle (`requestIdleCallback`, with a 2-second timeout). Google's script then never competes with the photos that decide LCP. On phones, the tap on Map already does this.
- **Robots:** `SearchPage` passes no map settings when `isLikelyBot()` (`src/domain/measurement/views.ts`) matches the request's user agent.
- **Failures,** each reported once, with its kind (`src/ui/map/GoogleLoader.tsx`; _amended in the build_):
  - `script`: `APIProvider`'s `onError` (a blocker, the network, the content security policy);
  - `auth`: `window.gm_authFailure`, set before the script loads and put back on unmount (the key, the allowed websites, billing, an expired key);
  - `google`: Google drew its own error where the map should be. Its error box (`.gm-err-container`) or its development-mode dialog (`.dismissButton`) appeared inside the map's element, which a `MutationObserver` watches. Google calls no hook for these, and draws tiles under the dialog, so the watchdog alone would call the map ready;
  - `timeout`: no script within 20 seconds, or no first `tilesloaded` within 10 seconds of creating the map;
  - `error`: something inside the map threw. `MapErrorBoundary` wraps the place the map is swapped for its failure words, so it catches what's thrown while the map is drawn and while it's taken away.
- **On a failure,** the provider unmounts, so Google's error box is never seen, and M120's sentence takes its place. The phone's map view keeps the List button. Unmounting is itself guarded: Google's markers throw when removed from a map Google has taken apart.
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
  2. find `places` rows of kind `street` with that name in the home's county, whose line passes within the area's reach plus 500 metres (`src/domain/places/street.ts`);
  3. start at the nearest one's line, at zoom 18. Otherwise start at the area's centre, at zoom 15.
- **Moving the pin:** a draggable Advanced Marker (`gmpDraggable`). A tap on the map moves the pin there. With the pin focused, the arrow keys move it by about 10 m, or 50 m with Shift; four buttons under the map do the same by touch. When it stops, a polite live region names where it is ("The pin is on Highfield Road, Rathgar, Dublin 6"), from the place index: the nearest street within 50 m, and the smallest area that contains the point.
- **`setHomePoint(member, lettingId, point)`** in `src/server/listings/location.ts`:
  - validates the point with Zod: finite, and inside Ireland (`inIreland`);
  - inside `withOrg()`, writes the point, `point_source = 'letter'` and `point_set_at`, with the event `home.point_set` in the same transaction;
  - the event's payload is `{ homeId, check, homes }` (the check's answer, and how many homes took the pin), never the coordinates: a private landlord's home is personal data (rule 8, ADR-0006);
  - if the listing is live, projects it again, which rewrites its public point. A development's homes without a pin of their own take the pin too, and each of their live listings is projected again.
- **The check (M126):** the point is tested against the centre and reach of the area in the address: inside its radius, plus 250 metres, since an area's edge isn't a line on the ground (`pinInArea`, `src/domain/map/pin.ts`). The place index holds no boundaries. Outside it, the picker asks the letter to confirm, and the letter can keep it. _Amended in the build._
- **Publishing** needs `point_source` to be `letter` (or `seed` on the test copy). The publish checklist links to the section: "Place the pin".
- **Homes already live without a pin** get a task among "what needs a person today" (R28): "Place the pin for 14 Rathmines Road".
- **The workspace page with the picker** gets the map headers (below), and nothing else in the workspace loads Google.

### The test copy's homes

- `src/server/dev/seed.ts` gives each made-up home a point on a real street in its area. The points are taken once from the place index and written into the seed, so the seed doesn't need the index, with `point_source = 'seed'`.
- A third of the made-up homes hide the exact address, so approximate points are tested too.
- The addresses are made up, street names included, and no point is a real person's home: each sits on a real street's centre line in the home's area. _Amended in the build._

## Headers on map pages (decisions 7 and 12)

_Amended in the build._

- **One list of map pages** (`src/lib/map-pages.ts`): `/to-rent/:path*` and `/lettings/:lettingId/listing` (the picker). `next.config.ts` builds its header rules from it, and the pages' own scripts use the same list.
- **On those pages,** when the build has `MAP_PROVIDER=google` and isn't a preview copy: Google's content security policy, as in Google's guide. Every other page keeps the policy without Google.
- **Every page** keeps `Referrer-Policy: no-referrer`, the map's pages included.
- **A policy comes with its document,** and Next.js swaps pages in place. So, in the same builds, going between a map page and any other page is a full page load (`src/ui/map/MapBoundary.tsx`, in the root layout):
  - a link across the boundary is followed as a full page load from the start;
  - a page swapped in across it any other way (a redirect, a button) loads again at once, and Google's script isn't asked for until it has;
  - within either side, pages swap in place as before.
- **The cost** is that opening a home from the search, and going back, are full page loads. The other way to keep Google's script to the map alone is the frame decision 8 set aside: it would keep in-place navigation, at the price of running the map's code on both sides of a frame. It stays an option if the page loads prove slow ([next steps](../../next-steps.md)).
- **`tests/compliance/no-trackers.test.ts`** checks the rules; `tests/google/boundary.spec.ts` checks the behaviour in a browser.

## Privacy: what Google receives

_Amended in the build: spike A's [findings](#findings) replace what was expected here._

- **What Google receives:** the device's IP address and browser details with every request to Google; the map's area and zoom in the tile requests; the key; and the site's origin. Never the page's address, so never the place a renter searched, their filters (one of which, `access`, lists the accessibility features a renter needs) or a listing's address.
- **When:** only once the map is wanted (on a phone, when the renter opens it), and only in a document loaded for a page that shows the map. Google's script goes when the page does: it is never loaded where a renter enquires or a letter reads an application.
- **What goes on the map:** Gaff's own content only. No Google service other than the Maps JavaScript API is called, and no library beyond the map and its markers is loaded.
- **The DPIA and the privacy notice** record the findings; Google's role (an independent controller, under its Controller-Controller Data Protection Terms); the lack of an EU region; and the transfer basis (the EU–US Data Privacy Framework). Still to look at for them: a browser signed in to Google, and Safari and Android, where Google's own cookies may travel with requests to Google's hosts.
- **ePrivacy (S2):** the solicitor decides, from the findings, whether the map on larger screens waits for a tap (M134). Nothing found so far points to it: the script stores nothing lasting on the device. M134 isn't built.

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

- **`map_daily_counts`** `(day, event, kind, count)`, in the staff zone. `kind` is a short code: `phone` or `larger` for opens, and `script`, `auth`, `google`, `timeout` or `error` for failures. No user, visitor hash, IP address, area or search is kept. Rows are deleted after 13 months by the nightly retention job.
- **The page** sends `navigator.sendBeacon('/api/v?m=opened&k=larger')`. `/api/v` checks `m` and `k` against fixed lists (Zod), adds one, and ignores robots.
- **Events:** `opened`, `shown` (the first tiles drawn), `failed`, `area_searched`, `shape_drawn`, `pin_opened` and `group_opened`.
- **Staff** see a month of counts on a staff page, beside the month's billed map loads, which they copy from Google's console.
- **A daily check** (a job) emails Gaff's admins when failures pass 5% of opens on a day with 50 opens or more.

## Testing

Test names start with the requirement ID (`M127: …`).

- **Unit tests (domain):**
  - `groupByPoint`;
  - `cameraKey` and `shouldFit`: a filter change never fits, and a renter's map area never refits;
  - gestures: resizes, a phone's toolbar and the page's own fits never count as the renter's;
  - `resolveTheme`;
  - the street the picker starts on, including streets of one name in different towns;
  - views held to Ireland, and the pages on each side of the map's boundary (`src/lib/map-pages.test.ts`).
- **Integration tests:**
  - `setHomePoint`: row-level security, the event with no coordinates, projecting again, a development's shared pin;
  - points leave out `area` homes, and approximate hidden addresses;
  - `map_daily_counts` takes only the listed codes, and ignores robots.
- **End to end with the stand-in** (every change, with axe on every state, on a phone and a laptop):
  - a filter change keeps the map's view, and resizing the window doesn't search the map area;
  - a same-point pin lists its homes;
  - drawing by tapping corners;
  - focusing a pin lights up its card;
  - the letter places a pin by dragging, tapping and the arrow keys, and sees the area check;
  - M120's sentence is tested on Google's real script, where the failures are real (below), not with a switch on the stand-in.
- **The real map** (`pnpm build:map && pnpm test:map`: `playwright.google.config.ts` and `tests/google`, run by `.github/workflows/map.yml` every night on the quarterly and weekly channels, on demand, and when the map's code changes; _amended in the build_). A production build with `MAP_PROVIDER=google`, the journeys' test database, and the test copy's made-up homes for pins.
  - **With no key** (`failures.spec.ts`, `boundary.spec.ts`), on Google's real script:
    - only the map's pages carry Google's policy, and every page sends `no-referrer`;
    - on a phone, nothing leaves for another site until the renter opens the map; the first request is Google's script, with only the key, the channel, the language, the region and `auth_referrer_policy=origin`;
    - no request to Google carries the page's address or anything searched;
    - each failure ends in M120's sentence, its own count, and the list whole: Google's hosts blocked; a script that never answers; a key Google refuses; a key refused while pins wait to go on the map (the page must not go down with it); Google's development-mode map; a map that never finishes starting;
    - a letter whose browser can't reach Google is told the pin can't be placed, and what to do;
    - the search and the listing editor are entered, and left, with new documents: Google's script is never refused, and never left behind.
  - **With the test run's key** (`map.spec.ts`, skipped without it), on a computer, on a phone and in the listing editor: the map draws after the page; pins and clusters are buttons with their names; a pin opens its card; a cluster zooms in; the map stays where the renter leaves it; a filter and a resized window leave it alone; an area is drawn by tapping corners; a pin is placed by tapping, the buttons, the arrow keys and dragging; Google's logo and terms are in sight and uncovered; no content security policy violation other than Google's fonts; nothing of the search reaches Google; axe passes.
  - The key is a GitHub Actions secret, restricted to `http://localhost:3100` and the Maps JavaScript API, with a cap of 100 map loads a day. Screenshots of each state are kept for a person to look over. They aren't compared pixel by pixel, because Google's map changes.
  - **Not yet run with a real key:** `map.spec.ts` was checked against Google's script in its keyless development mode, with a stand-in for the key that isn't in the repository.
- **The manual check list,** before each release that changes the map:

| Area | Check |
| --- | --- |
| Browsers | Safari on iOS (the latest and the one before), Chrome on a mid-range Android phone, and Chrome, Edge, Firefox and Safari on a laptop |
| Screens | 320px, 375px, 744px, 1128px, 1440px and 1920px wide; a tablet in portrait and landscape |
| Settings | Light and dark, from the device; reduced motion; text zoomed to 200% |
| Assistive technology | VoiceOver on iOS, NVDA on Windows, and the keyboard alone |
| Networks | Slow 4G, going offline after the page loads, and an ad blocker that blocks Google (uBlock Origin) |
| Data | All of Ireland with every test home; a place where homes share a point; a development; a home with its address hidden; a search with no homes |
| Cost | After a day of testing, Google's console and `map_daily_counts` agree to within 10% |

## The runbook

[deploy.md](../../deploy.md)'s step 6 is the runbook, as built: the three projects and their keys (each lists its site with no path as well as with `/*`, because Google is told the origin alone); the Map IDs and their styles, from `docs/design-tokens.json`; caps and budget; the Vercel and GitHub settings; what to check; how the map behaves; what each failure count means and what to do; turning the map off (M135); rotating a key; a key used elsewhere; the monthly check; the query for live homes without a pin; and how to run the real-map tests. It also names the two things to check the first time real keys are used.

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
- **Every page keeps `no-referrer`,** private links and map pages alike.
- **Google's script** runs on the search pages and the picker only, never on renters' or landlords' private pages, and never in a document that was loaded for another page (decision 12).
- **The map can't take the page down:** anything thrown inside it ends in M120's sentence (decision 1).

## Delivery plan

Built in this order, with requirement IDs in commits and tests. Steps 1 to 8 were built on 13 and 14 November 2026. S, M and L are as in the marketplace technical specification.

| # | Step | Requirements | Size |
| --- | --- | --- | --- |
| 1 | Spikes A to G, written up under Findings. _Done as far as they go without a key_ | M119, M134, ADR-0027 | S |
| 2 | The provider: failure detection and the watchdog, the camera and gestures, the clusterer and raised pins, same-point pins, pin size and focus, the controls and limits | M117, M120, M127 | M |
| 3 | The look: the Map IDs and their styles from the tokens, the theme, the fade-in, pins that follow the map | M129, M130, M131 | S |
| 4 | Drawing by tapping corners, and the camera control | M128 | S |
| 5 | Real points: `point_source`, `on_map`, the picker and its check, the seed's points and the task for homes without a pin | M38, M125, M126 | M |
| 6 | Headers per page, and full page loads across the map's boundary. _No frame_ | M119 | S |
| 7 | Spending and counts: robots, caps, the budget, `map_daily_counts`, the staff page, the daily check | M132, M133, M135 | S |
| 8 | The real-map run, the manual check list and the runbook; the OpenStreetMap credit | M136, M137 | M |
| 9 | Release: the keys and the first run with one, the test copy on Google, the founders' walkthrough, the manual check list, the records (privacy notice, terms, DPIA), then production. _Not started: it needs the founders_ | All | S |

## Risks

| Risk | Answer |
| --- | --- |
| Google's script needs consent under ePrivacy | Spike A found nothing lasting stored on the device; S2 is the solicitor's. M134 is designed and small |
| The page's address takes the search to Google | Settled: Google is told the origin alone, and a nightly test checks every request |
| A key restricted to a website refuses the origin-only setting | Google documents that it works when the key lists the site with no path. Checked the first time a real key is used; `strict-origin` on map pages is the fallback |
| Full page loads into and out of the search feel slow | Measured at release. The frame (decision 8) is the way back to in-place navigation |
| Google changes the inside of its script | Three tests lean on it (the call that carries the key's answer, the map-configuration call, and the classes of Google's error views). The weekly-channel run fails first, a quarter ahead |
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

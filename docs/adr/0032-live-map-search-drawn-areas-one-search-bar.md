# ADR-0032: The list follows the map, areas are drawn on it, and one search bar reads a place, a road or a sentence

- Status: Accepted (Sean, 20 November 2026; Q60). Supersedes ADR-0021's "drawing an area doesn't come across" and its "Search this area" button.
- Date: 2026-11-20

## Context

Sean tried search on the test copy and found four things short of what renters expect from a property site (Q60):

- typing a road ("Highfield Road") in the search box found nothing, though the place index holds 45,000 streets: the box read a sentence against the index's 3,000 areas only, and streets were reachable only through "Where" in Filters;
- the screen spent space on lines that weren't the search or its results;
- the list didn't follow the map: a button, "Search this area", had to be pressed after every move;
- there was no drawing an area (left out on purpose when the map was brought across, ADR-0021), and saving a search was a button under the results.

## Decision

- **One search bar** (`src/ui/SearchBar`, UX-SR-14). The same box takes a place, a road, an Eircode area or a sentence. As it's typed:
  - the part that could be a place is found by plain code (`placeFragments` in `src/domain/search/named.ts`: the words a search reads for its other fields, and the small words round them, are left out), and only that part is sent to Gaff's own place index for suggestions. Those requests are never counted as misses (`bar=1`), because a word in a sentence that isn't a place may be about the renter;
  - whatever else the words ask for is read in the browser by the same plain code the server uses (`parseSearch`), and shown as the first row ("Search for: 2 bedrooms");
  - picking a suggestion searches there with the rest of what was typed; Enter sends the words.
  On the server (`searchFromWords`), a place picked is the place; words that are only a place's name take the place search's own first suggestion (a near spelling is offered, never assumed); and a road, landmark or townland named inside a sentence is found by asking the index for each fragment and keeping a place only when the fragment is its whole name with nothing left over but where it is (`namedBy`). With an area also said ("on Main Street in Bray"), only a road found together with that area counts. There is still no model in search (UX-AI-12): it works the same with the reader switched off.
- **The list follows the map** (Q60, M127). When the renter moves the map (`movedByRenter` says whose move it was), the search becomes the homes in view, 450 ms after the map comes to rest. The first step away from a place is a new history entry, so Back returns to the place; later moves replace it. Moving the map or reshaping an area swaps the homes in place, with no loading state. "Search this area" is gone.
- **Drawn areas** (UX-SR-13). A search may hold up to five areas (`shapes`, `src/domain/search/shapes.ts`): polygons of 3 to 60 corners, in a search's address as encoded polylines joined by full stops (`draw=`). A home is in the search when the point renters see for it is inside any of them; a search has a place, a map area or drawn areas, and only one. The rule is `pointInPolygon`, and its SQL twin (`shapesCondition`) is the same arithmetic in the same order, held to it by the generated test with ADR-0030's others.
- **One drawing layer for every map** (`src/ui/MapDraw`). Each provider hands the page a `MapProjection` (places to pixels and back) whenever its view changes: Google through an `OverlayView`, the stand-in from its own camera. The layer draws in SVG over the map and is the same code on both, so the stand-in's end-to-end tests exercise the code Google's map runs. Drawing is a traced loop, or a tap for each corner, or (keyboard) Enter for a square; reshaping is dragging a corner, pulling a new one from the middle of a side, or the arrow keys and Delete. Every change is the search at once: there is no Apply. While there are drawn areas, moving the map looks around and doesn't change the search.
- **Saving** (UX-SR-10). "Save search" is a chip beside Filters on every search; a drawn area or a map area is saved with it, like any filter, and named by the area nearest its middle ("Drawn area near Rathgar").
- **The nearest homes** (UX-SR-15). When no home is where the renter searched, the nearest homes that fit the rest of what they asked are listed, nearest first, each saying how far (`src/domain/search/nearest.ts`), within 30 km.
- **Nothing else on the screen.** The promise line, the line for people letting and the two links under the results are gone. "How results are ordered" is an icon beside the results' heading; the place data's credit is at the foot of the suggestions and on the map where a street is drawn; both pages are linked from Help.

## Consequences

- A search's address can now be long (five areas of sixty corners is about 2,500 characters). `readShapes` refuses anything over 4,000.
- A drawn area is a filter like any other: it reads only where a home is. Nothing about the renter is in it, and it is saved only when they save the search (rule 3, UX-MT-12).
- Map events `area_drawn`, `area_reshaped` and `area_removed` are counted as fixed codes, like the others (M133).
- Nothing here has run on Google's map with a real key (Q58). `tests/google/map.spec.ts` now draws an area and checks that a corner sits where it was tapped; it needs `GOOGLE_MAPS_TEST_KEY`.
- The search bar sends parts of what is typed to Gaff's own server as it is typed (Q56 already notes this for "Where"). The parts are chosen so that what a renter says about themselves is left out, and a test holds that for the words a sentence about a home uses; a word outside that list ("nurse") can still be looked up. It is never stored or counted.

## Alternatives considered

- **Each provider's own drawing tools** (Google's editable polygons). Two implementations to keep alike, and the one renters use would be the one the tests can't reach without a key.
- **A model to read the sentence** (as Rightmove's separate "AI search"). A second mode to choose between, a call per search to pay for, and renters' own words sent to a model. The plain reader already turns a sentence into the same chips, and now finds roads; one box that takes both is simpler than two.
- **PostGIS for the polygons.** One more extension to depend on for a rule that is ten lines of arithmetic, and a second definition of "inside" to hold to the domain's.
- **Keeping "Search this area".** An extra press after every move, on the one screen where renters expect none.

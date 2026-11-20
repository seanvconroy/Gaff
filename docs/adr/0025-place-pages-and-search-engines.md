# ADR-0025: Pages for places, and what search engines are told

- Status: Accepted
- Date: 2026-11-20

## Context

The redesign had one search page (`/`) and a public page per home, and told search engines nothing but `noindex` unless `SEARCH_INDEXING=on`. The live line gave every place its own page, a sitemap, structured data on a home's page, a "how results are ordered" page and similar homes (M59, M62, M73, M74, M111). BA-12 brings these across on the redesign's search and its place index (ADR-0018).

## Decision

- **One address for each place (M62).** Every area in the place index that a search can be "in" (county, city, town, village, Dublin district, area) has a page: `/to-rent/<county>` for a county, `/to-rent/<county>/<place-slug>` otherwise. The rule is `resolvePlacePath` in `src/domain/search/place-pages.ts`. Other spellings, the wrong county, routing keys such as `d06`, legacy slugs and the live line's `/to-rent/near/…` are sent there with a permanent redirect. Streets, landmarks, townlands and Eircode areas that aren't Dublin districts have no page; they go to their search at `/?where=…`. An address naming no place is a 404.
- **A place's page is search, answered.** It is the same view as the first screen (`SearchView`): the box (named by "Homes to rent in …"), chips, filters, the homes, the map and "Tell me about new ones", with one line counting the homes free there, then the places around it and its county. A place with no homes keeps its page and offers the nearest places that have some.
- **Filtered searches live at `/` (M58).** A place's page with filters in its address redirects to that search at `/`. The search for a place alone has the place's page as its canonical address (`canonicalSearchPath`). `/` is never indexed.
- **Indexing only where `SEARCH_INDEXING=on`.** There, `X-Robots-Tag` allows `/homes/:ref` and `/to-rent/:path*`, `robots.txt` allows `/homes/` and `/to-rent/` and names `/sitemap.xml`, and the sitemap lists live homes (by random reference, Q51) and places with at least one home. A place's page with no homes, and a let home's page, still say `noindex` in the page. Everywhere else every page says `noindex`, `robots.txt` disallows all and the sitemap is empty.
- **Structured data (M111)** on a live home's page is built from what the page shows. A landlord's home (private or a team) gives its street without the door number, and no home gives a point, Eircode, lister or person.
- **Similar homes (M73, M74)**: up to three live homes from the same public query search reads, same county and kind of home, a bedroom either way, within a quarter of the rent, nearest first (by public point, or the address's area centre). Shown on a live home's page and on a let home's page, beside "See other homes in …", which now opens the place's page.
- **Places' pages are map pages** (ADR-0022): `/to-rent/:path*` joins `mapPageSources`, so Google's script runs there in a build whose map is Google's, and moving between a place's page and a home's page is a full page load.

## Consequences

- Places are counted from fresh reads of the public query on each page and for the sitemap. That suits the pilots; a count in the database replaces it when homes number in the thousands.
- "How results are ordered" (`/how-results-are-ordered`, M59) is linked under the results but is not indexed.

## Alternatives considered

- **Making `/?where=…` redirect to the place's page.** It would change the search's own address (UX-SR-12) and every saved and shared search. A canonical link does the job for search engines.
- **Pages for streets and landmarks.** Thin pages for search engines; a near search's address stays at `/`.

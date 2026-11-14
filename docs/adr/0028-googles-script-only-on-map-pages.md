# ADR-0028: Google's script runs only in documents loaded for the map's pages

- Status: Accepted in the build of [the live map](../marketplace/map/tech-spec.md) (decision 12). One part is the founders' to confirm: the cost in navigation (live map PRD, S11). Builds on ADR-0027.
- Date: 2026-11-14

## Context

ADR-0027 put Google's map on the search pages, and the live map adds it to the listing editor, where a letter places a home's pin. Google's script needs a looser content security policy than the rest of Gaff: `'unsafe-eval'`, `blob:`, and Google's hosts for scripts, images and connections. The search redesign gave that policy to the search pages only, by path, in `next.config.ts`.

A content security policy comes with a document. Next.js swaps pages inside one document when an in-app link is followed. Running Google's real script through the app (14 November 2026) showed what that means:

- **In:** a renter who reached the search from a home's page, or a letter who opened the listing editor from its tab, was still in a document with the strict policy. Google's script was refused, and they saw "The map isn't available right now" until they reloaded.
- **Out:** a renter who went from the search to a home's page and on to the enquiry form stayed in the search's document. Google's script stayed loaded, with the looser policy, on pages where people enter personal details. The same held for a letter going from the listing editor to their enquiries and applications.

Neither had been seen, because every test used the stand-in map, and the earlier checks of Google's script opened each page directly.

## Decision

**Google's script runs only in a document that was loaded for a page that shows the map, and goes when the page does.** In a build with Google's map, going between a map page and any other page is a full page load, in both directions.

- `src/lib/map-pages.ts` is the one list of the map's pages: the search pages and the listing editor. The header rules and the pages' own scripts both use it, and one build setting turns both on.
- `src/ui/map/MapBoundary.tsx`, in the root layout:
  - follows a link across the boundary as a full page load from the start;
  - loads a page again if it was swapped in across the boundary any other way (a redirect, a button);
  - and holds Google's script back until the page has its own document.
- A map on a page that isn't on the list can't load, and says so. A compliance test keeps the list and the map's uses in step.
- With the stand-in map, or none, there is no such policy and nothing changes.

## Consequences

- The map works however its page is reached.
- "Where does Google's code run?" has a short answer for the DPIA: on the search pages and the listing editor, and nowhere else, ever.
- Pages with personal data keep the strict policy, always, not only when they're opened directly.
- **The cost:** opening a home from the search, and going back to the results, are full page loads, not swaps in place. A search's state is all in its address, so nothing is lost on the way back; but it is slower than before. It's measured on a mid-range phone before release (gate 9).

## Alternatives

- **Google's policy on every page.** Simple, and navigation stays in place. But every page, private links and the workspace included, would allow `'unsafe-eval'` and Google's hosts, and Google's script would still stay loaded after the map. Rejected.
- **The map in a frame of its own** (the live map's decision 8, set aside when the referrer question was settled another way). The frame's document alone would carry Google's policy and script, and navigation would stay in place. It costs about a week: the map's code on both sides of a frame, talking by messages. It stays the way back to in-place navigation if the page loads prove too slow (S11).
- **Only reloading when Google's script is refused.** Fixes the way in, not the way out, and draws the page twice.

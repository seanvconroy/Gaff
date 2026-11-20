# ADR-0022: Google's script runs only in documents loaded for the map's pages

- Status: Accepted. Brought across from the live line's ADR-0028 (the live map's decision 12, 14 November 2026). Builds on ADR-0021. The cost in navigation is the founders' to confirm (the live map's S11).
- Date: 2026-11-19

## Context

Google's script needs a looser content security policy than the rest of Gaff: `'unsafe-eval'`, `blob:`, and Google's hosts for scripts, images and connections. A policy comes with a document, and Next.js swaps pages inside one document when an in-app link is followed. The live line found, running Google's real script, that a map page reached by a link had Google's script refused, and a page left by a link kept Google's script, and the looser policy, on pages where people enter personal details.

In the redesign the map's pages are Search (`/`, the public site's first screen) and "Where is it on the map?" (`/lettings/<id>/setup/pin`), reached by the address step's redirect and left by Next.

## Decision

- `src/lib/map-pages.ts` is the one list of the map's pages. `next.config.ts` gives them Google's policy (`src/lib/csp.ts`), only in a build with `MAP_PROVIDER=google` that isn't a preview copy; every page keeps `Referrer-Policy: no-referrer`, and Google's script is told the site's origin alone.
- `src/ui/MapBoundary.tsx`, in the root layout, makes going between a map page and any other page a full page load, in both directions: a link across the boundary is followed as one, and a page swapped in across it any other way (a redirect, a button) loads again before Google's script is asked for.
- With the stand-in map, or none, nothing changes.
- A compliance test (`tests/compliance/google-map.test.ts`) keeps the header rules, the list and the map's uses in step; `tests/google/boundary.spec.ts` checks the behaviour on Google's real script.

## Consequences

- The map works however its page is reached, and Google's code runs on Search and the pin's page and nowhere else.
- Opening a home from Search, and going back, are full page loads in a build with Google's map. A search's state is all in its address, so nothing is lost.

## Alternatives considered

- **Google's policy on every page.** Every page, private links and the workspace included, would allow `'unsafe-eval'` and Google's hosts. Rejected.
- **The map in a frame of its own.** Keeps in-place navigation at the cost of the map's code on both sides of a frame. The way back if the page loads prove slow.

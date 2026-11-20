/**
 * BA-5, M119 (the live line's ADR-0028): the pages that show Google's map when MAP_PROVIDER is
 * google: Search (the public site's first screen, `/`, and a place's page, `/to-rent/…`, M62),
 * and "Where is it on the map?", where a lister places a home's pin (M38), as a step of adding it
 * and from Home. Only their documents
 * carry the content security policy Google's script needs (next.config.ts, src/lib/csp.ts).
 *
 * A policy comes with its document, and an in-app link swaps pages without a new document. So a
 * link into Search from a home's page would have Google's script refused, and a link out would
 * carry Google's script, and the looser policy, onto pages where renters and listers enter
 * personal details. Going between a map page and any other page is therefore always a full page
 * load, in either direction (src/ui/Map/MapBoundary.tsx): Google's script runs only in a
 * document loaded for a page that shows its map, and goes when the page does.
 */

/** The map's pages, as next.config.ts's header rules name them. */
export const mapPageSources = ['/', '/to-rent/:path*', '/lettings/:lettingId/setup/pin'] as const;

/** Whether a page shows the map: the same pages as `mapPageSources`, without regard to case. */
export function isMapPage(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path === '/') return true;
  // M62 (BA-12): a place's page is search, answered for that place.
  if (path === '/to-rent' || path.startsWith('/to-rent/')) return true;
  return /^\/lettings\/[^/]+\/setup\/pin\/?$/.test(path);
}

/**
 * Whether opening `to` from a document loaded for `loadedFor` needs a new document: one of them
 * shows the map and the other doesn't.
 */
export function crossesMapBoundary(loadedFor: string, to: string): boolean {
  return isMapPage(loadedFor) !== isMapPage(to);
}

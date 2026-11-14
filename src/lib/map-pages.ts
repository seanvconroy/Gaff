/**
 * ADR-0027, M119: the pages that show Google's map when MAP_PROVIDER is google: the search
 * pages, and the listing editor, where a letter places a home's pin (M38). Only their documents
 * carry the content security policy Google's script needs (next.config.ts).
 *
 * A policy comes with its document, and an in-app link swaps pages without a new document. So a
 * link into the search from a home's page would have Google's script refused, and a link out
 * would carry Google's script, and the looser policy, onto pages where renters and letters enter
 * personal details. Going between a map page and any other page is therefore always a full page
 * load, in either direction (src/ui/map/MapBoundary.tsx): Google's script runs only in a
 * document loaded for a page that shows its map, and goes when the page does.
 */

/** The map's pages, as next.config.ts's header rules name them. */
export const mapPageSources = ['/to-rent/:path*', '/lettings/:lettingId/listing'] as const;

/** Whether a page shows the map: the same pages as `mapPageSources`. */
export function isMapPage(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return (
    path === '/to-rent' || path.startsWith('/to-rent/') || /^\/lettings\/[^/]+\/listing$/.test(path)
  );
}

/**
 * Whether opening `to` from a document loaded for `loadedFor` needs a new document: one of them
 * shows the map and the other doesn't.
 */
export function crossesMapBoundary(loadedFor: string, to: string): boolean {
  return isMapPage(loadedFor) !== isMapPage(to);
}

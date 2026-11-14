'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { crossesMapBoundary, isMapPage } from '@/lib/map-pages';

/**
 * ADR-0027, M119: Google's script runs only in a document loaded for a page that shows its map,
 * and goes when the page does (src/lib/map-pages.ts says why). In a build with Google's map,
 * going between a map page and any other page is a full page load:
 *
 * - a link across the boundary is one from the start, so nothing is drawn twice;
 * - anything else that swaps pages across it (a redirect, a button) loads the page again;
 * - and until then Google's script isn't asked for.
 *
 * With the stand-in map, or none, there's no such policy and nothing here does anything.
 */

/** Set by next.config.ts with the header rules, so the two can't disagree. */
const on = process.env.NEXT_PUBLIC_GOOGLE_MAP_PAGES === '1';

/** The page this document was loaded for. Its content security policy came with it. */
const loadedFor = typeof window === 'undefined' ? null : window.location.pathname;

/** Whether this document may load Google's script: it was loaded for a page that shows the map. */
export function documentShowsMaps(): boolean {
  return !on || (loadedFor !== null && isMapPage(loadedFor));
}

/** Whether opening this in-app address needs a new document. */
export function needsNewDocument(href: string): boolean {
  if (!on || loadedFor === null) return false;
  const to = new URL(href, window.location.href);
  return to.origin === window.location.origin && crossesMapBoundary(loadedFor, to.pathname);
}

/** Whether this page is about to be loaded again, to get the document it should have. */
export function reloading(): boolean {
  return on && loadedFor !== null && crossesMapBoundary(loadedFor, window.location.pathname);
}

/** Opens an in-app page from a script: with a new document when it's across the boundary. */
export function openPage(router: { push: (href: string) => void }, href: string): void {
  if (needsNewDocument(href)) window.location.assign(href);
  else router.push(href);
}

/** In the root layout, so it's there before any in-app link can be followed. */
export function MapBoundary() {
  const pathname = usePathname();

  useEffect(() => {
    // Only a page swapped in without a new document can be on the wrong side.
    if (window.location.pathname !== loadedFor && reloading()) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    if (!on) return;
    const followed = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;
      if (!needsNewDocument(link.href)) return;
      // Before Next.js's own handler: it leaves a click that's been dealt with alone.
      event.preventDefault();
      window.location.assign(link.href);
    };
    window.addEventListener('click', followed, true);
    return () => window.removeEventListener('click', followed, true);
  }, []);

  return null;
}

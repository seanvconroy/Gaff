/**
 * BA-1, UX-LS-11, M111 (BA-12): what robots.txt says. Search engines may read live homes' public
 * pages and the pages of places (`/to-rent/…`), and nothing else, only where the deployment says
 * so (SEARCH_INDEXING=on, production alone); there, robots.txt also points at the sitemap. Any
 * other copy of Gaff, the test copy included, disallows everything and names no sitemap.
 */
export interface RobotsRules {
  rules: { userAgent: string; allow?: string[]; disallow: string };
  sitemap?: string;
}

/** M111: the pages search engines may read, where indexing is on. */
export const INDEXABLE_PATHS = ['/homes/', '/to-rent/'] as const;

export function robotsFor(searchIndexing: 'on' | 'off', appUrl?: string): RobotsRules {
  if (searchIndexing !== 'on') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: [...INDEXABLE_PATHS], disallow: '/' },
    ...(appUrl ? { sitemap: `${appUrl.replace(/\/+$/, '')}/sitemap.xml` } : {}),
  };
}

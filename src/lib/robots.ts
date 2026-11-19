/**
 * BA-1, UX-LS-11: what robots.txt says. Search engines may read live homes' public pages, and
 * nothing else, only where the deployment says so (SEARCH_INDEXING=on, production alone). Any
 * other copy of Gaff, the test copy included, disallows everything.
 */
export interface RobotsRules {
  rules: { userAgent: string; allow?: string[]; disallow: string };
}

export function robotsFor(searchIndexing: 'on' | 'off'): RobotsRules {
  if (searchIndexing !== 'on') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: ['/homes/'], disallow: '/' } };
}

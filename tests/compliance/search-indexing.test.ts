import { describe, expect, it, vi } from 'vitest';
import { placePageRobots } from '@/domain/search/place-pages';
import { homePageRobots } from '@/domain/homes/home-page';
import { robotsFor } from '@/lib/robots';

/**
 * M111, UX-LS-11 (BA-12): search engines are told exactly what they may index, and nothing
 * else. With SEARCH_INDEXING off (every copy but production) every page says "noindex", there is
 * no sitemap entry and robots.txt disallows everything. With it on, only live homes' pages and
 * the pages of places with homes may be indexed.
 */

/** The X-Robots-Tag rules next.config.ts makes with these settings. */
async function robotsHeaders(settings: Record<string, string>) {
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  vi.resetModules();
  try {
    const config = (await import('../../next.config')).default;
    const rules = (await config.headers?.()) ?? [];
    return rules.flatMap((rule) => {
      const tag = rule.headers.find((h) => h.key === 'X-Robots-Tag')?.value;
      return tag ? [{ source: rule.source, tag }] : [];
    });
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('M111, UX-LS-11: what search engines are told', () => {
  it('M111: with SEARCH_INDEXING off, every page says noindex and robots.txt disallows all', async () => {
    const settings: Array<Record<string, string>> = [
      { SEARCH_INDEXING: '' },
      { SEARCH_INDEXING: 'off' },
      { SEARCH_INDEXING: 'on ' },
    ];
    for (const env of settings) {
      expect(await robotsHeaders(env)).toEqual([{ source: '/:path*', tag: 'noindex, nofollow' }]);
    }
    expect(robotsFor('off', 'https://gaff.ie')).toEqual({
      rules: { userAgent: '*', disallow: '/' },
    });
    expect(homePageRobots({ live: true, searchIndexing: false }).index).toBe(false);
    expect(placePageRobots({ liveHomes: 5, searchIndexing: false }).index).toBe(false);
  });

  it('M111: with it on, only homes’ pages and places’ pages may be indexed', async () => {
    expect(await robotsHeaders({ SEARCH_INDEXING: 'on' })).toEqual([
      { source: '/:path*', tag: 'noindex, nofollow' },
      { source: '/homes/:ref', tag: 'index, follow' },
      { source: '/to-rent/:path*', tag: 'index, follow' },
    ]);
    expect(robotsFor('on', 'https://gaff.ie').rules.allow).toEqual(['/homes/', '/to-rent/']);
    // The page itself still says noindex for a let home, or a place with no homes in it.
    expect(homePageRobots({ live: false, searchIndexing: true }).index).toBe(false);
    expect(placePageRobots({ liveHomes: 0, searchIndexing: true }).index).toBe(false);
    expect(placePageRobots({ liveHomes: 1, searchIndexing: true }).index).toBe(true);
  });
});

import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { sitemapEntries } from '@/server/search/place-pages';

export const dynamic = 'force-dynamic';

/**
 * M111 (BA-12): the sitemap, where SEARCH_INDEXING=on (production alone): every live home's page
 * and the page of every place with a home on Gaff in it. Anywhere else it lists nothing, and
 * robots.txt names no sitemap (src/lib/robots.ts). Private links (renters', owners', referees')
 * are never listed: they are reached only through their own emails.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Read straight from the process first, like robots.txt, so a test copy reads nothing at all.
  if (process.env.SEARCH_INDEXING !== 'on' || env().SEARCH_INDEXING !== 'on') return [];
  const base = env().APP_URL.replace(/\/+$/, '');
  return (await sitemapEntries()).map(({ path, lastModified }) => ({
    url: `${base}${path}`,
    ...(lastModified ? { lastModified } : {}),
  }));
}

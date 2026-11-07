import type { MetadataRoute } from 'next';
import { placePath, placesWithHomes } from '@/domain/search/places';
import { env } from '@/lib/env';
import { indexableListings } from '@/server/search/sitemap';

export const dynamic = 'force-dynamic';

/**
 * M111: every open listing, and every place with a home in it. Nothing private is ever listed:
 * private links (renters', landlords', referees') are reached only through their own emails.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = env();
  if (!config.MARKETPLACE_PUBLIC) return [];
  const base = config.APP_URL;
  const listings = await indexableListings();
  const live = listings.filter((l) => l.status === 'live');
  return [
    { url: `${base}/to-rent`, changeFrequency: 'hourly' },
    ...placesWithHomes(live).map((place) => ({
      url: `${base}${placePath(place)}`,
      changeFrequency: 'hourly' as const,
    })),
    ...listings.map((listing) => ({
      url: `${base}/home/${listing.slug}`,
      lastModified: listing.updatedAt,
    })),
    { url: `${base}/how-results-are-ordered`, changeFrequency: 'monthly' },
    { url: `${base}/listing-policy`, changeFrequency: 'monthly' },
  ];
}

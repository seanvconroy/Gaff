import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { cache } from 'react';
import { withPublic } from '@/db/client';
import { publicListings } from '@/db/schema';
import type { ProjectionLetter, ProjectionPhoto } from '@/domain/listings/projection';
import { SIMILAR_RENT_RANGE, similarHomes } from '@/domain/search/similar';

/**
 * M66 to M74: one listing's public page, read from the public zone only. A listing that was
 * never published, or is paused or in review, has no public row and so no page.
 */
export const publicListingBySlug = cache(async (slug: string) => {
  return withPublic(async (tx) => {
    const [row] = await tx.select().from(publicListings).where(eq(publicListings.slug, slug));
    if (!row) return null;
    return {
      ...row,
      photos: row.photos as unknown as ProjectionPhoto[],
      letter: row.letter as unknown as ProjectionLetter,
      facts: row.facts as PublicFacts,
    };
  });
});

export type PublicListing = NonNullable<Awaited<ReturnType<typeof publicListingBySlug>>>;

export interface PublicFacts {
  heating?: string | null;
  parking?: string | null;
  outdoorSpace?: string | null;
  accessibility?: string[];
  appliances?: string[];
  broadband?: string | null;
  floorAreaSqm?: number | null;
  floor?: number | null;
  hasLift?: boolean | null;
  ensuites?: number | null;
}

/** M73, M74: up to four live homes like this one, nearby. */
export async function similarLiveHomes(listing: PublicListing, limit = 4) {
  const range = Math.round(listing.rentCents * SIMILAR_RENT_RANGE);
  const candidates = await withPublic((tx) =>
    tx
      .select({
        listingId: publicListings.listingId,
        slug: publicListings.slug,
        title: publicListings.title,
        area: publicListings.area,
        county: publicListings.county,
        rentCents: publicListings.rentCents,
        bedrooms: publicListings.bedrooms,
        bathrooms: publicListings.bathrooms,
        latitude: publicListings.latitude,
        longitude: publicListings.longitude,
        availableFrom: publicListings.availableFrom,
        photos: publicListings.photos,
      })
      .from(publicListings)
      .where(
        and(
          eq(publicListings.status, 'live'),
          eq(publicListings.county, listing.county),
          ne(publicListings.listingId, listing.listingId),
          inArray(publicListings.bedrooms, [
            listing.bedrooms - 1,
            listing.bedrooms,
            listing.bedrooms + 1,
          ]),
          gte(publicListings.rentCents, listing.rentCents - range),
          lte(publicListings.rentCents, listing.rentCents + range),
        ),
      )
      .limit(500),
  );
  return similarHomes(listing, candidates, limit).map((home) => ({
    ...home,
    photo: (home.photos as unknown as ProjectionPhoto[]).find((p) => p.kind === 'photo') ?? null,
  }));
}

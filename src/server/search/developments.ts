import { and, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';
import { withPublic } from '@/db/client';
import { publicDevelopments, publicListings } from '@/db/schema';
import { homesByType } from '@/domain/developments/development';
import type { ProjectionPhoto } from '@/domain/listings/projection';

/** M75: a development's public page, and its homes taking enquiries, by type (M34). */
export const publicDevelopmentBySlug = cache(async (slug: string) => {
  return withPublic(async (tx) => {
    const [development] = await tx
      .select()
      .from(publicDevelopments)
      .where(eq(publicDevelopments.slug, slug));
    if (!development) return null;
    const homes = await tx
      .select({
        listingId: publicListings.listingId,
        slug: publicListings.slug,
        title: publicListings.title,
        rentCents: publicListings.rentCents,
        propertyType: publicListings.propertyType,
        bedrooms: publicListings.bedrooms,
        availableFrom: publicListings.availableFrom,
        facts: publicListings.facts,
      })
      .from(publicListings)
      .where(
        and(
          eq(publicListings.developmentId, development.developmentId),
          inArray(publicListings.status, ['live']),
        ),
      );
    return {
      ...development,
      photos: development.photos as unknown as ProjectionPhoto[],
      operator: development.operator as { kind: string; name: string; badges: string[] },
      byType: homesByType(
        homes.map(({ facts, ...home }) => ({
          ...home,
          floor: (facts as { floor?: number | null }).floor ?? null,
          floorAreaSqm: (facts as { floorAreaSqm?: number | null }).floorAreaSqm ?? null,
        })),
      ),
    };
  });
});

/** M33: the development a listing belongs to, for a link from its page. */
export async function developmentOfListing(developmentId: string | null) {
  if (!developmentId) return null;
  const [row] = await withPublic((tx) =>
    tx
      .select({
        slug: publicDevelopments.slug,
        name: publicDevelopments.name,
        amenities: publicDevelopments.amenities,
      })
      .from(publicDevelopments)
      .where(eq(publicDevelopments.developmentId, developmentId)),
  );
  return row ?? null;
}

/** M111: live developments, for the sitemap. */
export async function indexableDevelopments() {
  return withPublic((tx) =>
    tx
      .select({ slug: publicDevelopments.slug, updatedAt: publicDevelopments.updatedAt })
      .from(publicDevelopments),
  );
}

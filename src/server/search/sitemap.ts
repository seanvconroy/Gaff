import { inArray } from 'drizzle-orm';
import { withPublic } from '@/db/client';
import { publicListings } from '@/db/schema';

/** M111: the listings search engines may index: open ones, never let or withdrawn. */
export async function indexableListings() {
  return withPublic((tx) =>
    tx
      .select({
        slug: publicListings.slug,
        updatedAt: publicListings.updatedAt,
        status: publicListings.status,
        county: publicListings.county,
        routingKey: publicListings.routingKey,
        latitude: publicListings.latitude,
        longitude: publicListings.longitude,
      })
      .from(publicListings)
      .where(inArray(publicListings.status, ['live', 'enquiries_closed', 'let_agreed'])),
  );
}

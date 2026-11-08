import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { listingRevisions, listings, publicListings, viewingSessions } from '@/db/schema';
import type { PublicStatus } from '@/domain/listings/lifecycle';
import {
  buildPublicListing,
  type PublicListingValues,
  type PublicViewing,
} from '@/domain/listings/projection';
import { enqueue } from '@/server/jobs/enqueue';
import { homeBer, letterCard, readyPhotos, type ListingContext } from './context';

/**
 * ADR-0017: writes what renters see of a listing, in the same transaction as the change.
 * The listing must have a slug and dates (it has been published at least once).
 */
export async function writePublicListing(
  tx: Tx,
  context: ListingContext,
  status: PublicStatus,
  now = new Date(),
): Promise<PublicListingValues> {
  const { letting, home, listing } = context;
  if (!listing.slug || !listing.publishedAt || !listing.confirmedAt) {
    throw new Error('A listing needs a slug and dates before it goes public');
  }
  if (home.latitude === null || home.longitude === null) {
    throw new Error('A listing needs a location before it goes public');
  }
  const values = buildPublicListing(
    {
      listingId: listing.id,
      organisationId: listing.organisationId,
      slug: listing.slug,
      status,
      home: {
        ...home,
        latitude: home.latitude,
        longitude: home.longitude,
        ber: homeBer(home),
      },
      rentCents: letting.monthlyRentCents,
      depositCents: letting.depositCents ?? 0,
      availableFrom: letting.availableFrom,
      furnished: letting.furnished,
      criteria: letting.criteria ?? { noPets: false },
      enquiriesCloseAt: letting.enquiriesCloseAt,
      description: listing.description ?? '',
      tourUrl: listing.tourUrl,
      photos: readyPhotos(context),
      letter: await letterCard(
        tx,
        listing.organisationId,
        listing.assignedTo ?? listing.createdBy,
        now,
      ),
      publishedAt: listing.publishedAt,
      confirmedAt: listing.confirmedAt,
      viewings: await upcomingViewings(tx, letting.id, now),
      closedAt: listing.closedAt ?? (status === 'let' || status === 'withdrawn' ? now : null),
    },
    now,
  );
  const [before] = await tx
    .select({
      rentCents: publicListings.rentCents,
      status: publicListings.status,
      latitude: publicListings.latitude,
      longitude: publicListings.longitude,
    })
    .from(publicListings)
    .where(eq(publicListings.listingId, listing.id));
  await tx
    .insert(publicListings)
    .values(values)
    .onConflictDoUpdate({ target: publicListings.listingId, set: { ...values, updatedAt: now } });
  // M86, M87: a home that's newly live, or cheaper, is matched to saved searches (once each).
  const newlyLive = status === 'live' && (!before || before.status !== 'live');
  const cheaper = status === 'live' && before !== undefined && values.rentCents < before.rentCents;
  if (newlyLive || cheaper) {
    await enqueue(
      tx,
      'alerts_match',
      { listingId: listing.id },
      { jobKey: `alerts_match:${listing.id}` },
    );
  }
  // M121: the counts of homes beside places, once a minute at most however many homes change.
  const wasLive = before?.status === 'live';
  const moved =
    wasLive &&
    status === 'live' &&
    (before.latitude !== values.latitude || before.longitude !== values.longitude);
  if (wasLive !== (status === 'live') || moved) {
    await enqueue(
      tx,
      'places_count',
      {},
      {
        jobKey: 'places_count',
        jobKeyMode: 'preserve_run_at',
        runAt: new Date(now.getTime() + 60_000),
      },
    );
  }
  return values;
}

/** M47, M69: the letting's viewing times still to come, with no bookings or names. */
async function upcomingViewings(tx: Tx, lettingId: string, now: Date): Promise<PublicViewing[]> {
  const rows = await tx
    .select({
      startsAt: viewingSessions.startsAt,
      endsAt: viewingSessions.endsAt,
      kind: viewingSessions.kind,
    })
    .from(viewingSessions)
    .where(and(eq(viewingSessions.lettingId, lettingId), gt(viewingSessions.endsAt, now)))
    .orderBy(asc(viewingSessions.startsAt));
  return rows.map((r) => ({
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    kind: r.kind,
  }));
}

/** Takes a listing off the public side (paused, or back in review). */
export async function removePublicListing(tx: Tx, listingId: string): Promise<void> {
  await tx.delete(publicListings).where(eq(publicListings.listingId, listingId));
}

/** M51: keeps a copy of what was published at each publish or edit (the DSA record). */
export async function saveRevision(
  tx: Tx,
  context: ListingContext,
  published: PublicListingValues,
  by: string | null,
): Promise<number> {
  const [row] = await tx
    .update(listings)
    .set({ revision: sql`${listings.revision} + 1` })
    .where(eq(listings.id, context.listing.id))
    .returning({ revision: listings.revision });
  await tx.insert(listingRevisions).values({
    organisationId: context.listing.organisationId,
    listingId: context.listing.id,
    revision: row!.revision,
    content: published as unknown as Record<string, unknown>,
    createdBy: by,
  });
  return row!.revision;
}

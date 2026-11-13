import { sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { DUPLICATE_DISTANCE } from '@/domain/media/photos';
import { checkListingText } from '@/domain/moderation/listing-text';
import { approximateLocation } from '@/domain/places/locate';
import { bboxAround } from '@/domain/places/geo';
import { loadGazetteer } from '@/server/places/places';
import type { ListingContext } from './context';

export type RiskReason =
  | 'photo_reused'
  | 'rent_far_below'
  | 'scam_wording'
  | 'description_copied'
  | 'new_account_burst'
  | 'unfair_wording';

/** A rent this far below similar homes nearby is held for a look (M29). */
const FAR_BELOW = 0.6;
const MIN_COMPARABLES = 5;

/**
 * M29: signals that hold a listing for a person at Gaff before it goes live. They read across
 * organisations (another letter's photos, rents and words), so they run as a system job.
 * Only IDs, numbers and yes-or-no come back: never another letter's data.
 */
export async function riskSignals(
  context: ListingContext,
  now = new Date(),
): Promise<RiskReason[]> {
  const reasons: RiskReason[] = [];
  const { listing, home, letting } = context;
  if (checkListingText(listing.description ?? '').some((f) => f.kind === 'scam_wording')) {
    reasons.push('scam_wording');
  }
  const place = approximateLocation(home, await loadGazetteer());
  const box = bboxAround(place.place.centre, place.place.radiusMetres);

  const found = await withSystem(async (tx) => {
    const { rows: photos } = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from media mine
      join media theirs on theirs.organisation_id <> mine.organisation_id
        and theirs.status = 'ready' and theirs.phash is not null
        and bit_count((mine.phash # theirs.phash)::bit(64)) <= ${DUPLICATE_DISTANCE}
      where mine.home_id = ${home.id} and mine.status = 'ready' and mine.phash is not null`);
    const { rows: rents } = await tx.execute<{ median: number | null; n: number }>(sql`
      select percentile_cont(0.5) within group (order by rent_cents) as median, count(*)::int as n
      from public_listings
      where status = 'live' and bedrooms = ${home.bedrooms} and listing_id <> ${listing.id}
        and latitude between ${box.minLat} and ${box.maxLat}
        and longitude between ${box.minLng} and ${box.maxLng}`);
    const description = (listing.description ?? '').trim();
    const { rows: copies } =
      description.length >= 200
        ? await tx.execute<{ n: number }>(sql`
            select count(*)::int as n from listings
            where organisation_id <> ${listing.organisationId}
              and lower(regexp_replace(coalesce(description, ''), '\\s+', ' ', 'g'))
                = lower(regexp_replace(${description}, '\\s+', ' ', 'g'))`)
        : { rows: [{ n: 0 }] };
    const { rows: burst } = await tx.execute<{ young: boolean; recent: number }>(sql`
      select o.created_at > ${new Date(now.getTime() - 7 * 86_400_000)} as young,
        (select count(*)::int from listings l where l.organisation_id = o.id
          and l.published_at > ${new Date(now.getTime() - 86_400_000)}) as recent
      from organisations o where o.id = ${listing.organisationId}`);
    return { photos: photos[0]!.n, rent: rents[0]!, copies: copies[0]!.n, burst: burst[0]! };
  });

  if (found.photos > 0) reasons.push('photo_reused');
  if (
    found.rent.median !== null &&
    found.rent.n >= MIN_COMPARABLES &&
    letting.monthlyRentCents < found.rent.median * FAR_BELOW
  ) {
    reasons.push('rent_far_below');
  }
  if (found.copies > 0) reasons.push('description_copied');
  if (found.burst.young && found.burst.recent >= 5) reasons.push('new_account_burst');
  return reasons;
}

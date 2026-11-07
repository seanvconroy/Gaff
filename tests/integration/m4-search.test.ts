import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { withOrg, withPublic, withSystem } from '@/db/client';
import { listingDailyStats, listingVisitors, publicListings } from '@/db/schema';
import { readFilters } from '@/domain/search/filters';
import { searchArea } from '@/domain/search/places';
import { closeLetting } from '@/server/lettings/close';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { setPaused } from '@/server/listings/manage';
import { publishListing } from '@/server/listings/publish';
import { recordListingView } from '@/server/measurement/views';
import { sweepMarketplace } from '@/server/retention/marketplace';
import { publicListingBySlug, similarLiveHomes } from '@/server/search/listing';
import { searchListings, widerSearchesWithHomes } from '@/server/search/search';
import { aViewingSession, daysFromToday } from '../fixtures/lettings';
import { databaseError, type Member } from './helpers';
import { aCheckedLandlord, aListableLetting } from './listing-helpers';

/**
 * M56 to M62, M73, M74: search over the public zone. These homes are in Sligo and Leitrim, where
 * no other test lists a home, so the results are exactly these.
 */
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface Home {
  member: Member;
  lettingId: string;
  slug: string;
  listingId: string;
}
const homes: Record<string, Home> = {};

async function listHome(
  member: Member,
  name: string,
  letting: Record<string, string>,
  options: { pets?: boolean } = {},
) {
  const { lettingId } = await aListableLetting(member, undefined, letting);
  if (options.pets) await setCriteria(member, lettingId, { maxOccupants: 4, noPets: false });
  const result = await publishListing(member, lettingId, { declare: true });
  if (result.outcome !== 'live') throw new Error(`${name} didn't go live: ${result.outcome}`);
  const row = await publicListingBySlug(result.slug);
  homes[name] = { member, lettingId, slug: result.slug, listingId: row!.listingId };
}

const sligo = (extra: Record<string, string>) => ({
  addressLine1: `${Math.floor(Math.random() * 90) + 1} Wine Street`,
  area: 'Sligo town, Co. Sligo',
  county: 'Sligo',
  eircode: 'F91 A2C3',
  ...extra,
});

const search = (place: string | null, query = '') =>
  searchListings(searchArea(place)!, readFilters(new URLSearchParams(query)));
const ids = (results: Awaited<ReturnType<typeof search>>) =>
  results.results.map((r) => r.listingId);

beforeAll(async () => {
  const mary = await aCheckedLandlord();
  const john = await aCheckedLandlord();
  await listHome(mary, 'twoBed', sligo({ rent: '1,400', bedrooms: '2' }), { pets: true });
  await listHome(mary, 'house', sligo({ rent: '1,900', bedrooms: '3', propertyType: 'house' }));
  await listHome(mary, 'leitrim', {
    addressLine1: '4 Main Street',
    area: 'Mohill, Co. Leitrim',
    county: 'Leitrim',
    eircode: 'N41 C4D5',
    rent: '1,100',
    bedrooms: '1',
  });
  await listHome(john, 'similar', sligo({ rent: '1,500', bedrooms: '2' }));
  await listHome(john, 'paused', sligo({ rent: '1,450', bedrooms: '2' }));
  await setPaused(john, homes.paused!.lettingId, true);
  await listHome(john, 'let', sligo({ rent: '1,450', bedrooms: '2' }));
  await closeLetting(john, homes.let!.lettingId, 'let');
}, 120_000);

describe('M56: search by county, town or area', () => {
  it('finds the live homes in a county, and never a paused or let one', async () => {
    const found = await search('sligo');
    expect(found.total).toBe(3);
    expect(new Set(ids(found))).toEqual(
      new Set([homes.twoBed!.listingId, homes.house!.listingId, homes.similar!.listingId]),
    );
  });

  it('finds homes by distance from a town', async () => {
    const found = await search('sligo-town');
    expect(found.total).toBe(3);
    expect((await search('leitrim')).results.map((r) => r.listingId)).toEqual([
      homes.leitrim!.listingId,
    ]);
  });

  it('shows on each card what renters filter on, and nothing private', async () => {
    const card = (await search('sligo', 'type=house')).results[0]!;
    expect(card).toMatchObject({
      title: '3 bed house in Sligo town, Co. Sligo',
      rentCents: 190_000,
      bedrooms: 3,
      status: 'live',
    });
    expect(card.photos.length).toBe(3);
    // M19: a private landlord shows only their first name; never the Eircode or house number.
    expect(card.letter).toMatchObject({ kind: 'landlord', name: 'Mary' });
    expect(card.addressShown).toBe('Wine Street, Sligo town, Co. Sligo');
    expect(JSON.stringify(card)).not.toMatch(/F91|\d+ Wine Street|Walsh|@/);
  });
});

describe('M58: filters', () => {
  it('filters by rent, bedrooms, type and pets', async () => {
    expect(ids(await search('sligo', 'beds=3'))).toEqual([homes.house!.listingId]);
    expect(ids(await search('sligo', 'max=1450'))).toEqual([homes.twoBed!.listingId]);
    expect(ids(await search('sligo', 'min=1450&max=1600'))).toEqual([homes.similar!.listingId]);
    expect(ids(await search('sligo', 'pets=1'))).toEqual([homes.twoBed!.listingId]);
    expect(ids(await search('sligo', 'type=house'))).toEqual([homes.house!.listingId]);
    expect(ids(await search('sligo', 'outdoor=1')).length).toBe(3);
    expect(ids(await search('sligo', `by=${daysFromToday(1)}`))).toEqual([]);
  });
});

describe('M59: the order', () => {
  it('orders by rent either way', async () => {
    expect(ids(await search('sligo', 'sort=cheapest'))).toEqual([
      homes.twoBed!.listingId,
      homes.similar!.listingId,
      homes.house!.listingId,
    ]);
    expect(ids(await search('sligo', 'sort=dearest'))[0]).toBe(homes.house!.listingId);
  });

  it('puts the home that fits the budget best first in best match', async () => {
    expect(ids(await search('sligo', 'max=1500'))[0]).toBe(homes.twoBed!.listingId);
  });
});

describe('M61: when nothing matches', () => {
  it('suggests the wider searches that do find homes', async () => {
    const wider = await widerSearchesWithHomes(
      searchArea('sligo-town')!,
      readFilters(new URLSearchParams('beds=4')),
    );
    expect(wider).toEqual([
      expect.objectContaining({ widening: { change: 'beds', beds: 3 }, total: 1 }),
    ]);
  });
});

describe('M66 to M74: the listing page', () => {
  it('reads a live listing by its address, with its next viewing times', async () => {
    const listing = await publicListingBySlug(homes.twoBed!.slug);
    expect(listing).toMatchObject({ status: 'live', petsConsidered: true, closedAt: null });
    expect(listing!.viewings).toHaveLength(1);
    expect(listing!.criteria).toEqual(['Up to 4 people']);
  });

  it('M47: a new viewing time appears on the live listing', async () => {
    const { member, lettingId, slug } = homes.house!;
    await addViewingSession(member, lettingId, aViewingSession({ date: daysFromToday(9) }));
    expect((await publicListingBySlug(slug))!.viewings).toHaveLength(2);
  });

  it('has no page for a paused listing', async () => {
    expect(await publicListingBySlug(homes.paused!.slug)).toBeNull();
  });

  it('M74: keeps a let home’s page, saying so, with when it was let', async () => {
    const listing = await publicListingBySlug(homes.let!.slug);
    expect(listing).toMatchObject({ status: 'let' });
    expect(listing!.closedAt).toBeInstanceOf(Date);
  });

  it('M73: finds similar homes nearby', async () => {
    const listing = (await publicListingBySlug(homes.twoBed!.slug))!;
    const similar = await similarLiveHomes(listing);
    expect(similar.map((h) => h.listingId)).toEqual([homes.similar!.listingId]);
    expect(similar[0]!.photo).toMatchObject({ kind: 'photo' });
  });
});

describe('ADR-0017: the public zone is read-only', () => {
  it('refuses writes inside withPublic()', async () => {
    const refused = await databaseError(
      withPublic((tx) =>
        tx
          .update(publicListings)
          .set({ rentCents: 1 })
          .where(eq(publicListings.listingId, homes.twoBed!.listingId)),
      ),
    );
    expect(refused).toMatch(/read-only transaction/);
  });
});

describe('Measurement: listing views without cookies', () => {
  it('counts a view each time, a visitor once a day, and never a bot', async () => {
    const { listingId, member } = homes.leitrim!;
    const now = new Date();
    await recordListingView(listingId, { ip: '203.0.113.7', userAgent: iphone }, now);
    await recordListingView(listingId, { ip: '203.0.113.7', userAgent: iphone }, now);
    await recordListingView(listingId, { ip: '203.0.113.8', userAgent: iphone }, now);
    expect(
      await recordListingView(listingId, { ip: '203.0.113.9', userAgent: 'Googlebot/2.1' }, now),
    ).toBe('ignored');
    expect(
      await recordListingView(crypto.randomUUID(), { ip: '203.0.113.9', userAgent: iphone }, now),
    ).toBe('ignored');
    const [stats] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listingDailyStats).where(eq(listingDailyStats.listingId, listingId)),
    );
    expect(stats).toMatchObject({ views: 3, visitors: 2 });
  });

  it('keeps no IP address or browser, only a hash, and clears the hashes the next day', async () => {
    const { listingId, member } = homes.leitrim!;
    const hashes = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listingVisitors).where(eq(listingVisitors.listingId, listingId)),
    );
    expect(hashes).toHaveLength(2);
    expect(JSON.stringify(hashes)).not.toMatch(/203\.0\.113|iPhone/);
    const tomorrow = new Date(Date.now() + 86_400_000);
    await sweepMarketplace(tomorrow);
    const left = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listingVisitors).where(eq(listingVisitors.listingId, listingId)),
    );
    expect(left).toHaveLength(0);
  });
});

describe('M74: a let home’s page goes after 90 days', () => {
  it('is removed by the nightly job', async () => {
    const { listingId, slug } = homes.let!;
    await withSystem((tx) =>
      tx
        .update(publicListings)
        .set({ closedAt: sql`now() - interval '91 days'` })
        .where(and(eq(publicListings.listingId, listingId))),
    );
    const swept = await sweepMarketplace();
    expect(swept.closedPages).toBeGreaterThanOrEqual(1);
    expect(await publicListingBySlug(slug)).toBeNull();
  });
});

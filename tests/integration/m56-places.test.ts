import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '@/db/client';
import { placeMisses } from '@/db/schema';
import { readFilters } from '@/domain/search/filters';
import { searchArea } from '@/domain/search/places';
import { publishListing } from '@/server/listings/publish';
import {
  loadGazetteer,
  missWorthCounting,
  recordMiss,
  suggestPlaces,
} from '@/server/places/places';
import { publicListingBySlug } from '@/server/search/listing';
import { countListings, mapCard, mapPoints, searchListings } from '@/server/search/search';
import { aCheckedLandlord, aListableLetting } from './listing-helpers';

const slugsOf = (s: Awaited<ReturnType<typeof suggestPlaces>>) =>
  s.groups.flatMap((g) => g.items.map((i) => i.slug));

describe('M56: suggestions from the place index in Postgres', () => {
  it('finds towns, streets and landmarks, with the best group first', async () => {
    const kins = await suggestPlaces('Kins');
    expect(kins.groups.map((g) => g.kind)).toEqual(['places', 'streets']);
    expect(slugsOf(kins).slice(0, 2)).toEqual(['kinsale', 'kinsealy']);
    expect(slugsOf(kins)).toContain('kinsale-road-ballyphehane-cork');
    expect(slugsOf(await suggestPlaces('Highfield road'))).toEqual([
      'highfield-road-rathgar-dublin-6',
      'highfield-road-ballintemple-cork',
    ]);
  });

  it('forgives fadas, Irish names, aliases and typos', async () => {
    expect(slugsOf(await suggestPlaces('dun laoghaire'))[0]).toBe('dun-laoghaire');
    expect(slugsOf(await suggestPlaces('Cionn tSáile'))[0]).toBe('kinsale');
    expect(slugsOf(await suggestPlaces('UCD'))[0]).toBe(
      'university-college-dublin-belfield-dublin-4',
    );
    const typo = await suggestPlaces('Kinsael');
    expect(typo.didYouMean).toBe(true);
    expect(slugsOf(typo)[0]).toBe('kinsale');
  });

  it('loads streets for a search by slug, beside the places with pages', async () => {
    const g = await loadGazetteer(['highfield-road-rathgar-dublin-6']);
    expect(g.bySlug('highfield-road-rathgar-dublin-6')?.kind).toBe('street');
    expect(g.places.some((p) => p.kind === 'street')).toBe(false);
  });
});

describe('M124: counting places nobody found', () => {
  it('keeps no digits, nothing long, and counts by day', async () => {
    expect(missWorthCounting('12 Highfield Road')).toBeNull();
    expect(missWorthCounting('D06 F2X3')).toBeNull();
    expect(missWorthCounting('x'.repeat(41))).toBeNull();
    expect(missWorthCounting('Ballyzork')).toBe('ballyzork');
    await recordMiss('Ballyzork', '2026-11-08');
    await recordMiss('BALLYZORK', '2026-11-08');
    const rows = await withSystem((tx) =>
      tx.select().from(placeMisses).where(eq(placeMisses.text, 'ballyzork')),
    );
    expect(rows).toEqual([{ day: '2026-11-08', text: 'ballyzork', count: 2 }]);
  });
});

describe('M113, M116, M117, M57: near a street, counts, map points and cards', () => {
  let listingId = '';
  beforeAll(async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, {
      area: 'Rathgar, Dublin 6',
      rent: '2,350',
    });
    const result = await publishListing(member, lettingId, { declare: true });
    if (result.outcome !== 'live') throw new Error(`Not live: ${result.outcome}`);
    listingId = (await publicListingBySlug(result.slug))!.listingId;
  });

  it('finds a home within a kilometre of Highfield Road, Rathgar', async () => {
    const g = await loadGazetteer([
      'highfield-road-rathgar-dublin-6',
      'highfield-road-ballintemple-cork',
    ]);
    const near = searchArea('highfield-road-rathgar-dublin-6', g)!;
    const found = await searchListings(near, readFilters(new URLSearchParams()));
    expect(found.results.map((r) => r.listingId)).toContain(listingId);
    const farAway = searchArea('highfield-road-ballintemple-cork', g)!;
    const none = await searchListings(farAway, readFilters(new URLSearchParams()));
    expect(none.results.map((r) => r.listingId)).not.toContain(listingId);
  });

  it('counts a draft search, with the rents for the histogram whatever the rent filter', async () => {
    const g = await loadGazetteer(['highfield-road-rathgar-dublin-6']);
    const near = searchArea('highfield-road-rathgar-dublin-6', g)!;
    const cheap = await countListings(near, readFilters(new URLSearchParams('max=1000')));
    expect(cheap.histogram?.max).toBeGreaterThanOrEqual(2350);
    const all = await countListings(near, readFilters(new URLSearchParams('max=3000')));
    expect(all.total).toBeGreaterThan(cheap.total);
  });

  it('gives the map light pins in its view, named for their home, and a mini card', async () => {
    const g = await loadGazetteer();
    const dublin = searchArea('dublin', g)!;
    const view = { minLat: 53.3, maxLat: 53.33, minLng: -6.3, maxLng: -6.24 };
    const pins = await mapPoints(dublin, readFilters(new URLSearchParams()), view);
    const pin = pins.find((p) => p.id === listingId);
    expect(pin).toMatchObject({ rentCents: 235_000 });
    expect(pin!.title).toMatch(/Rathgar/);
    expect(Object.keys(pin!).sort()).toEqual(['id', 'lat', 'lng', 'rentCents', 'title']);
    const outside = await mapPoints(dublin, readFilters(new URLSearchParams()), {
      minLat: 53.38,
      maxLat: 53.4,
      minLng: -6.3,
      maxLng: -6.24,
    });
    expect(outside.map((p) => p.id)).not.toContain(listingId);
    expect((await mapCard(listingId))?.listingId).toBe(listingId);
  });
});

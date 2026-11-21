import { inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { withSystem } from '@/db/client';
import { lettings, mapDailyCounts } from '@/db/schema';
import { distanceMetres } from '@/domain/places/geo';
import { irishToday } from '@/lib/format';
import { setHomePoint } from '@/server/lettings/location';
import { addPhoto, setPhotoKind } from '@/server/lettings/photos';
import { CARD_PHOTOS } from '@/domain/lettings/photo-files';
import { publicHomes } from '@/server/homes/public-homes';
import { mapCard, mapPins } from '@/server/search/map';
import { mapUseFor, recordMapCount, sweepMapCounts } from '@/server/search/map-counts';
import { findHomes, liveHomesOnGaff, nearestHomesTo } from '@/server/search/homes';
import { createTestPerson } from './helpers';
import { saveSearchFor, savedSearchesOf } from '@/server/saved/searches';
import { searchWords } from '@/copy/saved';
import { nameKey, placeNames } from '@/server/search/where';
import { forgetHomeAddresses, resolveSearch } from '@/server/search/where';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember } from './helpers';

/** BA-5: the search map's data (M57, M117, M125) and its counts (M133). */

const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const view = { minLat: 51.7, minLng: -8.7, maxLat: 51.75, maxLng: -8.45 };

/** The homes made here, taken off Gaff afterwards: other tests count Kinsale's homes. */
const made: string[] = [];
afterAll(async () => {
  if (made.length === 0) return;
  await withSystem((tx) =>
    tx.update(lettings).set({ status: 'withdrawn' }).where(inArray(lettings.id, made)),
  );
  forgetHomeAddresses();
});

async function aHomeOnGaff(
  member: Awaited<ReturnType<typeof createTestMember>>,
  addressLine1: string,
  point: { lat: number; lng: number } | null,
) {
  const { lettingId } = await aLiveLetting(member, {
    addressLine1,
    area: 'Kinsale',
    county: 'Cork',
    eircode: '',
  });
  made.push(lettingId);
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  if (point) await setHomePoint(member, lettingId, point);
  return lettingId;
}

describe('M57, M125: the pins are the homes that fit and have a pin', () => {
  it('M125: a home without a pin is in the list but not on the map; pins carry no person', async () => {
    const agency = await createTestMember();
    const door = { lat: 51.7059, lng: -8.5222 };
    await aHomeOnGaff(agency, '1 Pier Road', door);
    await aHomeOnGaff(agency, '2 Pier Road', null);
    const { filters, g } = await resolveSearch({ where: 'kinsale' });
    const listed = (await findHomes(filters, g)).fits;
    const answer = await mapPins({ where: 'kinsale' }, view);
    expect(answer.listed).toBe(listed.length);
    expect(answer.pinned).toBe(listed.filter((home) => home.point).length);
    const mine = answer.points.find((p) => p.lat === door.lat && p.lng === door.lng)!;
    expect(mine).toBeDefined();
    expect(Object.keys(mine).sort()).toEqual(['id', 'lat', 'lng', 'rentCents', 'title']);
    expect(mine.id).toMatch(/^[0-9a-f]{12}$/);
    // A pin outside the view isn't sent.
    const elsewhere = { minLat: 53.3, minLng: -6.3, maxLat: 53.34, maxLng: -6.2 };
    expect((await mapPins({ where: 'kinsale' }, elsewhere)).points).toEqual([]);
    // M117: its card is the list's card.
    expect(await mapCard(mine.id)).toMatchObject({ title: '€1,850 a month', id: mine.id });
  });

  it('UX-SR-6, M117: a card carries the home’s first photos in the lister’s order, in the list and on the map alike, and never a floor plan', async () => {
    const agency = await createTestMember();
    const door = { lat: 51.7041, lng: -8.5236 };
    const lettingId = await aHomeOnGaff(agency, '3 Pier Road', door);
    // Ten photos in all, each its own picture, and the second marked a floor plan (M44).
    const added = [];
    for (let i = 1; i < 10; i++) {
      const photo = await addPhoto(agency, lettingId, aPng([20 * i, 99, 168], { text: `${i}` }));
      if (!photo.ok) throw new Error(`photo ${i} was refused: ${photo.problem}`);
      added.push(photo.photo);
    }
    await setPhotoKind(agency, lettingId, added[0]!.id, 'floor_plan');

    const { filters, g } = await resolveSearch({ where: 'kinsale' });
    const listed = (await findHomes(filters, g)).fits.find(
      (home) => home.addressLine1 === '3 Pier Road',
    )!;
    // Nine photos and a floor plan: the card has the first eight photos, the cover first.
    expect(listed.photos).toHaveLength(CARD_PHOTOS);
    expect(listed.photos[0]!.src).toBe(listed.cover!.src);
    expect(new Set(listed.photos.map((photo) => photo.src)).size).toBe(CARD_PHOTOS);
    for (const photo of listed.photos) expect(Object.keys(photo)).toEqual(['src']);
    // The same homes by the in-memory list (the saved-search job's), so the two can't disagree.
    const kept = (await liveHomesOnGaff()).find((home) => home.id === listed.id)!;
    expect(kept.photos).toEqual(listed.photos);
    // The pin's card has what the list's card has.
    const card = (await mapCard(listed.id))!;
    expect(card.photos).toEqual(listed.photos);
    expect(Object.keys(card).sort()).toEqual(['free', 'href', 'id', 'line', 'photos', 'title']);
    // The floor plan is on the home's page alone.
    const [page] = await publicHomes({ ref: listed.id, limit: 1 });
    expect(page!.floorPlans).toHaveLength(1);
    expect(listed.photos.map((photo) => photo.src)).not.toContain(page!.floorPlans[0]!.small);
  });

  it('M38: a private landlord’s home is on the map within about 150 m, never at its door', async () => {
    const landlord = await createTestMember({ kind: 'private_landlord' });
    const door = { lat: 51.70712, lng: -8.52531 };
    await aHomeOnGaff(landlord, '9 Main Street', door);
    const { points } = await mapPins({ where: 'kinsale' }, view);
    expect(points.some((p) => p.lat === door.lat && p.lng === door.lng)).toBe(false);
    const nearest = Math.min(...points.map((p) => distanceMetres(p, door)));
    expect(nearest).toBeGreaterThan(0);
    expect(nearest).toBeLessThan(150);
  });
});

describe('UX-SR-13, UX-SR-15: drawn areas, and the nearest homes', () => {
  /** A square of a few hundred metres round a made-up spot west of Kinsale. */
  const spot = { lat: 51.7131, lng: -8.5611 };
  const round = (centre: { lat: number; lng: number }, reach = 0.003) => [
    { lat: centre.lat + reach, lng: centre.lng - reach * 1.6 },
    { lat: centre.lat + reach, lng: centre.lng + reach * 1.6 },
    { lat: centre.lat - reach, lng: centre.lng + reach * 1.6 },
    { lat: centre.lat - reach, lng: centre.lng - reach * 1.6 },
  ];

  it('UX-SR-13: a drawn area finds the homes whose pin is inside it, in the list and on the map', async () => {
    const agency = await createTestMember();
    await aHomeOnGaff(agency, '1 Drawn Lane', spot);
    await aHomeOnGaff(agency, '2 Drawn Lane', { lat: spot.lat + 0.02, lng: spot.lng });
    await aHomeOnGaff(agency, '3 Drawn Lane', null);
    const elsewhere = { lat: 51.76, lng: -8.61 };
    const { filters, g, placeName } = await resolveSearch({
      shapes: [round(spot), round(elsewhere)],
    });
    expect(placeName).toBe('2 drawn areas near Kinsale');
    const { fits, close } = await findHomes(filters, g);
    expect(fits.map((home) => home.addressLine1)).toEqual(['1 Drawn Lane']);
    expect(close).toEqual([]);
    const pins = await mapPins({ shapes: [round(spot)] }, view);
    expect(pins.listed).toBe(1);
    expect(pins.points).toHaveLength(1);
    // With another filter, a home in the area that misses it is close to what was asked.
    const asked = await resolveSearch({ shapes: [round(spot)], maxRent: 1000 });
    const found = await findHomes(asked.filters, asked.g);
    expect(found.fits).toEqual([]);
    expect(found.close.map((each) => each.miss.point)).toEqual(['maxRent']);
  });

  it('UX-SR-15: with no home where they searched, the nearest that fit the rest, nearest first', async () => {
    const agency = await createTestMember();
    const here = { lat: 51.6901, lng: -8.4951 };
    await aHomeOnGaff(agency, '1 Nearest Row', { lat: here.lat + 0.004, lng: here.lng });
    await aHomeOnGaff(agency, '2 Nearest Row', { lat: here.lat + 0.002, lng: here.lng });
    const { filters, g } = await resolveSearch({ shapes: [round(here, 0.0005)] });
    expect((await findHomes(filters, g)).fits).toEqual([]);
    const nearest = await nearestHomesTo(filters, g);
    expect(nearest.slice(0, 2).map((each) => each.home.addressLine1)).toEqual([
      '2 Nearest Row',
      '1 Nearest Row',
    ]);
    expect(Math.round(nearest[0]!.metres / 10)).toBe(22);
    // What they asked for besides the place still holds.
    expect(await nearestHomesTo({ ...filters, maxRent: 500 }, g)).toEqual([]);
    // A search with no place has no middle to be near.
    expect(await nearestHomesTo({ beds: 2 }, g)).toEqual([]);
  });

  it('UX-SR-10, UX-SR-13: a drawn area is saved with its search, once, and named', async () => {
    const renter = await createTestPerson();
    const search = { shapes: [round(spot)], beds: 2 };
    expect(await saveSearchFor(renter.id, search)).toEqual({ ok: true, kind: 'saved' });
    expect(await saveSearchFor(renter.id, search)).toEqual({ ok: true, kind: 'already' });
    const { searches } = await savedSearchesOf(renter.id);
    expect(searches).toHaveLength(1);
    expect(searches[0]!.filters).toEqual(search);
    const names = await placeNames([searches[0]!.filters]);
    expect(searchWords(searches[0]!.filters, new Date(), names.get(nameKey(search)))).toBe(
      'Drawn area near Kinsale · 2 bedrooms',
    );
  });
});

describe('M133: the map is counted by fixed codes, by day', () => {
  it('counts listed codes, ignores robots and anything else, and goes after 13 months', async () => {
    const staff = { userId: 'staff', email: 'staff@gaff.test' } as unknown as Parameters<
      typeof mapUseFor
    >[0];
    const before = await mapUseFor(staff);
    expect(await recordMapCount('opened', 'phone', BROWSER)).toBe('counted');
    expect(await recordMapCount('opened', 'phone', BROWSER)).toBe('counted');
    expect(await recordMapCount('failed', 'auth', BROWSER)).toBe('counted');
    // UX-SR-13: drawing is counted the same way, as a code and nothing about the area.
    expect(await recordMapCount('area_drawn', '', BROWSER)).toBe('counted');
    expect(await recordMapCount('area_reshaped', '', BROWSER)).toBe('counted');
    expect(await recordMapCount('area_removed', '', BROWSER)).toBe('counted');
    expect(await recordMapCount('opened', 'rathmines', BROWSER)).toBe('ignored');
    expect(await recordMapCount('opened', 'phone', 'Googlebot/2.1')).toBe('ignored');
    const after = await mapUseFor(staff);
    expect(after.opened.phone - before.opened.phone).toBe(2);
    expect(after.failed.auth - before.failed.auth).toBe(1);

    const old = new Date(Date.now() - 401 * 86_400_000);
    await withSystem((tx) =>
      tx
        .insert(mapDailyCounts)
        .values({ day: irishToday(old), event: 'shown', kind: 'larger', count: 3 }),
    );
    expect((await sweepMapCounts()).deleted).toBeGreaterThanOrEqual(1);
  });
});

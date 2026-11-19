import { describe, expect, it } from 'vitest';
import { withSystem } from '@/db/client';
import { mapDailyCounts } from '@/db/schema';
import { distanceMetres } from '@/domain/places/geo';
import { irishToday } from '@/lib/format';
import { setHomePoint } from '@/server/lettings/location';
import { addPhoto } from '@/server/lettings/photos';
import { mapCard, mapPins } from '@/server/search/map';
import { mapUseFor, recordMapCount, sweepMapCounts } from '@/server/search/map-counts';
import { findHomes } from '@/server/search/homes';
import { resolveSearch } from '@/server/search/where';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember } from './helpers';

/** BA-5: the search map's data (M57, M117, M125) and its counts (M133). */

const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const view = { minLat: 51.7, minLng: -8.7, maxLat: 51.75, maxLng: -8.45 };

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

describe('M133: the map is counted by fixed codes, by day', () => {
  it('counts listed codes, ignores robots and anything else, and goes after 13 months', async () => {
    const staff = { userId: 'staff', email: 'staff@gaff.test' } as unknown as Parameters<
      typeof mapUseFor
    >[0];
    const before = await mapUseFor(staff);
    expect(await recordMapCount('opened', 'phone', BROWSER)).toBe('counted');
    expect(await recordMapCount('opened', 'phone', BROWSER)).toBe('counted');
    expect(await recordMapCount('failed', 'auth', BROWSER)).toBe('counted');
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

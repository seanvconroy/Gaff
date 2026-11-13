import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg, withPublic } from '@/db/client';
import { developments, events, homes, lettings, publicListings } from '@/db/schema';
import { distanceMetres, IRELAND } from '@/domain/places/geo';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { readFilters } from '@/domain/search/filters';
import { searchArea } from '@/domain/search/places';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { addHomesLike, createDevelopment } from '@/server/developments/developments';
import { createLetting } from '@/server/lettings/create-letting';
import { saveHomeDetails } from '@/server/listings/editor';
import { describePin, pinFor, setHomePoint } from '@/server/listings/location';
import { publishListing } from '@/server/listings/publish';
import { mapPoints, searchListings } from '@/server/search/search';
import { aLetting, daysFromToday } from '../fixtures/lettings';
import type { Member } from './helpers';
import { aCheckedLandlord, aListableLetting, placePin } from './listing-helpers';

/**
 * M38, M125, M126: the letter's pin. These homes are in Rathgar, on a street the fixture's place
 * index holds (Highfield Road), and in Carlow and Longford, where no other test lists a home.
 */

const onHighfieldRoad = { lat: 53.3157, lng: -6.2672 };
const inRathgar = { addressLine1: '22 Highfield Rd', area: 'Rathgar, Dublin 6', eircode: '' };
const g = fixtureGazetteer();
const everywhere = { kind: 'everywhere' } as const;
const noFilters = readFilters(new URLSearchParams());

async function homeOf(member: Member, lettingId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ home: homes })
      .from(homes)
      .innerJoin(lettings, eq(lettings.homeId, homes.id))
      .where(eq(lettings.id, lettingId)),
  );
  return row!.home;
}

async function publicRow(slug: string) {
  const [row] = await withPublic((tx) =>
    tx.select().from(publicListings).where(eq(publicListings.slug, slug)),
  );
  return row!;
}

async function live(member: Member, lettingId: string): Promise<string> {
  const result = await publishListing(member, lettingId, { declare: true });
  if (result.outcome !== 'live') throw new Error(`Not live: ${JSON.stringify(result)}`);
  return result.slug;
}

describe('M38: the letter places the home’s pin', () => {
  it('starts the pin on the address’s street, from Gaff’s own place index', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    const pin = await pinFor(member, lettingId);
    expect(pin).toMatchObject({
      placed: false,
      from: 'street',
      streetName: 'Highfield Road',
      where: 'The pin is on Highfield Road, in Rathgar.',
      check: 'unknown',
      development: null,
    });
    // On the road itself, not at the area's centre.
    expect(distanceMetres(pin!.point, onHighfieldRoad)).toBeLessThan(400);
  });

  it('starts in the middle of the area when the index doesn’t hold the street', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(
      member,
      undefined,
      { ...inRathgar, addressLine1: '7 Beechfield Terrace' },
      { pin: false },
    );
    expect(await pinFor(member, lettingId)).toMatchObject({
      placed: false,
      from: 'area',
      streetName: null,
      where: 'The pin is in Rathgar.',
    });
  });

  it('saves the pin with an event that holds no coordinates', async () => {
    const member = await aCheckedLandlord();
    const { lettingId, homeId } = await aListableLetting(member, undefined, inRathgar, {
      pin: false,
    });
    const before = await homeOf(member, lettingId);
    expect(before.pointSource).toBe('area');

    const saved = await setHomePoint(member, lettingId, onHighfieldRoad);
    expect(saved).toMatchObject({
      ok: true,
      pin: { placed: true, from: 'pin', check: 'inside', point: onHighfieldRoad },
    });
    const home = await homeOf(member, lettingId);
    expect(home).toMatchObject({
      latitude: onHighfieldRoad.lat,
      longitude: onHighfieldRoad.lng,
      pointSource: 'letter',
    });
    expect(home.pointSetAt).toBeInstanceOf(Date);

    const [event] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'home.point_set')))
        .orderBy(desc(events.occurredAt)),
    );
    expect(event).toMatchObject({
      actorType: 'person',
      subjectType: 'home',
      subjectId: homeId,
      data: { homeId, check: 'inside', homes: 1 },
    });
    expect(JSON.stringify(event!.data)).not.toMatch(/53\.3|6\.26/);
  });

  it('describes where a point is without saving anything', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    expect(await describePin(member, lettingId, onHighfieldRoad)).toBe(
      'The pin is on Highfield Road, in Rathgar.',
    );
    expect(await describePin(member, lettingId, { lat: 48.85, lng: 2.35 })).toBeNull();
    expect((await homeOf(member, lettingId)).pointSource).toBe('area');
  });

  it('takes only a point in Ireland', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    for (const bad of [
      { lat: 48.85, lng: 2.35 },
      { lat: Number.NaN, lng: -6.2 },
      { lat: IRELAND.maxLat + 1, lng: -6.2 },
      { lat: '53.3', lng: '-6.2' },
      null,
    ]) {
      expect(await setHomePoint(member, lettingId, bad)).toEqual({
        ok: false,
        error: 'Place the pin on a home in Ireland.',
      });
    }
    expect((await homeOf(member, lettingId)).pointSource).toBe('area');
  });

  it('is only the home’s own organisation’s to place (row-level security)', async () => {
    const member = await aCheckedLandlord();
    const stranger = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    await expect(setHomePoint(stranger, lettingId, onHighfieldRoad)).rejects.toThrow(
      'We couldn’t find that listing.',
    );
    expect(await pinFor(stranger, lettingId)).toBeNull();
    expect((await homeOf(member, lettingId)).pointSource).toBe('area');
  });
});

describe('M38, M125: a listing goes live with a placed pin, and only then is on the map', () => {
  it('can’t be published until the pin is placed', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    expect(await publishListing(member, lettingId, { declare: true })).toEqual({
      outcome: 'problems',
      problems: [
        {
          section: 'location',
          message: 'Place the pin on the map, so renters see where the home is',
        },
      ],
    });
    await placePin(member, lettingId, onHighfieldRoad);
    expect((await publishListing(member, lettingId, { declare: true })).outcome).toBe('live');
  });

  it('shows renters an approximate point when the letter hides the exact address', async () => {
    const member = await aCheckedLandlord();
    const carlow = {
      addressLine1: '4 Tullow Street',
      area: 'Carlow town',
      county: 'Carlow',
      eircode: '',
    };
    const exact = { lat: 52.836512, lng: -6.932101 };
    const { lettingId } = await aListableLetting(member, undefined, carlow, { pin: false });
    await placePin(member, lettingId, exact);
    const slug = await live(member, lettingId);
    // The helper lists homes with only the street and area shown.
    const hidden = await publicRow(slug);
    expect(hidden.onMap).toBe(true);
    const moved = distanceMetres({ lat: hidden.latitude, lng: hidden.longitude }, exact);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(150);

    // With the full address shown, the pin is exactly where the letter put it.
    await saveHomeDetails(member, lettingId, {
      showExactAddress: 'yes',
      heating: 'gas',
      outdoorSpace: 'balcony',
    });
    expect(await publicRow(slug)).toMatchObject({ latitude: exact.lat, longitude: exact.lng });
  });

  it('moves a live home on the map as soon as its pin is moved', async () => {
    const member = await aCheckedLandlord();
    const longford = {
      addressLine1: '9 Main Street',
      area: 'Longford town',
      county: 'Longford',
      eircode: '',
    };
    const { lettingId } = await aListableLetting(member, undefined, longford);
    const slug = await live(member, lettingId);
    const first = await publicRow(slug);
    const there = { lat: first.latitude + 0.004, lng: first.longitude + 0.004 };
    await placePin(member, lettingId, there);
    const second = await publicRow(slug);
    expect(distanceMetres({ lat: second.latitude, lng: second.longitude }, there)).toBeLessThan(
      150,
    );
    const view = {
      minLat: there.lat - 0.002,
      maxLat: there.lat + 0.002,
      minLng: there.lng - 0.003,
      maxLng: there.lng + 0.003,
    };
    const points = await mapPoints(everywhere, noFilters, view);
    expect(points.map((p) => p.slug)).toContain(slug);
  });

  it('keeps a home without a placed pin in the list, and off the map', async () => {
    const member = await aCheckedLandlord();
    const carlow = {
      addressLine1: '18 Dublin Street',
      area: 'Carlow town',
      county: 'Carlow',
      eircode: '',
    };
    const { lettingId, homeId } = await aListableLetting(member, undefined, carlow);
    const slug = await live(member, lettingId);
    const area = searchArea('carlow', g)!;
    const whole = IRELAND;
    expect((await mapPoints(area, noFilters, whole)).map((p) => p.slug)).toContain(slug);

    // A home listed before the pin existed: its point is only its area's centre.
    await withOrg(member.organisationId, (tx) =>
      tx.update(homes).set({ pointSource: 'area', pointSetAt: null }).where(eq(homes.id, homeId)),
    );
    await saveHomeDetails(member, lettingId, {
      showExactAddress: 'no',
      heating: 'gas',
      outdoorSpace: 'balcony',
    });
    expect((await publicRow(slug)).onMap).toBe(false);
    expect((await mapPoints(area, noFilters, whole)).map((p) => p.slug)).not.toContain(slug);
    const listed = await searchListings(area, noFilters);
    expect(listed.results.map((r) => r.slug)).toContain(slug);
    // R28: the letter is asked to place it, where they see what needs them.
    expect((await dashboardFor(member)).today).toContainEqual({
      kind: 'pin',
      lettingId,
      address: '18 Dublin Street',
    });
    await placePin(member, lettingId);
    expect((await dashboardFor(member)).today.map((item) => item.kind)).not.toContain('pin');
    expect((await publicRow(slug)).onMap).toBe(true);
  });
});

describe('M126: a pin outside the address’s area is a question, never a refusal', () => {
  it('saves the pin, and says where it is and where the address says', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, undefined, inRathgar, { pin: false });
    // Ranelagh village, a kilometre and a half from Rathgar.
    const saved = await setHomePoint(member, lettingId, { lat: 53.3262, lng: -6.2563 });
    expect(saved).toMatchObject({
      ok: true,
      pin: { placed: true, check: 'outside', addressArea: 'Rathgar', pinPlace: 'Ranelagh' },
    });
    expect((await homeOf(member, lettingId)).pointSource).toBe('letter');
    // It still goes live: the letter knows where their home is.
    expect((await publishListing(member, lettingId, { declare: true })).outcome).toBe('live');
  });
});

describe('M33, M38: a development’s homes share its pin', () => {
  it('gives the pin to the development, its unpinned homes, and homes added later', async () => {
    const member = await aCheckedLandlord();
    const created = await createDevelopment(member, {
      name: 'Highfield Court',
      addressLine1: 'Highfield Road',
      area: 'Rathgar, Dublin 6',
      county: 'Dublin',
      amenities: 'lift',
    });
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    const first = await aListableLetting(
      member,
      undefined,
      { ...inRathgar, addressLine1: 'Apartment 1, Highfield Road' },
      { pin: false },
    );
    // The helper makes a home on its own: put it, and a neighbour, in the development.
    const second = await createLetting(
      member,
      aLetting({ ...inRathgar, addressLine1: 'Apartment 2, Highfield Road' }),
      { developmentId: created.id },
    );
    await withOrg(member.organisationId, (tx) =>
      tx.update(homes).set({ developmentId: created.id }).where(eq(homes.id, first.homeId)),
    );
    expect(await pinFor(member, first.lettingId)).toMatchObject({
      development: { name: 'Highfield Court', others: 1 },
    });

    const saved = await setHomePoint(member, first.lettingId, onHighfieldRoad);
    expect(saved.ok && saved.pin.development).toEqual({ name: 'Highfield Court', others: 0 });
    expect(await homeOf(member, second.lettingId)).toMatchObject({
      latitude: onHighfieldRoad.lat,
      longitude: onHighfieldRoad.lng,
      pointSource: 'letter',
    });
    const [development] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(developments).where(eq(developments.id, created.id)),
    );
    expect(development).toMatchObject({
      latitude: onHighfieldRoad.lat,
      longitude: onHighfieldRoad.lng,
      pointSource: 'letter',
    });

    // A home added later starts with the development's pin.
    const added = await addHomesLike(
      member,
      created.id,
      first.lettingId,
      `Apartment 3, 2, 1950, ${daysFromToday(40)}, 70`,
    );
    if (!added.ok) throw new Error(added.errors.join('; '));
    expect(await homeOf(member, added.added[0]!)).toMatchObject({
      latitude: onHighfieldRoad.lat,
      pointSource: 'letter',
    });

    // A home that had its own pin keeps it when a neighbour's is moved.
    const elsewhere = { lat: 53.3149, lng: -6.2727 };
    await setHomePoint(member, second.lettingId, elsewhere);
    expect(await homeOf(member, first.lettingId)).toMatchObject({
      latitude: onHighfieldRoad.lat,
    });
    expect(await homeOf(member, second.lettingId)).toMatchObject({ latitude: elsewhere.lat });
  });
});

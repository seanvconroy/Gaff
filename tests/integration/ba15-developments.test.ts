import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, lettingPhotos, lettings, viewingSessions } from '@/db/schema';
import { BURST_HOMES } from '@/domain/listings/checks';
import {
  NOT_FOR_OWN_HOMES,
  changeDevelopment,
  changeUnitType,
  createDevelopment,
  developmentView,
  makeHomesOfType,
  offerViewingForType,
  putTypeLive,
} from '@/server/developments/developments';
import { groupAlike } from '@/domain/developments/development';
import { publicDevelopmentPage } from '@/server/developments/public';
import { publicHomes } from '@/server/homes/public-homes';
import { closeLetting } from '@/server/lettings/close';
import { saveAnswers } from '@/server/lettings/drafts';
import { findHomes } from '@/server/search/homes';
import { mapCard, mapPins } from '@/server/search/map';
import { resolveSearch } from '@/server/search/where';
import { setHomePoint } from '@/server/lettings/location';
import { addPhoto, removePhoto } from '@/server/lettings/photos';
import { changeAskingRent } from '@/server/lettings/rent-check';
import { aViewingSession } from '../fixtures/lettings';
import { aPng } from '../fixtures/photos';
import { aColleague, aDevelopment, aLiveHomeOnItsOwn, readyToGoLive } from './development-helpers';
import { createTestMember, type Member } from './helpers';

/**
 * BA-15 (the live line's M32 to M35, M75): a development, its types, and many alike homes made
 * and put live in one go. Each home is an ordinary letting after that. Made-up homes only.
 */

async function homesOf(member: Member, typeId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(lettings)
      .where(eq(lettings.unitTypeId, typeId))
      .orderBy(asc(lettings.unitLabel)),
  );
}

async function photosOf(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(lettingPhotos)
      .where(eq(lettingPhotos.lettingId, lettingId))
      .orderBy(asc(lettingPhotos.position)),
  );
}

describe('M32: a development', () => {
  it('belongs to an agency or a landlord’s team, never to a private landlord’s own homes', async () => {
    const landlord = await createTestMember({ kind: 'private_landlord' });
    await expect(createDevelopment(landlord, { name: 'The Waterside' })).rejects.toThrow(
      NOT_FOR_OWN_HOMES,
    );
    const team = await createTestMember({ kind: 'landlord' });
    expect((await createDevelopment(team, { name: 'The Waterside' })).id).toBeTruthy();
  });

  it('is the organisation’s own: another organisation can’t see it', async () => {
    const agency = await createTestMember();
    const { developmentId } = await aDevelopment(agency, { homes: 0 });
    const other = await createTestMember();
    expect(await developmentView(other, developmentId)).toBeNull();
    expect((await developmentView(agency, developmentId))?.development.name).toBe('The Waterside');
  });
});

describe('M35: many homes of a type in one step', () => {
  it('makes each home a letting with its own number, floor and date, the rest from the type and the development', async () => {
    const agency = await createTestMember();
    const { typeId, lettingIds } = await aDevelopment(agency, { homes: 4 });
    expect(lettingIds).toHaveLength(4);
    const homes = await homesOf(agency, typeId);
    expect(homes.map((h) => h.addressLine1)).toEqual([
      'Apartment 11, The Waterside',
      'Apartment 12, The Waterside',
      'Apartment 13, The Waterside',
      'Apartment 14, The Waterside',
    ]);
    expect(homes[0]).toMatchObject({
      addressLine2: 'Waterside Road',
      area: 'Sandyford, Dublin 18',
      county: 'Dublin',
      unitFloor: 1,
      monthlyRentCents: 265_000,
      propertyType: 'apartment',
      bedrooms: 2,
      berRating: 'A2',
      parking: 'space',
      stage: 'setup',
      status: 'draft',
      leadUserId: agency.userId,
      pointSource: 'letter',
    });
    // Each was made with an event of its own, naming the type it came from.
    const made = await withOrg(agency.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'letting.created')),
    );
    expect(
      made.filter((e) => (e.data as { fromUnitTypeId?: string }).fromUnitTypeId === typeId),
    ).toHaveLength(4);
  });

  it('refuses a number the development already has, at its field, and makes none', async () => {
    const agency = await createTestMember();
    const { typeId } = await aDevelopment(agency, { homes: 2 });
    await changeUnitType(agency, typeId, 'rent', { count: 4 });
    await expect(
      makeHomesOfType(agency, typeId, [
        { unitLabel: 'Apartment 20', floor: 2, availableFrom: '2026-12-20' },
        { unitLabel: 'apartment 11', floor: 1, availableFrom: '2026-12-20' },
      ]),
    ).rejects.toThrow('Apartment 11, The Waterside is already a home here.');
    expect(await homesOf(agency, typeId)).toHaveLength(2);
  });
});

describe('BA-15: the shared-value rule', () => {
  it('a change on the development or the type reaches the homes still sharing it, never one changed by hand', async () => {
    const agency = await createTestMember();
    const { developmentId, typeId } = await aDevelopment(agency, { homes: 3 });
    const [first, second] = await homesOf(agency, typeId);

    // The lister changes the second home's rent and description by hand.
    await changeAskingRent(agency, second!.id, 255_000);
    await saveAnswers(agency, second!.id, {
      step: 'description',
      patch: { description: 'The corner home, with windows on two sides and a view of the hills.' },
      advance: false,
    });

    const changed = await changeDevelopment(agency, developmentId, 'facts', {
      parking: 'none',
      description: 'A new scheme beside the Luas stop, with bike storage and a roof terrace.',
    });
    expect(changed.homes).toBe(3);
    await changeUnitType(agency, typeId, 'rent', { rentCents: 270_000 });

    const [a, b, c] = await homesOf(agency, typeId);
    expect(a).toMatchObject({
      parking: 'none',
      monthlyRentCents: 270_000,
      description: 'A new scheme beside the Luas stop, with bike storage and a roof terrace.',
    });
    expect(b).toMatchObject({
      parking: 'none',
      monthlyRentCents: 255_000,
      description: 'The corner home, with windows on two sides and a view of the hills.',
    });
    expect(b!.ownValues).toEqual(['description', 'rent']);
    expect(c!.monthlyRentCents).toBe(270_000);
    expect(first!.id).toBe(a!.id);
  });

  it('a renamed development renames its homes; a pin moved by hand stays', async () => {
    const agency = await createTestMember();
    const { developmentId, typeId } = await aDevelopment(agency, { homes: 2 });
    const [first] = await homesOf(agency, typeId);
    await setHomePoint(agency, first!.id, { lat: 53.2771, lng: -6.2201 });
    await changeDevelopment(agency, developmentId, 'name', { name: 'Waterside Quarter' });
    await setHomePoint(agency, developmentId, { lat: 53.2755, lng: -6.2175 });
    const [a, b] = await homesOf(agency, typeId);
    expect(a!.addressLine1).toBe('Apartment 11, Waterside Quarter');
    expect([a!.latitude, a!.longitude]).toEqual([53.2771, -6.2201]);
    expect([b!.latitude, b!.longitude]).toEqual([53.2755, -6.2175]);
  });

  it('M33: the type’s and the development’s photos show on its homes, and follow them until a home’s photos change by hand', async () => {
    const agency = await createTestMember();
    const { developmentId, typeId } = await aDevelopment(agency, { homes: 2 });
    const [first, second] = await homesOf(agency, typeId);
    // aDevelopment gave the type one photo and the development one.
    expect((await photosOf(agency, first!.id)).map((p) => p.sharedFromId !== null)).toEqual([
      true,
      true,
    ]);

    // A home's photos changed by hand are its own from then on.
    const own = await addPhoto(agency, second!.id, aPng([200, 30, 90]));
    expect(own.ok).toBe(true);

    const added = await addPhoto(agency, typeId, aPng([10, 140, 70]));
    if (!added.ok) throw new Error(added.problem);
    expect(await photosOf(agency, first!.id)).toHaveLength(3);
    expect(await photosOf(agency, second!.id)).toHaveLength(3);
    expect((await photosOf(agency, second!.id)).every((p) => p.sharedFromId === null)).toBe(true);

    // Removing a shared photo takes it off the homes sharing it, and the picture stays for the
    // home that kept it as its own.
    await removePhoto(agency, typeId, added.photo.id);
    await removePhoto(agency, developmentId, (await photosOf(agency, first!.id))[1]!.sharedFromId!);
    expect(await photosOf(agency, first!.id)).toHaveLength(1);
    expect(await photosOf(agency, second!.id)).toHaveLength(3);
  });
});

describe('M35: putting a type’s homes live together, through the same go-live step and checks', () => {
  it('each home goes live on the person’s own decision, and is public', async () => {
    const agency = await createTestMember();
    const { typeId, lettingIds } = await aDevelopment(agency, { homes: 4 });
    await readyToGoLive(agency, typeId);
    expect(await putTypeLive(agency, typeId)).toEqual({ live: 4, held: 0, notReady: 0 });
    const decisions = await withOrg(agency.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'letting.went_live')),
    );
    expect(new Set(decisions.map((e) => e.lettingId))).toEqual(new Set(lettingIds));
    expect((await homesOf(agency, typeId)).every((h) => h.status === 'live' && !h.hiddenAt)).toBe(
      true,
    );
  });

  it('a scheme from a new account counts once towards a burst: honest, not exempt', async () => {
    const agency = await createTestMember();
    // Six alike homes of one scheme: weighed as one home, so nothing is held.
    const { typeId } = await aDevelopment(agency, { homes: BURST_HOMES });
    await readyToGoLive(agency, typeId);
    expect((await putTypeLive(agency, typeId)).live).toBe(BURST_HOMES);
    expect(
      await withOrg(agency.organisationId, (tx) =>
        tx.select({ id: lettings.id }).from(lettings).where(isNotNull(lettings.hiddenAt)),
      ),
    ).toEqual([]);

    // Four more homes on their own make five schemes; the next scheme is the sixth: a burst.
    for (let i = 0; i < BURST_HOMES - 2; i++) await aLiveHomeOnItsOwn(agency, i);
    const second = await aDevelopment(agency, { homes: 2, name: 'Harbour View' });
    await readyToGoLive(agency, second.typeId);
    const outcome = await putTypeLive(agency, second.typeId);
    expect(outcome.live).toBe(2);
    const held = await withOrg(agency.organisationId, (tx) =>
      tx
        .select({ id: lettings.id, hiddenAfter: lettings.hiddenAfter })
        .from(lettings)
        .where(and(eq(lettings.unitTypeId, second.typeId), isNotNull(lettings.hiddenAt))),
    );
    expect(held.map((h) => h.hiddenAfter)).toEqual(['check', 'check']);
  });

  it('a home whose rent check isn’t settled stays in set-up; the rest go live', async () => {
    const agency = await createTestMember();
    const { typeId, lettingIds } = await aDevelopment(agency, { homes: 2 });
    await readyToGoLive(agency, typeId, { skipRentCheckFor: lettingIds[1] });
    expect(await putTypeLive(agency, typeId)).toEqual({ live: 1, held: 0, notReady: 1 });
  });
});

describe('BA-15: viewings for a development', () => {
  it('one time offered across a type gives each home the viewing, so people stay with their home', async () => {
    const agency = await createTestMember();
    const { typeId, lettingIds } = await aDevelopment(agency, { homes: 3 });
    expect(await offerViewingForType(agency, typeId, aViewingSession())).toEqual({ homes: 3 });
    const sessions = await withOrg(agency.organisationId, (tx) =>
      tx.select().from(viewingSessions),
    );
    expect(new Set(sessions.map((s) => s.lettingId))).toEqual(new Set(lettingIds));
    expect(new Set(sessions.map((s) => s.startsAt.toISOString())).size).toBe(1);
  });
});

describe('UX-AG-8: a change to a development reaches its homes, so it asks for "Help with this letting"', () => {
  it('refuses an agent on homes an admin leads, for each change, before anything changes', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const { developmentId, typeId } = await aDevelopment(admin, { homes: 2 });
    const REFUSED =
      'Someone else leads this letting. Choose “Help with this letting” to work on it.';
    const changes: Array<[string, () => Promise<unknown>]> = [
      [
        'change the facts',
        () => changeDevelopment(agent, developmentId, 'facts', { parking: 'none' }),
      ],
      ['rename it', () => changeDevelopment(agent, developmentId, 'name', { name: 'Other' })],
      ['move its pin', () => setHomePoint(agent, developmentId, { lat: 53.27, lng: -6.22 })],
      ['change the type', () => changeUnitType(agent, typeId, 'rent', { rentCents: 199_000 })],
      ['add a shared photo', () => addPhoto(agent, developmentId, aPng([1, 2, 3]))],
      ['add a type’s photo', () => addPhoto(agent, typeId, aPng([1, 2, 3]))],
      ['put them live', () => putTypeLive(agent, typeId)],
      ['offer a viewing', () => offerViewingForType(agent, typeId, aViewingSession())],
    ];
    for (const [what, change] of changes) {
      await expect(change(), what).rejects.toThrow(REFUSED);
    }
    const homes = await homesOf(admin, typeId);
    expect(homes.every((h) => h.parking === 'space' && h.monthlyRentCents === 265_000)).toBe(true);
  });
});

describe('M75: the public side', () => {
  it('a development’s page lists its types with homes free, and each free home’s own page', async () => {
    const agency = await createTestMember();
    const { typeId, lettingIds } = await aDevelopment(agency, { homes: 4 });
    await readyToGoLive(agency, typeId);
    await putTypeLive(agency, typeId);
    const [home] = await publicHomes({ ref: (await homesOf(agency, typeId))[0]!.publicRef });
    expect(home!.unit).toMatchObject({
      developmentName: 'The Waterside',
      typeName: 'Type B',
      unitLabel: 'Apartment 11',
      floor: 1,
      floorAreaSqm: 68,
    });
    const ref = home!.unit!.developmentRef;
    const page = await publicDevelopmentPage(ref);
    expect(page).toMatchObject({ name: 'The Waterside', free: 4, ber: 'A2', parking: 'space' });
    expect(page!.types.map((t) => [t.name, t.free, t.fromRentCents])).toEqual([
      ['Type B', 4, 265_000],
    ]);
    expect(page!.photos).toHaveLength(1);

    // A let home drops out, as any home does.
    await closeLetting(agency, lettingIds[0]!, 'let');
    expect((await publicDevelopmentPage(ref))!.free).toBe(3);
    expect(await publicDevelopmentPage('0123456789ab')).toBeNull();
  });

  it('search shows a development’s alike homes as one card per type, and one pin', async () => {
    const agency = await createTestMember();
    const { typeId } = await aDevelopment(agency, { homes: 4, name: 'Alike Gardens' });
    await readyToGoLive(agency, typeId);
    await putTypeLive(agency, typeId);
    const resolved = await resolveSearch({});
    const { fits } = await findHomes(resolved.filters, resolved.g);
    const ours = fits.filter((home) => home.alike?.developmentName === 'Alike Gardens');
    expect(ours).toHaveLength(4);
    const cards = groupAlike(ours);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'alike' });

    const map = await mapPins({}, { minLat: 51.3, minLng: -10.7, maxLat: 55.5, maxLng: -5.3 });
    const pins = map.points.filter((pin) => ours.some((home) => home.id === pin.id));
    expect(pins).toHaveLength(1);
    expect(pins[0]!.title).toMatch(/^4 homes like this/);
    const card = await mapCard(pins[0]!.id);
    expect(card).toMatchObject({
      title: 'From €2,650 a month',
      line: '4 homes like this · Alike Gardens',
    });
    expect(card!.href).toMatch(/^\/developments\/[0-9a-f]{12}#type-[0-9a-f]{12}$/);
  });
});

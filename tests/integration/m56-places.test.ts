import { eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withSystem } from '@/db/client';
import { placeMisses, places } from '@/db/schema';
import type { County, Place } from '@/domain/places/gazetteer';
import { addPhoto } from '@/server/lettings/photos';
import {
  forgetCachedPlaces,
  loadGazetteer,
  missWorthCounting,
  recordMiss,
  rowFromPlace,
  sweepPlaceMisses,
} from '@/server/places/places';
import { saveSearchFor, savedSearchesOf } from '@/server/saved/searches';
import { findHomes } from '@/server/search/homes';
import {
  forgetHomeAddresses,
  popularWhere,
  resolveSearch,
  suggestWhere,
} from '@/server/search/where';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember, createTestPerson } from './helpers';

/**
 * M56, M113, M121, M124 (ADR-0017): Gaff's own place index in Postgres, searched with pg_trgm.
 * These run against the fixture (tests/fixtures/places.ts), which the set-up loads.
 */
type Found = Awaited<ReturnType<typeof suggestWhere>>;
const slugsOf = (s: Found) => s.groups.flatMap((g) => g.items.map((i) => i.slug));

describe('M56: suggestions from the place index in Postgres', () => {
  it('M56: finds towns, streets and landmarks, with the best group first', async () => {
    const kins = await suggestWhere('Kins');
    expect(kins.groups.map((g) => g.kind)).toEqual(['places', 'streets']);
    expect(slugsOf(kins).slice(0, 2)).toEqual(['kinsale', 'kinsealy']);
    expect(slugsOf(kins)).toContain('kinsale-road-ballyphehane-cork');
    expect(kins.groups[0]!.items[0]).toMatchObject({
      name: 'Kinsale',
      label: 'Kinsale, Co. Cork',
      description: 'Town in County Cork',
      kind: 'town',
    });
    const highfield = await suggestWhere('Highfield road');
    expect(slugsOf(highfield)).toEqual([
      'highfield-road-rathgar-dublin-6',
      'highfield-road-ballintemple-cork',
    ]);
    expect(highfield.groups[0]!.items[0]).toMatchObject({
      label: 'Near Highfield Road, Rathgar',
      description: 'Rathgar, Dublin 6',
    });
  });

  it('M56: forgives fadas, Irish names, aliases and typos', async () => {
    expect(slugsOf(await suggestWhere('dun laoghaire'))[0]).toBe('dun-laoghaire');
    expect(slugsOf(await suggestWhere('Cionn tSáile'))[0]).toBe('kinsale');
    expect(slugsOf(await suggestWhere('UCD'))[0]).toBe(
      'university-college-dublin-belfield-dublin-4',
    );
    const typo = await suggestWhere('Kinsael');
    expect(typo.didYouMean).toBe(true);
    expect(slugsOf(typo)[0]).toBe('kinsale');
  });

  it('M56: an Eircode routing key, and a Dublin one as its district', async () => {
    expect((await suggestWhere('P17')).groups[0]!.items[0]).toMatchObject({
      slug: 'p17',
      label: 'P17, Kinsale',
      kind: 'routing_key',
    });
    expect((await suggestWhere('D6W')).groups[0]!.items[0]).toMatchObject({
      slug: 'dublin-6w',
      label: 'Dublin 6W',
      description: 'Dublin postal district',
    });
  });

  it('M56: finds a street by every word typed, though thousands share its commonest word', async () => {
    // As in the real index: many more "... Street"s than suggestions, sorting before this one.
    const street = (slug: string, name: string, context: string): Place => ({
      slug,
      name,
      kind: 'street',
      county: 'Galway',
      context,
      centre: { lat: 53.27, lng: -9.05 },
      radiusMetres: 0,
      line: [
        [
          { lat: 53.27, lng: -9.05 },
          { lat: 53.271, lng: -9.051 },
        ],
      ],
    });
    const streets = [
      ...Array.from({ length: 65 }, (_, i) =>
        street(`zz-test-abbey-street-${i}`, 'Abbey Street', `Testtown ${i}, County Galway`),
      ),
      street('zz-test-shop-street-galway', 'Shop Street', 'Latin Quarter, County Galway'),
    ];
    await withSystem((tx) =>
      tx.insert(places).values(streets.map((p) => rowFromPlace(p, 1, 'test'))),
    );
    try {
      expect(slugsOf(await suggestWhere('Shop Street Galway'))[0]).toBe(
        'zz-test-shop-street-galway',
      );
      expect(slugsOf(await suggestWhere('shop st'))).toContain('zz-test-shop-street-galway');
      // Near spellings ("... Street ..., County Galway") never crowd out the exact ones.
      expect(slugsOf(await suggestWhere('Shop Street County Galway'))).toEqual([
        'zz-test-shop-street-galway',
      ]);
    } finally {
      await withSystem((tx) => tx.delete(places).where(like(places.slug, 'zz-test-%')));
    }
  });

  it('M56: puts the biggest county first among more streets of one name than it keeps', async () => {
    const lane = (slug: string, county: County, context: string): Place => ({
      slug,
      name: 'Testbrook Lane',
      kind: 'street',
      county,
      context,
      centre: { lat: 53.3, lng: -6.27 },
      radiusMetres: 0,
    });
    const lanes = [
      ...Array.from({ length: 65 }, (_, i) =>
        lane(`zz-test-testbrook-lane-${i}`, 'Leitrim', `Testvillage ${i}, County Leitrim`),
      ),
      lane('zz-test-testbrook-lane-dublin', 'Dublin', 'Rathgar, Dublin 6'),
    ];
    await withSystem((tx) =>
      tx.insert(places).values(lanes.map((p) => rowFromPlace(p, 1, 'test'))),
    );
    try {
      expect(slugsOf(await suggestWhere('Testbrook Lane'))[0]).toBe(
        'zz-test-testbrook-lane-dublin',
      );
    } finally {
      await withSystem((tx) => tx.delete(places).where(like(places.slug, 'zz-test-%')));
    }
  });

  it('M113: loads streets for a search by slug, beside the areas', async () => {
    forgetCachedPlaces();
    const g = await loadGazetteer(['highfield-road-rathgar-dublin-6']);
    expect(g.bySlug('highfield-road-rathgar-dublin-6')?.kind).toBe('street');
    expect(g.places.some((p) => p.kind === 'street')).toBe(false);
  });
});

describe('UX-SR-12, M56: a search’s place, looked up', () => {
  it('UX-SR-12: a place the index doesn’t know is left out, and the rest still works', async () => {
    const { filters, where, placeName } = await resolveSearch({ where: 'narnia', beds: 2 });
    expect(filters).toEqual({ beds: 2 });
    expect(where).toBeNull();
    expect(placeName).toBe('');
  });

  it('M56: an old ID from the first list opens its place, named as the index names it', async () => {
    const found = await resolveSearch({ where: 'dingle' });
    expect(found.filters).toEqual({ where: 'dingle-daingean-ui-chuis' });
    expect(found.placeName).toBe('Dingle / Daingean Uí Chúis, Co. Kerry');
    expect((await resolveSearch({ where: 'ranelagh' })).placeName).toBe('Ranelagh, Dublin 6');
    expect((await resolveSearch({ where: 'highfield-road-rathgar-dublin-6' })).where?.kind).toBe(
      'near',
    );
  });

  it('UX-MT-13: a saved search keeps only a place the index knows', async () => {
    const person = await createTestPerson();
    const saved = await saveSearchFor(person.id, { where: 'nowhere-at-all', beds: 2 });
    expect(saved).toEqual({ ok: true, kind: 'saved' });
    const { searches } = await savedSearchesOf(person.id);
    expect(searches.map((s) => s.filters)).toEqual([{ beds: 2 }]);
  });
});

describe('M121: homes counted beside places', () => {
  it('M121: counts a live home beside its town, and offers it before anything is typed', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member, {
      addressLine1: '5 Main Street',
      area: 'Clifden',
      county: 'Galway',
      eircode: '',
    });
    await addPhoto(member, lettingId, aPng([36, 99, 168]));
    forgetHomeAddresses();
    const clifden = (await suggestWhere('Clifden')).groups[0]!.items[0]!;
    expect(clifden.slug).toBe('clifden');
    expect(clifden.description).toMatch(/^Town in County Galway · \d+ homes?$/);
    const popular = await popularWhere(50);
    expect(popular.groups[0]?.kind).toBe('popular');
    expect(popular.groups[0]!.items.map((i) => i.slug)).toContain('clifden');
    // Search finds it by the same place.
    const { filters, g } = await resolveSearch({ where: 'clifden' });
    const { fits } = await findHomes(filters, g);
    expect(fits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('M124: counting places nobody found', () => {
  it('M124: keeps no digits, nothing long, and counts by day', async () => {
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

  it('M124: what found nothing is counted when the place search is asked', async () => {
    await suggestWhere('Ballyquorkle');
    const rows = await withSystem((tx) =>
      tx.select().from(placeMisses).where(eq(placeMisses.text, 'ballyquorkle')),
    );
    expect(rows).toHaveLength(1);
  });

  it('M124, rule 9: the nightly job deletes them after 30 days', async () => {
    const now = new Date('2026-12-20T12:00:00Z');
    await recordMiss('Ballyold', '2026-11-19');
    await recordMiss('Ballynew', '2026-11-21');
    const swept = await sweepPlaceMisses(now);
    expect(swept.deleted).toBeGreaterThanOrEqual(1);
    const left = await withSystem((tx) => tx.select({ text: placeMisses.text }).from(placeMisses));
    expect(left.map((r) => r.text)).not.toContain('ballyold');
    expect(left.map((r) => r.text)).toContain('ballynew');
  });
});

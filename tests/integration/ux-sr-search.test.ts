import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { withOrg, withSystem } from '@/db/client';
import { funnelEvents, lettings } from '@/db/schema';
import { addPhoto } from '@/server/lettings/photos';
import { liveHomesOnGaff, findHomes } from '@/server/search/homes';
import { countSearch, searchFromWords } from '@/server/search/search';
import { resolveSearch, suggestWhere } from '@/server/search/where';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember, type Member } from './helpers';

const PLACE = 'Dalkey';

/**
 * A live home as search knows it: with a photo, which a home needs to be on Gaff (UX-LT-22),
 * and by its public reference, never its ID (UX-LS-1).
 */
async function aHomeOnGaff(member: Member, facts: Record<string, string>) {
  const { lettingId } = await aLiveLetting(member, facts);
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

/** Every text in every table, as one string: to show a sentence was kept nowhere. */
async function everythingStored(): Promise<string> {
  return withSystem(async (tx) => {
    const { rows } = await tx.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const parts: string[] = [];
    for (const { table_name } of rows) {
      const found = await tx.execute<{ row: string }>(
        sql`select t::text as row from ${sql.identifier(table_name)} t`,
      );
      parts.push(...found.rows.map((r) => r.row));
    }
    return parts.join('\n');
  });
}

const funnelRows = () => withSystem((tx) => tx.select().from(funnelEvents));

describe('UX-SR-2, UX-SR-6: the homes search reads', () => {
  it('UX-SR-2: every live home on Gaff, and no draft, no home taken off Gaff and nothing about a person', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, {
      addressLine1: '3 Castle Street',
      area: `${PLACE}, Co. Dublin`,
      eircode: '',
    });
    const { lettingId: offGaffId, ref: offGaff } = await aHomeOnGaff(member, {
      addressLine1: '5 Castle Street',
      area: `${PLACE}, Co. Dublin`,
      eircode: '',
    });
    await withSystem((tx) =>
      tx.update(lettings).set({ onGaff: false }).where(eq(lettings.id, offGaffId)),
    );
    // UX-LT-22: a live home with no photo has no page, so it isn't in search either.
    const noPhoto = await aLiveLetting(member, {
      addressLine1: '7 Castle Street',
      area: `${PLACE}, Co. Dublin`,
      eircode: '',
    });

    const homes = await liveHomesOnGaff();
    const ids = homes.map((home) => home.id);
    expect(ids).toContain(ref);
    expect(ids).not.toContain(offGaff);
    // UX-LS-1: a home is known by its public reference; no internal ID leaves the server.
    expect(JSON.stringify(homes)).not.toContain(lettingId);
    expect(homes.map((home) => home.addressLine1)).not.toContain('7 Castle Street');
    expect(JSON.stringify(homes)).not.toContain(noPhoto.lettingId);
    const home = homes.find((h) => h.id === ref)!;
    expect(Object.keys(home).sort()).toEqual(
      [
        'addressLine1',
        'addressLine2',
        // BA-15: a development's alike homes, by their type's public reference: one card.
        'alike',
        'alikeKey',
        'area',
        'availableFrom',
        'bedrooms',
        'county',
        'cover',
        'criteria',
        'eircode',
        'furnished',
        'id',
        'liveAt',
        'parking',
        // M125: where renters see it on the map, or null without a pin.
        'point',
        'propertyType',
        'rentCents',
      ].sort(),
    );
    expect(JSON.stringify(home)).not.toContain('mary.byrne@example.ie');

    const { filters, g } = await resolveSearch({ where: 'dalkey', people: 4 });
    const { fits, close } = await findHomes(filters, g);
    expect(fits.map((h) => h.id)).not.toContain(ref);
    expect(close.find((c) => c.home.id === ref)?.miss).toEqual({
      point: 'people',
      maxOccupants: 3,
      asked: 4,
    });
  });
});

describe('UX-SR-11, UX-MT-12: a search is not kept', () => {
  it('UX-MT-12: the words become an address of allowed filters, and are stored and logged nowhere', async () => {
    const said = vi.spyOn(console, 'log');
    const warned = vi.spyOn(console, 'warn');
    const failed = vi.spyOn(console, 'error');
    const words = '2-bed in Dalkey for me and my partner, I’m a Zorblax nurse on HAP, no pets';
    const outcome = await searchFromWords({ words }, new Date('2026-11-17T12:00:00Z'));
    expect(outcome).toEqual({
      href: '/?where=dalkey&beds=2&people=2&pets=no',
      understood: true,
    });
    await countSearch({ fits: 0, close: 0 });
    const stored = await everythingStored();
    expect(stored).not.toMatch(/zorblax/i);
    expect(stored).not.toMatch(/nurse/i);
    for (const spy of [said, warned, failed]) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/zorblax|nurse/i);
    }
  });

  it('UX-ME-4: a search is counted under an ID of its own, with codes only', async () => {
    const before = await funnelRows();
    await countSearch({ fits: 2, close: 1 });
    const after = await funnelRows();
    // Other files record funnel steps at the same time: only searches are this test's.
    const added = after.filter(
      (row) => row.step.startsWith('search.') && !before.some((old) => old.id === row.id),
    );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ step: 'search.search_made', variant: 'fit', data: {} });
  });

  it('UX-SR-3 states: words with nothing understood leave only a flag in the address', async () => {
    expect(await searchFromWords({ words: 'somewhere lovely please' })).toEqual({
      href: '/?unclear=1',
      understood: false,
    });
    expect((await searchFromWords({ words: 'somewhere lovely please', rent: '1' })).href).toBe(
      '/?unclear=1&rent=1',
    );
  });

  it('M56: words that were nearly a place offer it, by its slug alone', async () => {
    expect(await searchFromWords({ words: 'Kinsael' })).toEqual({
      href: '/?unclear=1&maybe=kinsale',
      understood: false,
    });
  });
});

describe('UX-SR-14: a road, a landmark or a townland typed in the search box', () => {
  it('UX-SR-14: a road’s name alone is the road, from the whole place index', async () => {
    expect(await searchFromWords({ words: 'Highfield Road' })).toEqual({
      href: '/?where=highfield-road-rathgar-dublin-6',
      understood: true,
    });
    // Short forms, and the town it is in.
    expect((await searchFromWords({ words: 'highfield rd' })).href).toBe(
      '/?where=highfield-road-rathgar-dublin-6',
    );
    expect((await searchFromWords({ words: 'Highfield Road, Cork' })).href).toBe(
      '/?where=highfield-road-ballintemple-cork',
    );
    expect((await searchFromWords({ words: 'Highfield Road, Rathgar' })).href).toBe(
      '/?where=highfield-road-rathgar-dublin-6',
    );
    // An area's own name is still the area.
    expect((await searchFromWords({ words: 'Dalkey' })).href).toBe('/?where=dalkey');
  });

  it('UX-SR-14: a road in a sentence is its place, with everything else the sentence asks', async () => {
    const outcome = await searchFromWords({
      words: '2 bed near Highfield Road under €2,000, no pets',
    });
    expect(outcome).toEqual({
      href: '/?where=highfield-road-rathgar-dublin-6&beds=2&max=2000&pets=no',
      understood: true,
    });
    // With an area said too, only a road found in that area counts.
    expect((await searchFromWords({ words: 'house on Highfield Road in Cork' })).href).toBe(
      '/?where=highfield-road-ballintemple-cork&type=house',
    );
    expect((await searchFromWords({ words: 'house on Highfield Road in Dalkey' })).href).toBe(
      '/?where=dalkey&type=house',
    );
  });

  it('UX-SR-14: a place picked from the suggestions is the place, whatever the words say', async () => {
    const outcome = await searchFromWords({
      words: '2 bed near highf',
      place: 'highfield-road-ballintemple-cork',
    });
    expect(outcome.href).toBe('/?where=highfield-road-ballintemple-cork&beds=2');
    // A slug the index doesn't know is no place at all: the words are read as they are.
    expect((await searchFromWords({ words: '2 bed', place: 'nowhere-at-all' })).href).toBe(
      '/?beds=2',
    );
  });

  it('UX-SR-11, rule 3: what a renter says about themselves never names a place', async () => {
    const outcome = await searchFromWords({
      words: 'I’m a nurse on HAP with a baby, looking for a 2 bed',
    });
    expect(outcome.href).toBe('/?beds=2');
  });
});

describe('UX-SR-11, UX-SR-14: what the search bar looks up is never kept', () => {
  it('UX-SR-14: a word that finds no place is counted from "Where", and never from the search bar', async () => {
    const misses = () =>
      withSystem(async (tx) => {
        const found = await tx.execute<{ text: string }>(sql`select text from place_misses`);
        return found.rows.map((row) => row.text);
      });
    await suggestWhere('zorblaxtown', { countMisses: false });
    expect(await misses()).not.toContain('zorblaxtown');
    await suggestWhere('quillonford');
    expect(await misses()).toContain('quillonford');
  });
});

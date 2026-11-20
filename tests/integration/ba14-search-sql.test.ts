import { eq, inArray, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, type Tx } from '@/db/client';
import { lettingPhotos, lettings } from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import { fixtureGazetteer } from '@/domain/places/fixture';
import type { Place } from '@/domain/places/gazetteer';
import {
  type SearchFilters,
  searchFiltersSchema,
  searchTypes,
  stays,
  wholeSearch,
  WITHIN_KM,
} from '@/domain/search/filters';
import { type SearchResults, searchHomes } from '@/domain/search/match';
import { addressWordsOf, placeHasHome, searchPlace } from '@/domain/search/places';
import { type HomeOnGaff, liveHomesOnGaffIn } from '@/server/search/homes';
import { countHomesInTx, searchIn } from '@/server/search/query';
import { createTestMember, type Member } from './helpers';

/**
 * M58, M59, M61, M116, M122 (BA-14): search answered by the database returns exactly what the
 * in-memory rule (`searchHomes`, src/domain/search/match.ts) returns, for generated homes and
 * searches: the same homes, in the same order, with the same one-miss "Close to what you asked"
 * group, place and "near" matched in SQL against the place index and the pins. The in-memory
 * rule stays as the spec.
 *
 * Every home here is made inside one transaction that is rolled back, so no other test sees
 * them; both answers are read inside it.
 */

/** A small, seeded random source: the same homes and searches every run. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}
type Random = ReturnType<typeof random>;

const g = fixtureGazetteer();
const TODAY = new Date();
const day = (offset: number) =>
  new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

class Rollback extends Error {}

/** Runs `fn` as the system in a transaction that is always rolled back. */
async function inRolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    // One snapshot for the whole comparison: other tests add homes meanwhile.
    await db().transaction(
      async (tx) => {
        await tx.execute(sql`select set_config('app.rls_bypass', 'on', true)`);
        result = await fn(tx);
        throw new Rollback();
      },
      { isolationLevel: 'repeatable read' },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result as T;
}

/** The ways an address writes a place's name: as it is, in capitals, short forms, no fadas. */
function written(name: string, r: Random): string {
  const first = name.split(' / ')[0]!;
  return r.pick([
    first,
    first.toUpperCase(),
    first
      .replace(/\bRoad\b/, 'Rd')
      .replace(/\bStreet\b/, 'St.')
      .replace(/\bAvenue\b/, 'Ave'),
    first.normalize('NFD').replace(/[̀-ͯ]/g, ''),
    first.replace(/\bSt\b/, 'Saint'),
    first.replace(/'/g, '’'),
  ]);
}

const streets = ['Main Street', 'Church Rd', 'St. Patrick’s Tce', 'Dún Laoghaire Ave', 'The Mall'];
const counties = ['Dublin', 'Cork', 'Galway', 'Wicklow', 'Kerry', 'Waterford'];
const keys = ['D06', 'D04', 'D14', 'D02', 'T12', 'P17', 'A94', 'H91', 'X91'];

interface Made {
  row: typeof lettings.$inferInsert;
  words: string;
}

/** One made-up home, somewhere near a place from the fixture, or somewhere else. */
function aHome(r: Random, place: Place, members: { agency: Member; private: Member }): Made {
  const lister = r.chance(0.3) ? members.private : members.agency;
  const said = written(place.name, r);
  const street = r.pick(streets);
  const n = r.int(1, 120);
  const countyWords = r.pick([`Co. ${place.county}`, `County ${place.county}`, place.county]);
  let addressLine1: string;
  let area: string;
  let addressLine2: string | null = null;
  if (place.kind === 'street') {
    addressLine1 = `${n} ${said}`;
    area = place.context ? place.context.split(',')[0]!.replace(/^Street in /, '') : said;
  } else if (place.kind === 'landmark') {
    addressLine1 = `${n} ${street}`;
    area = (place.context ?? place.name).split(',')[0]!.replace(/^\w+ (in|near) /, '');
  } else {
    addressLine1 = `${n} ${street}`;
    area = r.chance(0.8) ? `${said}, ${countyWords}` : said;
  }
  if (r.chance(0.2)) addressLine2 = r.pick(['Upper', 'Apt 4', `Near ${said}`, 'Lr Rd']);
  const county = r.chance(0.85) ? place.county : r.pick(counties);
  const key = r.chance(0.5) ? (place.routingKey ?? r.pick(keys)) : r.pick(keys);
  const eircode = r.chance(0.2)
    ? null
    : r.pick([`${key} X1Y2`, `${key.toLowerCase()}x1y2`, `${key}  W2F4`]);
  const pinned = r.chance(0.55);
  const lat = place.centre.lat + (r.next() - 0.5) * 0.08;
  const lng = place.centre.lng + (r.next() - 0.5) * 0.12;
  const criteria: Criteria | null = r.chance(0.2)
    ? null
    : {
        noPets: r.chance(0.4),
        ...(r.chance(0.3) ? { moveInBy: day(r.int(5, 90)) } : {}),
        ...(r.chance(0.4) ? { minStayMonths: r.pick([6, 12, 24] as const) } : {}),
        ...(r.chance(0.4) ? { maxOccupants: r.int(1, 6) } : {}),
      };
  const row: typeof lettings.$inferInsert = {
    organisationId: lister.organisationId,
    createdBy: lister.userId,
    leadUserId: lister.userId,
    addressLine1,
    addressLine2,
    area,
    county,
    eircode,
    ...(pinned
      ? {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          pointSource: 'letter',
        }
      : {}),
    monthlyRentCents: r.int(8, 35) * 10_000 + r.pick([0, 5_000]),
    availableFrom: day(r.int(0, 120)),
    propertyType: r.pick(['apartment', 'house', 'duplex', 'studio', 'other']),
    bedrooms: r.int(0, 5),
    furnished: r.pick([null, 'furnished', 'part_furnished', 'unfurnished']),
    parking: r.pick([null, 'none', 'street', 'space']),
    berRating: 'C1',
    criteria,
    status: 'live',
    // Ties on purpose: homes that went live at the same moment are ordered by reference.
    liveAt: new Date(TODAY.getTime() - r.int(0, 40) * 3_600_000),
  };
  return { row, words: addressWordsOf({ addressLine1, addressLine2, area }) };
}

/** A made-up search: a place (any kind) or a map area, and any of the filters. */
function aSearch(r: Random): SearchFilters {
  const raw: Record<string, unknown> = {};
  if (r.chance(0.7)) {
    raw.where = r.chance(0.08)
      ? r.pick(['d06', 'p17', 't12', 'nowhere-at-all'])
      : r.pick(g.places).slug;
    if (r.chance(0.3)) raw.within = r.pick(WITHIN_KM);
  } else if (r.chance(0.3)) {
    const centre = r.pick(g.places).centre;
    const half = r.pick([0.02, 0.05, 0.2]);
    raw.box = {
      minLat: centre.lat - half,
      maxLat: centre.lat + half,
      minLng: centre.lng - half * 1.5,
      maxLng: centre.lng + half * 1.5,
    };
  }
  if (r.chance(0.35)) raw.maxRent = r.int(10, 30) * 100;
  if (r.chance(0.35)) raw.beds = r.int(1, 4);
  if (r.chance(0.3)) raw.moveIn = day(r.int(0, 100));
  if (r.chance(0.25)) raw.stay = r.pick(stays);
  if (r.chance(0.25)) raw.people = r.int(1, 6);
  if (r.chance(0.25)) raw.pets = r.chance(0.6);
  if (r.chance(0.2)) raw.furnished = true;
  if (r.chance(0.2)) raw.parking = true;
  if (r.chance(0.2)) raw.type = r.pick(searchTypes);
  return wholeSearch(searchFiltersSchema.parse(raw));
}

/** Only the homes this test made, in the order each answer gave them. */
function ours(results: SearchResults<HomeOnGaff>, refs: ReadonlySet<string>) {
  return {
    fits: results.fits.filter((h) => refs.has(h.id)).map((h) => h.id),
    close: results.close
      .filter((c) => refs.has(c.home.id))
      .map((c) => ({ id: c.home.id, miss: c.miss })),
  };
}

async function makeHomes(tx: Tx, made: readonly Made[]): Promise<Set<string>> {
  const refs = new Set<string>();
  for (let at = 0; at < made.length; at += 500) {
    const rows = await tx
      .insert(lettings)
      .values(made.slice(at, at + 500).map((m) => m.row))
      .returning({
        id: lettings.id,
        ref: lettings.publicRef,
        organisationId: lettings.organisationId,
      });
    await tx.insert(lettingPhotos).values(
      rows.map((row) => ({
        organisationId: row.organisationId,
        lettingId: row.id,
        position: 0,
        storageKey: `test/${row.id}.png`,
        contentType: 'image/png',
        bytes: 100,
        kind: 'photo' as const,
      })),
    );
    for (const row of rows) refs.add(row.ref);
  }
  return refs;
}

describe('M58, M59, M61: search answered by the database', () => {
  it('BA-14: an address reads the same in Postgres (`gaff_address_words`) as in Gaff’s own rule', async () => {
    const agency = await createTestMember();
    const landlord = await createTestMember({ kind: 'private_landlord' });
    const r = random(14);
    const made = Array.from({ length: 300 }, () =>
      aHome(r, r.pick(g.places), { agency, private: landlord }),
    );
    const stored = await inRolledBack(async (tx) => {
      const refs = await makeHomes(tx, made);
      return tx
        .select({
          ref: lettings.publicRef,
          words: sql<string>`gaff_address_words(${lettings.addressLine1}, ${lettings.addressLine2}, ${lettings.area})`,
          line1: lettings.addressLine1,
          line2: lettings.addressLine2,
          area: lettings.area,
        })
        .from(lettings)
        .where(inArray(lettings.publicRef, [...refs]));
    });
    expect(stored).toHaveLength(made.length);
    for (const row of stored) {
      expect(row.words, `${row.line1} | ${row.line2} | ${row.area}`).toBe(
        addressWordsOf({ addressLine1: row.line1, addressLine2: row.line2, area: row.area }),
      );
    }
  });

  it('M58, M59, M61: the same homes, order, one-miss group and places as the in-memory rule', async () => {
    const agency = await createTestMember();
    const landlord = await createTestMember({ kind: 'private_landlord' });
    const r = random(2026);
    const made = Array.from({ length: 700 }, () =>
      aHome(r, r.pick(g.places), { agency, private: landlord }),
    );
    const searches = Array.from({ length: 250 }, () => aSearch(r));
    // The searches that ask nothing, a place alone, and "near" with each "Within", always.
    for (const place of g.places) searches.push({ where: place.slug });
    for (const within of WITHIN_KM) {
      searches.push({ where: 'highfield-road-rathgar-dublin-6', within });
      searches.push({ where: 'heuston-station-dublin-8', within, maxRent: 2000 });
    }
    searches.push({});

    const outcome = await inRolledBack(async (tx) => {
      const refs = await makeHomes(tx, made);
      // A home that has stopped taking enquiries is in neither (UX-LP-5).
      const [closed] = [...refs];
      await tx
        .update(lettings)
        .set({ enquiriesCloseAt: new Date(Date.now() - 60_000) })
        .where(eq(lettings.publicRef, closed!));
      const all = await liveHomesOnGaffIn(tx);
      const compared: Array<{ filters: SearchFilters; sql: unknown; memory: unknown }> = [];
      let found = 0;
      let close = 0;
      for (const filters of searches) {
        const sql = ours(await searchIn(tx, filters, g), refs);
        const memory = ours(searchHomes(all, filters, g), refs);
        found += sql.fits.length;
        close += sql.close.length;
        compared.push({ filters, sql, memory });
      }
      const areas = g.places.filter((p) => searchPlace(p.slug, g)?.kind === 'area');
      const counts = await countHomesInTx(tx, areas, g);
      const mine = all.filter((h) => refs.has(h.id));
      // Every home in the database is counted; those of other tests' too, so compare the
      // difference this test's homes make: count with them, minus without.
      const without = all.filter((h) => !refs.has(h.id));
      const countDiffs = areas.map((place) => {
        const where = searchPlace(place.slug, g)!;
        return {
          slug: place.slug,
          sql: (counts.get(place.slug) ?? 0) - without.filter((h) => placeHasHome(where, h)).length,
          memory: mine.filter((h) => placeHasHome(where, h)).length,
        };
      });
      return { compared, found, close, closed: closed!, all, countDiffs };
    });

    for (const { filters, sql, memory } of outcome.compared) {
      expect(sql, JSON.stringify(filters)).toEqual(memory);
    }
    for (const count of outcome.countDiffs) expect(count.sql, count.slug).toBe(count.memory);
    // The searches found plenty, of both kinds, so the comparison means something.
    expect(outcome.found).toBeGreaterThan(1000);
    expect(outcome.close).toBeGreaterThan(300);
    expect(outcome.all.map((h) => h.id)).not.toContain(outcome.closed);
  });

  it('BA-14: stays fast with several thousand homes', async () => {
    const agency = await createTestMember();
    const landlord = await createTestMember({ kind: 'private_landlord' });
    const r = random(5000);
    const made = Array.from({ length: 4000 }, () =>
      aHome(r, r.pick(g.places), { agency, private: landlord }),
    );
    const searches = Array.from({ length: 20 }, () => aSearch(r));
    const timings = await inRolledBack(async (tx) => {
      await makeHomes(tx, made);
      const times: number[] = [];
      for (const filters of searches) {
        const started = performance.now();
        await searchIn(tx, filters, g);
        times.push(performance.now() - started);
      }
      const started = performance.now();
      await countHomesInTx(tx, g.places, g);
      return { times, counts: performance.now() - started };
    });
    const sorted = [...timings.times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    // Generous bounds for a shared machine: in practice far under them.
    expect(median).toBeLessThan(1000);
    expect(timings.counts).toBeLessThan(3000);
  }, 120_000);
});

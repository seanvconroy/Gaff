import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { curatedPlaces } from '@/domain/places/curated';
import { placeToLine } from '@/domain/places/file';
import { fixturePlaces } from '@/domain/places/fixture';
import { otherNames, otherNamesWithoutPlace } from '@/domain/places/other-names';
import { PLACE_FILE, readPlaceFile, readPlaceFileHeader, withCurated } from './load';
import { rowFromPlace } from './places';

describe('ADR-0018: reading the built place index', () => {
  it('M56: reads the header and every valid place, skipping bad lines and repeats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'places-'));
    const path = join(dir, 'places.ndjson.gz');
    const kinsale = fixturePlaces.find((p) => p.slug === 'kinsale')!;
    const street = fixturePlaces.find((p) => p.kind === 'street')!;
    const header = {
      version: 20261108,
      built: '2026-11-08',
      source: 'test',
      count: 2,
      attribution: [],
    };
    const body = [
      JSON.stringify(header),
      placeToLine(kinsale, { src: 'osm', id: 'n1' }),
      placeToLine(street, { src: 'osm', id: 'w2' }),
      placeToLine(kinsale, { src: 'osm', id: 'n1' }),
      'not a place',
      JSON.stringify({ s: 'nowhere', n: 'Nowhere', k: 'planet', c: 'Cork', y: 1, x: 1, r: 1 }),
    ].join('\n');
    writeFileSync(path, gzipSync(body));
    expect((await readPlaceFileHeader(path)).version).toBe(20261108);
    const { header: read, rows } = await readPlaceFile(path);
    expect(read.version).toBe(20261108);
    expect(rows.map((r) => r.place.slug)).toEqual(['kinsale', street.slug]);
    expect(rows[0]).toMatchObject({ src: 'osm', id: 'n1', place: { irishName: 'Cionn tSáile' } });
    expect(rows[1]!.place.line?.[0]?.length).toBe(street.line?.[0]?.length);
    // Asked for one kind, it reads only that kind's places.
    const streets = await readPlaceFile(path, 'street');
    expect(streets.header.version).toBe(20261108);
    expect(streets.rows.map((r) => r.place.slug)).toEqual([street.slug]);
  });

  it('Q60: a landmark’s row takes its other names, and is found by them', () => {
    const tcd = fixturePlaces.find((p) => p.name === 'Trinity College Dublin')!;
    const row = rowFromPlace(tcd, 1, 'fixture');
    // The fixture's own aliases first, then the one the list adds that it doesn't have.
    expect(tcd.aliases).toEqual(['TCD', 'Trinity College']);
    expect(row.aliases).toEqual(['TCD', 'Trinity College', 'Trinity']);
    expect(row.searchText).toBe('trinity college dublin tcd trinity college trinity dublin 2');
    // Any other place's row is as the file has it.
    const kinsale = fixturePlaces.find((p) => p.slug === 'kinsale')!;
    expect(rowFromPlace(kinsale, 1, 'fixture').aliases).toEqual(kinsale.aliases ?? []);
  });

  it('Q60: every landmark with other names is in the index in the repository', async () => {
    const { rows } = await readPlaceFile(PLACE_FILE, 'landmark');
    expect(rows.length).toBeGreaterThan(1000);
    expect(rows.every((r) => r.place.kind === 'landmark')).toBe(true);
    // A row that finds nothing means OpenStreetMap renamed the landmark: fix its name in the list.
    expect(otherNamesWithoutPlace(rows.map((r) => r.place)).map((entry) => entry.name)).toEqual([]);
    expect(otherNames.length).toBeGreaterThan(40);
  });

  it('M56: the curated base goes over the file’s copies of the same places', () => {
    const ranelagh = curatedPlaces.find((p) => p.slug === 'ranelagh')!;
    const stale = { place: { ...ranelagh, context: undefined }, src: 'gaff' };
    const kinsale = { place: fixturePlaces.find((p) => p.slug === 'kinsale')!, src: 'osm' };
    const loaded = withCurated([stale, kinsale]);
    expect(loaded).toHaveLength(curatedPlaces.length + 1);
    expect(loaded.find((r) => r.place.slug === 'ranelagh')?.place.context).toBe('Dublin 6');
    expect(loaded.find((r) => r.place.slug === 'kinsale')?.src).toBe('osm');
  });

  it('M56: the index in the repository holds every place in Ireland it was built with', async () => {
    const { header, rows } = await readPlaceFile(PLACE_FILE);
    expect(header.attribution).toContain('© OpenStreetMap contributors (ODbL 1.0)');
    expect(rows.length).toBe(header.count);
    expect(rows.length).toBeGreaterThan(100_000);
    const bySlug = new Map(rows.map((r) => [r.place.slug, r.place]));
    // The founder's two: a town in Cork and a street in Dublin 6.
    expect(bySlug.get('kinsale')).toMatchObject({ kind: 'town', county: 'Cork' });
    expect(bySlug.get('highfield-road-rathgar-dublin-6')).toMatchObject({
      kind: 'street',
      context: 'Rathgar, Dublin 6',
    });
    // The curated base is in it, slug for slug.
    for (const place of curatedPlaces) expect(bySlug.has(place.slug), place.slug).toBe(true);
  });
});

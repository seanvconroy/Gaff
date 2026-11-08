import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { placeToLine } from '@/domain/places/file';
import { fixturePlaces } from '@/domain/places/fixture';
import { readPlaceFile } from './load';

describe('ADR-0027: reading the built place index', () => {
  it('reads the header and every valid place, skipping bad lines and repeats', async () => {
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
    const { header: read, rows } = await readPlaceFile(path);
    expect(read.version).toBe(20261108);
    expect(rows.map((r) => r.place.slug)).toEqual(['kinsale', street.slug]);
    expect(rows[0]).toMatchObject({ src: 'osm', id: 'n1', place: { irishName: 'Cionn tSáile' } });
    expect(rows[1]!.place.line?.[0]?.length).toBe(street.line?.[0]?.length);
  });
});

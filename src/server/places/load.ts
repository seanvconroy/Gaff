import { createReadStream, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { count, ne, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { places } from '@/db/schema';
import { fixturePlaces } from '@/domain/places/fixture';
import { placeFromLine, type PlaceFileHeader } from '@/domain/places/file';
import type { Place } from '@/domain/places/gazetteer';
import { forgetCachedPlaces, refreshPlaceCounts, rowFromPlace } from './places';

/**
 * ADR-0025: loading the place index. The built file (`data/places/places.ndjson.gz`) replaces
 * the whole index in one transaction when its version is newer than the one loaded. Without a
 * built file (development, tests), the fixture keeps search working.
 */

export const PLACE_FILE = 'data/places/places.ndjson.gz';
const FIXTURE_VERSION = 1;
const BATCH = 1000;

type Loadable = { place: Place; src: string; id?: string };

export async function loadedVersion(): Promise<number> {
  return withSystem(async (tx) => {
    const [row] = await tx.select({ v: sql<number | null>`max(${places.version})` }).from(places);
    return Number(row?.v ?? 0);
  });
}

/** Replaces the index with these places, all in one transaction. */
export async function replacePlaces(
  rows: readonly Loadable[],
  version: number,
): Promise<{ loaded: number }> {
  await withSystem(async (tx) => {
    await tx.delete(places).where(ne(places.version, -1));
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx
        .insert(places)
        .values(rows.slice(i, i + BATCH).map((r) => rowFromPlace(r.place, version, r.src, r.id)));
    }
  });
  forgetCachedPlaces();
  await refreshPlaceCounts();
  return { loaded: rows.length };
}

/** Reads the built file: its header and every valid place. */
export async function readPlaceFile(
  path: string,
): Promise<{ header: PlaceFileHeader; rows: Loadable[] }> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  let header: PlaceFileHeader | null = null;
  const rows: Loadable[] = [];
  const slugs = new Set<string>();
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (!header) {
      header = JSON.parse(line) as PlaceFileHeader;
      continue;
    }
    const parsed = placeFromLine(line);
    if (parsed && !slugs.has(parsed.place.slug)) {
      slugs.add(parsed.place.slug);
      rows.push(parsed);
    }
  }
  if (!header || typeof header.version !== 'number') throw new Error(`${path} has no header`);
  return { header, rows };
}

/**
 * Loads the built index if it's newer than what's loaded; otherwise, if the index is empty,
 * loads the fixture. Returns what it did.
 */
export async function ensurePlaceIndex(
  path = PLACE_FILE,
): Promise<{ action: 'loaded' | 'fixture' | 'current'; version: number; loaded?: number }> {
  const current = await loadedVersion();
  if (existsSync(path)) {
    const { header, rows } = await readPlaceFile(path);
    if (header.version > current) {
      const { loaded } = await replacePlaces(rows, header.version);
      return { action: 'loaded', version: header.version, loaded };
    }
    return { action: 'current', version: current };
  }
  const [{ n }] = (await withSystem((tx) => tx.select({ n: count() }).from(places))) as [
    { n: number },
  ];
  if (n === 0) {
    const { loaded } = await replacePlaces(
      fixturePlaces.map((place) => ({ place, src: 'fixture' })),
      FIXTURE_VERSION,
    );
    return { action: 'fixture', version: FIXTURE_VERSION, loaded };
  }
  return { action: 'current', version: current };
}

/**
 * `pnpm places:load`: load the built index if it's newer (or the fixture into an empty index).
 * `--deploy` (the Vercel build): production deployments only, as for migrations; preview
 * deployments share the database. `--fixture`: replace the index with the fixture (tests).
 */
async function main(): Promise<void> {
  if (
    process.argv.includes('--deploy') &&
    process.env.VERCEL === '1' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    console.log('Preview deployment: the place index is left as it is.');
    return;
  }
  if (process.argv.includes('--fixture')) {
    const { loaded } = await replacePlaces(
      fixturePlaces.map((place) => ({ place, src: 'fixture' })),
      FIXTURE_VERSION,
    );
    console.log(`Place index: the fixture (${loaded} places).`);
    return;
  }
  const result = await ensurePlaceIndex();
  console.log(
    result.action === 'current'
      ? `Place index: version ${result.version} is current.`
      : `Place index: loaded version ${result.version} (${result.loaded} places, ${result.action}).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

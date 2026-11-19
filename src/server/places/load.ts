import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import { count, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { places } from '@/db/schema';
import { curatedPlaces } from '@/domain/places/curated';
import { placeFromLine, type PlaceFileHeader } from '@/domain/places/file';
import { fixturePlaces } from '@/domain/places/fixture';
import type { Place } from '@/domain/places/gazetteer';
import { forgetCachedPlaces, rowFromPlace } from './places';

/**
 * ADR-0017: loading the place index. The built file (`data/places/places.ndjson.gz`) replaces
 * the whole index in one transaction when its version is newer than the one loaded. The curated
 * base (src/domain/places/curated.ts) is Gaff's own and trusted: it goes over the file's copies
 * of the same places on every load, so a change to it needs no rebuild. When nothing changed, a
 * load only refreshes those few rows. Without a built file (some tests), the fixture keeps
 * search working.
 */

export const PLACE_FILE = 'data/places/places.ndjson.gz';
export const FIXTURE_VERSION = 1;
const BATCH = 1000;

export type Loadable = { place: Place; src: string; id?: string };

export async function loadedVersion(): Promise<number> {
  return withSystem(async (tx) => {
    const [row] = await tx.select({ v: sql<number | null>`max(${places.version})` }).from(places);
    return Number(row?.v ?? 0);
  });
}

const curatedRows = (): Loadable[] => curatedPlaces.map((place) => ({ place, src: 'gaff' }));

/** The file's places with the curated base over its copies of them. */
export function withCurated(rows: readonly Loadable[]): Loadable[] {
  const curated = new Set(curatedPlaces.map((p) => p.slug));
  return [...curatedRows(), ...rows.filter((r) => !curated.has(r.place.slug))];
}

/** Replaces the index with these places, all in one transaction. */
export async function replacePlaces(
  rows: readonly Loadable[],
  version: number,
): Promise<{ loaded: number }> {
  await withSystem(async (tx) => {
    await tx.delete(places);
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx
        .insert(places)
        .values(rows.slice(i, i + BATCH).map((r) => rowFromPlace(r.place, version, r.src, r.id)));
    }
  });
  forgetCachedPlaces();
  return { loaded: rows.length };
}

/** Puts the curated base over what's loaded, at the loaded version. */
async function refreshCurated(version: number): Promise<void> {
  await withSystem(async (tx) => {
    for (const { place, src } of curatedRows()) {
      const row = rowFromPlace(place, version, src);
      await tx.insert(places).values(row).onConflictDoUpdate({ target: places.slug, set: row });
    }
  });
  forgetCachedPlaces();
}

/** Reads the built file: its header and every valid place, each slug once. */
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

/** The built file's header alone, without reading its places. */
export async function readPlaceFileHeader(path: string): Promise<PlaceFileHeader> {
  const file = createReadStream(path);
  const input = file.pipe(createGunzip());
  try {
    for await (const line of createInterface({ input })) {
      if (!line.trim()) continue;
      const header = JSON.parse(line) as PlaceFileHeader;
      if (typeof header.version !== 'number') break;
      return header;
    }
    throw new Error(`${path} has no header`);
  } finally {
    input.destroy();
    file.destroy();
  }
}

/** Replaces the index with the fixture (tests). */
export async function loadFixture(): Promise<{ loaded: number }> {
  return replacePlaces(
    fixturePlaces.map((place) => ({ place, src: 'fixture' })),
    FIXTURE_VERSION,
  );
}

/**
 * Loads the built index if it's newer than what's loaded, or else refreshes the curated base;
 * with no built file, loads the fixture into an empty index. Says what it did.
 */
export async function ensurePlaceIndex(
  path = PLACE_FILE,
): Promise<{ action: 'loaded' | 'fixture' | 'current'; version: number; loaded?: number }> {
  const current = await loadedVersion();
  if (existsSync(path)) {
    if ((await readPlaceFileHeader(path)).version > current) {
      const { header, rows } = await readPlaceFile(path);
      const { loaded } = await replacePlaces(withCurated(rows), header.version);
      return { action: 'loaded', version: header.version, loaded };
    }
    await refreshCurated(current);
    return { action: 'current', version: current };
  }
  const [{ n }] = (await withSystem((tx) => tx.select({ n: count() }).from(places))) as [
    { n: number },
  ];
  if (n === 0) {
    const { loaded } = await loadFixture();
    return { action: 'fixture', version: FIXTURE_VERSION, loaded };
  }
  return { action: 'current', version: current };
}

/**
 * `pnpm places:load`: load the built index if it's newer. `--deploy` (the Vercel build):
 * production deployments only, as for migrations; preview deployments share the database.
 * `--fixture`: replace the index with the fixture (tests).
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
    const { loaded } = await loadFixture();
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

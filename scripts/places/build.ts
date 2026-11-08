/**
 * ADR-0027: builds Gaff's place index from OpenStreetMap.
 *
 *   pnpm places:build                  download Geofabrik's Ireland extract, build, write the file
 *   pnpm places:build --pbf <file>     build from a local .osm.pbf instead
 *   pnpm places:build --out <file>     write somewhere other than data/places/places.ndjson.gz
 *
 * Needs `osmium` (osmium-tool) on the PATH. Then `pnpm places:check` tests the result, and
 * `pnpm places:load` loads it (the Vercel build loads it on deploy when its version is newer).
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGzip } from 'node:zlib';
import { placeToLine, type PlaceFileHeader } from '@/domain/places/file';
import {
  buildIndex,
  classify,
  countyShape,
  parseFeature,
  type Candidate,
  type CountyShape,
} from './lib';

const SOURCE = 'https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf';
const WORK = '.cache/places';
const DEFAULT_OUT = 'data/places/places.ndjson.gz';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function download(url: string, path: string): Promise<void> {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream),
    createWriteStream(path),
  );
}

function osmium(args: string[]): void {
  execFileSync('osmium', args, { stdio: 'inherit' });
}

/** The tags the index uses: places, boundaries, named roads and landmarks. */
const FILTERS = [
  'n/place=city,town,village,hamlet,suburb,neighbourhood,quarter',
  'w/place=city,town,village,suburb,neighbourhood,quarter',
  'r/place=city,town,village,suburb,neighbourhood,quarter',
  'r/boundary=administrative',
  'w/highway=primary,secondary,tertiary,unclassified,residential,living_street,pedestrian,service,road',
  'nwr/amenity=university,college,hospital',
  'nwr/railway=station,halt,tram_stop',
  'nwr/public_transport=station',
  'wr/leisure=park',
  'nwr/shop=mall',
];

async function main(): Promise<void> {
  mkdirSync(WORK, { recursive: true });
  const pbf = arg('--pbf') ?? `${WORK}/ireland-and-northern-ireland-latest.osm.pbf`;
  if (!existsSync(pbf)) await download(SOURCE, pbf);
  const filtered = `${WORK}/filtered.osm.pbf`;
  const features = `${WORK}/features.geojsonseq`;
  console.log('Filtering the extract');
  osmium(['tags-filter', pbf, ...FILTERS, '-o', filtered, '--overwrite']);
  console.log('Exporting features');
  osmium([
    'export',
    filtered,
    '-f',
    'geojsonseq',
    '-o',
    features,
    '--overwrite',
    '-u',
    'type_id',
    '--geometry-types=point,linestring,polygon',
  ]);

  const counties: CountyShape[] = [];
  const candidates: Candidate[] = [];
  const lines = createInterface({ input: createReadStream(features) });
  for await (const line of lines) {
    const feature = parseFeature(line);
    if (!feature) continue;
    const county = countyShape(feature);
    if (county) {
      counties.push(county);
      continue;
    }
    const candidate = classify(feature);
    if (candidate) candidates.push(candidate);
  }
  console.log(`Counties: ${counties.length}. Candidates: ${candidates.length}.`);
  if (counties.length !== 26) {
    throw new Error(`Expected the 26 counties' boundaries, found ${counties.length}`);
  }

  const { places, dropped } = buildIndex({ counties, candidates });
  const built = new Date().toISOString().slice(0, 10);
  const header: PlaceFileHeader = {
    version: Number(arg('--version') ?? built.replaceAll('-', '')),
    built,
    source: 'OpenStreetMap (Geofabrik extract) and Gaff',
    count: places.length,
    attribution: ['© OpenStreetMap contributors (ODbL 1.0)'],
  };
  const out = arg('--out') ?? DEFAULT_OUT;
  mkdirSync(dirname(out), { recursive: true });
  const body = [JSON.stringify(header), ...places.map((p) => placeToLine(p.place, p))].join('\n');
  await pipeline(Readable.from([`${body}\n`]), createGzip({ level: 9 }), createWriteStream(out));

  const byKind = new Map<string, number>();
  for (const { place } of places) byKind.set(place.kind, (byKind.get(place.kind) ?? 0) + 1);
  console.log(`Wrote ${out}: version ${header.version}, ${places.length} places.`);
  console.log(Object.fromEntries([...byKind].sort()));
  console.log(
    `Dropped: ${dropped.outsideRepublic} outside the Republic, ${dropped.duplicates} repeats.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

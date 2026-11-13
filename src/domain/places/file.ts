import { counties } from '@/domain/lettings/new-letting';
import {
  landmarkKinds,
  placeKinds,
  type County,
  type LandmarkKind,
  type Place,
  type PlaceKind,
} from './gazetteer';

/**
 * ADR-0027: the place index as a file, one place per line (NDJSON, gzipped), after a header line.
 * `scripts/places/build.ts` writes it from open data; `pnpm places:load` reads it. Short keys
 * keep a 200,000-place file small. Coordinates have 5 decimals (about a metre).
 */

export interface PlaceFileHeader {
  version: number;
  built: string;
  source: string;
  count: number;
  /** Credits for the data, shown on the "Map and place data" page. */
  attribution: string[];
}

interface PlaceLine {
  s: string;
  n: string;
  k: PlaceKind;
  c: County;
  y: number;
  x: number;
  r: number;
  lk?: LandmarkKind;
  ga?: string;
  a?: string[];
  t?: string;
  rk?: string;
  b?: [number, number, number, number];
  l?: Array<Array<[number, number]>>;
  p?: number;
  src?: string;
  id?: string;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function placeToLine(place: Place, source?: { src: string; id?: string }): string {
  const line: PlaceLine = {
    s: place.slug,
    n: place.name,
    k: place.kind,
    c: place.county,
    y: r5(place.centre.lat),
    x: r5(place.centre.lng),
    r: Math.round(place.radiusMetres),
  };
  if (place.landmarkKind) line.lk = place.landmarkKind;
  if (place.irishName) line.ga = place.irishName;
  if (place.aliases?.length) line.a = place.aliases;
  if (place.context) line.t = place.context;
  if (place.routingKey) line.rk = place.routingKey;
  if (place.bbox) {
    line.b = [
      r5(place.bbox.minLat),
      r5(place.bbox.minLng),
      r5(place.bbox.maxLat),
      r5(place.bbox.maxLng),
    ];
  }
  if (place.line?.length) line.l = place.line.map((run) => run.map((p) => [r5(p.lat), r5(p.lng)]));
  if (place.population) line.p = place.population;
  if (source) {
    line.src = source.src;
    if (source.id) line.id = source.id;
  }
  return JSON.stringify(line);
}

const kinds = new Set<string>(placeKinds);
const landmarks = new Set<string>(landmarkKinds);
const countyNames = new Set<string>(counties);

/** A place from one line of the file; null if the line isn't a valid place. */
export function placeFromLine(text: string): { place: Place; src: string; id?: string } | null {
  let line: PlaceLine;
  try {
    line = JSON.parse(text) as PlaceLine;
  } catch {
    return null;
  }
  if (
    typeof line.s !== 'string' ||
    typeof line.n !== 'string' ||
    !kinds.has(line.k) ||
    !countyNames.has(line.c) ||
    !Number.isFinite(line.y) ||
    !Number.isFinite(line.x) ||
    !Number.isFinite(line.r)
  ) {
    return null;
  }
  const place: Place = {
    slug: line.s,
    name: line.n,
    kind: line.k,
    county: line.c,
    centre: { lat: line.y, lng: line.x },
    radiusMetres: line.r,
  };
  if (line.lk && landmarks.has(line.lk)) place.landmarkKind = line.lk;
  if (line.ga) place.irishName = line.ga;
  if (line.a?.length) place.aliases = line.a;
  if (line.t) place.context = line.t;
  if (line.rk) place.routingKey = line.rk;
  if (line.b) {
    const [minLat, minLng, maxLat, maxLng] = line.b;
    place.bbox = { minLat, minLng, maxLat, maxLng };
  }
  if (line.l?.length) place.line = line.l.map((run) => run.map(([lat, lng]) => ({ lat, lng })));
  if (line.p) place.population = line.p;
  return { place, src: line.src ?? 'gaff', ...(line.id ? { id: line.id } : {}) };
}

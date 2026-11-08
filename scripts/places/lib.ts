/**
 * ADR-0027: turning OpenStreetMap features (as `osmium export` writes them, one GeoJSON feature
 * a line) into Gaff's place index. Pure functions, tested in lib.test.ts; build.ts does the I/O.
 *
 * - Counties come from OSM's county boundaries (admin level 6), and only places inside the 26
 *   counties are kept.
 * - The curated places (every county, Dublin district, main town and Dublin area from the first
 *   version) stay exactly as they are, so area pages keep their addresses. OSM adds the rest.
 * - Streets are named roads, merged into one street per name and neighbourhood.
 * - Landmarks are colleges, hospitals, stations, large parks and shopping centres.
 * - Townlands come from OSM's townland boundaries (admin level 10).
 */
import { counties } from '@/domain/lettings/new-letting';
import { dublinDistricts } from '@/domain/places/eircode';
import { curatedPlaces } from '@/domain/places/fixture';
import type { County, LandmarkKind, Place, PlaceKind } from '@/domain/places/gazetteer';
import {
  bboxOf,
  distanceMetres,
  expandBBox,
  polygonAreaKm2,
  simplify,
  type BBox,
  type Point,
} from '@/domain/places/geo';
import { normalise } from '@/domain/places/normalise';
import { slugify } from '@/domain/places/slug';

type Position = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

export interface Feature {
  type: 'Feature';
  id?: string | number;
  geometry: Geometry | null;
  properties: Record<string, string | undefined>;
}

/** A feature line from `osmium export -f geojsonseq` (which may start with a record separator). */
export function parseFeature(line: string): Feature | null {
  const text = line.replace(/^\x1e/, '').trim();
  if (!text) return null;
  try {
    const feature = JSON.parse(text) as Feature;
    return feature.type === 'Feature' && feature.geometry ? feature : null;
  } catch {
    return null;
  }
}

const point = ([lng, lat]: Position): Point => ({ lat, lng });

/** Every ring of a polygon or multipolygon, as points. */
function rings(geometry: Geometry): Point[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.map((r) => r.map(point));
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((poly) => poly.map((r) => r.map(point)));
  }
  return [];
}

function allPoints(geometry: Geometry): Point[] {
  switch (geometry.type) {
    case 'Point':
      return [point(geometry.coordinates)];
    case 'LineString':
      return geometry.coordinates.map(point);
    case 'MultiLineString':
      return geometry.coordinates.flatMap((l) => l.map(point));
    default:
      return rings(geometry).flat();
  }
}

/** The middle of a feature: a point, the centre of its box, or for lines the point nearest it. */
export function centreOf(geometry: Geometry): Point {
  const points = allPoints(geometry);
  if (geometry.type === 'Point') return points[0]!;
  const box = bboxOf(points);
  const middle = { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return points.reduce((best, p) =>
      distanceMetres(p, middle) < distanceMetres(best, middle) ? p : best,
    );
  }
  return middle;
}

/** Even-odd ray casting over every ring, so holes stay holes. */
export function inRings(p: Point, ringList: readonly (readonly Point[])[]): boolean {
  let inside = false;
  for (const ring of ringList) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.lat > p.lat !== b.lat > p.lat) {
        const x = ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
        if (p.lng < x) inside = !inside;
      }
    }
  }
  return inside;
}

export interface CountyShape {
  county: County;
  rings: Point[][];
  box: BBox;
}

const countyNames = new Map(counties.map((c) => [normalise(`County ${c}`), c] as const));

/** OSM's county boundaries (admin level 6), for the 26 counties of the Republic. */
export function countyShape(feature: Feature): CountyShape | null {
  const p = feature.properties;
  if (p.boundary !== 'administrative' || p.admin_level !== '6' || !feature.geometry) return null;
  const county = countyNames.get(normalise(p.name ?? ''));
  if (!county) return null;
  const ringList = rings(feature.geometry).map((r) => simplify(r, 30));
  if (ringList.length === 0) return null;
  return { county, rings: ringList, box: bboxOf(ringList.flat()) };
}

export function countyAt(p: Point, shapes: readonly CountyShape[]): County | null {
  for (const shape of shapes) {
    if (
      p.lat >= shape.box.minLat &&
      p.lat <= shape.box.maxLat &&
      p.lng >= shape.box.minLng &&
      p.lng <= shape.box.maxLng &&
      inRings(p, shape.rings)
    ) {
      return shape.county;
    }
  }
  return null;
}

/** A place found in OSM before it's given a county, context and slug. */
export interface Candidate {
  kind: PlaceKind;
  name: string;
  irishName?: string;
  aliases?: string[];
  landmarkKind?: LandmarkKind;
  centre: Point;
  bbox?: BBox;
  line?: Point[][];
  population?: number;
  radiusMetres: number;
  /** OSM's place value for places, used to judge reach and context. */
  placeValue?: string;
  sourceId?: string;
}

const placeKinds: Record<string, { kind: PlaceKind; radius: number }> = {
  city: { kind: 'city', radius: 5000 },
  town: { kind: 'town', radius: 2000 },
  village: { kind: 'village', radius: 1200 },
  hamlet: { kind: 'village', radius: 700 },
  suburb: { kind: 'area', radius: 1200 },
  neighbourhood: { kind: 'area', radius: 800 },
  quarter: { kind: 'area', radius: 800 },
};

const roadTypes = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'pedestrian',
  'service',
  'road',
]);

/** "N4", "R114", "M50": road numbers, not street names renters search for. */
const ROAD_NUMBER = /^[MNRL]\d+[A-Z]?$/i;

function names(p: Feature['properties']): string[] {
  return ['alt_name', 'old_name', 'short_name', 'loc_name']
    .flatMap((key) => (p[key] ?? '').split(';'))
    .map((n) => n.trim())
    .filter(Boolean);
}

function townRadius(population: number | undefined): number {
  if (!population) return 2000;
  if (population > 20_000) return 3000;
  if (population > 10_000) return 2500;
  if (population > 5_000) return 2000;
  return 1500;
}

function landmarkKindOf(p: Feature['properties']): LandmarkKind | null {
  if (p.amenity === 'university' || p.amenity === 'college') return 'college';
  if (p.amenity === 'hospital') return 'hospital';
  if (
    p.railway === 'station' ||
    p.railway === 'halt' ||
    p.railway === 'tram_stop' ||
    p.public_transport === 'station'
  ) {
    return 'station';
  }
  if (p.leisure === 'park') return 'park';
  if (p.shop === 'mall') return 'shopping_centre';
  return null;
}

const MIN_PARK_KM2 = 0.05;

/** What a feature is, for the index; null for anything the index doesn't keep. */
export function classify(feature: Feature): Candidate | null {
  const p = feature.properties;
  const geometry = feature.geometry;
  const name = p.name?.trim();
  if (!geometry || !name) return null;
  const sourceId = feature.id !== undefined ? String(feature.id) : undefined;
  const base = {
    name,
    ...(p['name:ga'] && p['name:ga'] !== name ? { irishName: p['name:ga'] } : {}),
    ...(names(p).length ? { aliases: names(p) } : {}),
    centre: centreOf(geometry),
    ...(sourceId ? { sourceId } : {}),
  };
  if (p.boundary === 'administrative' && p.admin_level === '10') {
    const box = bboxOf(allPoints(geometry));
    const reach = distanceMetres(
      { lat: box.minLat, lng: box.minLng },
      { lat: box.maxLat, lng: box.maxLng },
    );
    return {
      ...base,
      kind: 'townland',
      bbox: box,
      radiusMetres: Math.min(2000, Math.max(700, reach / 2)),
    };
  }
  if (p.place && placeKinds[p.place]) {
    const { kind, radius } = placeKinds[p.place]!;
    const population = Number.parseInt(p.population ?? '', 10);
    return {
      ...base,
      kind,
      placeValue: p.place,
      ...(Number.isFinite(population) && population > 0 ? { population } : {}),
      radiusMetres: kind === 'town' ? townRadius(population) : radius,
    };
  }
  const landmark = landmarkKindOf(p);
  if (landmark) {
    if (landmark === 'park') {
      const area = rings(geometry).reduce((sum, r) => sum + polygonAreaKm2(r), 0);
      if (area < MIN_PARK_KM2) return null;
    }
    return { ...base, kind: 'landmark', landmarkKind: landmark, radiusMetres: 200 };
  }
  if (p.highway && roadTypes.has(p.highway) && !ROAD_NUMBER.test(name)) {
    if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') return null;
    const runs =
      geometry.type === 'LineString'
        ? [geometry.coordinates.map(point)]
        : geometry.coordinates.map((l) => l.map(point));
    return {
      ...base,
      kind: 'street',
      line: runs.map((r) => simplify(r, 15)),
      radiusMetres: 0,
    };
  }
  return null;
}

/** A grid over Ireland, so "what's near here" checks a few cells instead of every place. */
export class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size = 0.05) {}
  private key(lat: number, lng: number) {
    return `${Math.floor(lat / this.size)}:${Math.floor(lng / this.size)}`;
  }
  add(p: Point, item: T): void {
    const key = this.key(p.lat, p.lng);
    const list = this.cells.get(key);
    if (list) list.push(item);
    else this.cells.set(key, [item]);
  }
  /** Items within about `metres` of a point (cells around it; callers check the distance). */
  near(p: Point, metres: number): T[] {
    const reach = Math.ceil(metres / 111_000 / this.size) + 1;
    const row = Math.floor(p.lat / this.size);
    const col = Math.floor(p.lng / this.size);
    const out: T[] = [];
    for (let r = row - reach; r <= row + reach; r++) {
      for (let c = col - reach; c <= col + reach; c++) {
        // A loop, not push(...cell): a dense city cell can hold more items than a call can take.
        for (const item of this.cells.get(`${r}:${c}`) ?? []) out.push(item);
      }
    }
    return out;
  }
}

/** Do two boxes overlap? */
function overlaps(a: BBox, b: BBox): boolean {
  return (
    a.minLat <= b.maxLat && b.minLat <= a.maxLat && a.minLng <= b.maxLng && b.minLng <= a.maxLng
  );
}

const MERGE_CELL = 0.01;

/**
 * Merges a street's segments: one street per name, for segments whose boxes come within about
 * 300 m of each other. Union-find over a grid, so a name in every town ("Main Street") stays
 * quick.
 */
export function mergeStreets(streets: readonly Candidate[]): Candidate[] {
  const byName = new Map<string, Candidate[]>();
  for (const s of streets) {
    const key = normalise(s.name);
    const list = byName.get(key);
    if (list) list.push(s);
    else byName.set(key, [s]);
  }
  const merged: Candidate[] = [];
  for (const segments of byName.values()) {
    const boxes = segments.map((s) => expandBBox(bboxOf(s.line!.flat()), 150));
    const parent = segments.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]!]!;
        i = parent[i]!;
      }
      return i;
    };
    const cells = new Map<string, number[]>();
    boxes.forEach((box, i) => {
      for (
        let r = Math.floor(box.minLat / MERGE_CELL);
        r <= Math.floor(box.maxLat / MERGE_CELL);
        r++
      ) {
        for (
          let c = Math.floor(box.minLng / MERGE_CELL);
          c <= Math.floor(box.maxLng / MERGE_CELL);
          c++
        ) {
          const key = `${r}:${c}`;
          const list = cells.get(key) ?? [];
          for (const j of list) {
            if (overlaps(box, boxes[j]!)) parent[find(i)] = find(j);
          }
          list.push(i);
          cells.set(key, list);
        }
      }
    });
    const groups = new Map<number, Candidate[]>();
    segments.forEach((segment, i) => {
      const root = find(i);
      const list = groups.get(root);
      if (list) list.push(segment);
      else groups.set(root, [segment]);
    });
    for (const group of groups.values()) {
      const line = group.flatMap((s) => s.line!);
      const points = line.flat();
      const box = bboxOf(points);
      const middle = { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
      const centre = points.reduce((best, p) =>
        distanceMetres(p, middle) < distanceMetres(best, middle) ? p : best,
      );
      const aliases = [...new Set(group.flatMap((s) => s.aliases ?? []))];
      const irish = group.find((s) => s.irishName)?.irishName;
      merged.push({
        ...group[0]!,
        centre,
        bbox: box,
        line,
        ...(aliases.length ? { aliases } : {}),
        ...(irish ? { irishName: irish } : {}),
      });
    }
  }
  return merged;
}

/** Dublin districts' approximate centres (from the curated list), for a street's context. */
const districtCentres = curatedPlaces
  .filter((p) => p.kind === 'district')
  .map((p) => ({ name: p.name, routingKey: p.routingKey!, centre: p.centre }));

export function dublinDistrictAt(p: Point): { name: string; routingKey: string } | null {
  let best: (typeof districtCentres)[number] | null = null;
  let bestDistance = Infinity;
  for (const d of districtCentres) {
    const distance = distanceMetres(p, d.centre);
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best && bestDistance <= 6000 ? { name: best.name, routingKey: best.routingKey } : null;
}

const reachOf: Record<string, number> = {
  city: 8000,
  town: 3000,
  village: 1800,
  hamlet: 1000,
  suburb: 1500,
  neighbourhood: 900,
  quarter: 900,
};

interface Locality {
  name: string;
  kind: PlaceKind;
  centre: Point;
  reach: number;
}

/** "Cork city" → "Cork": how a city reads after a neighbourhood ("Ballintemple, Cork"). */
function shortName(name: string): string {
  return name.replace(/ (city|town)$/i, '');
}

export class Contexts {
  private readonly grid = new Grid<Locality>(0.05);
  constructor(localities: readonly Locality[]) {
    for (const l of localities) this.grid.add(l.centre, l);
  }

  static from(places: readonly (Place | Candidate)[]): Contexts {
    const localities: Locality[] = [];
    for (const p of places) {
      if (!['city', 'town', 'village', 'area'].includes(p.kind)) continue;
      const value = 'placeValue' in p && p.placeValue ? p.placeValue : undefined;
      const reach =
        value !== undefined
          ? (reachOf[value] ?? 1500)
          : p.kind === 'city'
            ? 8000
            : p.kind === 'town'
              ? 3000
              : p.kind === 'village'
                ? 1800
                : Math.max(900, p.radiusMetres * 1.3);
      localities.push({ name: p.name, kind: p.kind, centre: p.centre, reach });
    }
    return new Contexts(localities);
  }

  /** The smallest named place around a point, and the town or city it belongs to. */
  around(p: Point): { local: Locality | null; town: Locality | null } {
    const nearby = this.grid
      .near(p, 8000)
      .map((l) => ({ l, d: distanceMetres(p, l.centre) }))
      .filter(({ l, d }) => d <= l.reach);
    const order: Record<string, number> = { area: 0, village: 1, town: 2, city: 3 };
    nearby.sort((a, b) => order[a.l.kind]! - order[b.l.kind]! || a.d - b.d);
    const local = nearby[0]?.l ?? null;
    const town = nearby.find(({ l }) => l.kind === 'town' || l.kind === 'city')?.l ?? null;
    return { local, town };
  }

  /** "Rathgar, Dublin 6", "Ballintemple, Cork", "Kinsale, County Cork". */
  contextFor(p: Point, county: County, own?: string): { context: string; routingKey?: string } {
    const { local, town } = this.around(p);
    const localName = local && local.name !== own ? local.name : null;
    if (county === 'Dublin') {
      const district = dublinDistrictAt(p);
      const parts = [localName, district?.name ?? 'County Dublin'].filter(
        (part, i, all): part is string => part !== null && all.indexOf(part) === i,
      );
      return {
        context: parts.join(', '),
        ...(district ? { routingKey: district.routingKey } : {}),
      };
    }
    if (local && local.kind === 'area' && town) {
      return { context: [localName, shortName(town.name)].filter(Boolean).join(', ') };
    }
    return { context: [localName, `County ${county}`].filter(Boolean).join(', ') };
  }
}

/** Gives every place a slug no other place has, keeping the curated slugs. */
export class Slugs {
  private readonly taken = new Set<string>();
  reserve(slug: string): void {
    this.taken.add(slug);
  }
  next(...parts: string[]): string {
    const base = slugify(parts.join(' '));
    let slug = base;
    for (let n = 2; this.taken.has(slug); n++) slug = `${base}-${n}`;
    this.taken.add(slug);
    return slug;
  }
}

/**
 * Is this OSM place the same as a curated one: the same name or alias within 3 km, or a city
 * within 10 km of a curated city? Ireland's cities are all curated, so a city near one is that
 * city, whatever OSM calls it ("Cathair na Gaillimhe" is Galway city).
 */
export function duplicates(candidate: Candidate, curated: readonly Place[]): boolean {
  const name = normalise(candidate.name);
  return curated.some(
    (p) =>
      (candidate.kind === 'city' &&
        p.kind === 'city' &&
        distanceMetres(p.centre, candidate.centre) <= 10_000) ||
      ([p.name, ...(p.aliases ?? [])].some(
        (n) => normalise(n) === name || normalise(shortName(n)) === name,
      ) &&
        distanceMetres(p.centre, candidate.centre) <= 3000),
  );
}

/**
 * The built index's version: the hour it was built (2026110819), or one more than the index it
 * replaces if that's as new. A deploy loads only a newer version, so this way it always loads a
 * rebuild, even one the same day. The first index was numbered by its date alone (20261108).
 */
export function indexVersion(built: Date, replaces: number | null): number {
  const hour = Number(built.toISOString().slice(0, 13).replace(/\D/g, ''));
  return replaces !== null && replaces >= hour ? replaces + 1 : hour;
}

export interface BuildInput {
  counties: CountyShape[];
  candidates: Candidate[];
}

export interface BuildResult {
  places: Array<{ place: Place; src: string; id?: string }>;
  dropped: { outsideRepublic: number; duplicates: number };
}

/** Builds the index: curated places, then OSM's places, townlands, landmarks and streets. */
export function buildIndex({ counties: shapes, candidates }: BuildInput): BuildResult {
  const slugs = new Slugs();
  const out: BuildResult['places'] = [];
  for (const place of curatedPlaces) {
    slugs.reserve(place.slug);
    out.push({ place, src: 'gaff' });
  }
  let outsideRepublic = 0;
  let duplicateCount = 0;
  const located: Array<Candidate & { county: County }> = [];
  for (const candidate of candidates) {
    const county = countyAt(candidate.centre, shapes);
    if (!county) {
      outsideRepublic++;
      continue;
    }
    located.push({ ...candidate, county });
  }

  // Places: drop OSM copies of curated places, and repeats of one place (a node and an area).
  const keptPlaces: Array<Candidate & { county: County }> = [];
  for (const c of located.filter((c) => ['city', 'town', 'village', 'area'].includes(c.kind))) {
    const repeat = keptPlaces.some(
      (k) => normalise(k.name) === normalise(c.name) && distanceMetres(k.centre, c.centre) <= 2000,
    );
    if (duplicates(c, curatedPlaces) || repeat) {
      duplicateCount++;
      continue;
    }
    keptPlaces.push(c);
  }
  const contexts = Contexts.from([...curatedPlaces, ...keptPlaces]);
  for (const c of keptPlaces) {
    const { context } = contexts.contextFor(c.centre, c.county, c.name);
    const areaContext =
      c.kind === 'area'
        ? c.county === 'Dublin'
          ? context
          : `Area in ${context.split(', ').pop()}`
        : undefined;
    out.push({
      place: toPlace(c, slugs.next(c.name), areaContext),
      src: 'osm',
      ...(c.sourceId ? { id: c.sourceId } : {}),
    });
  }
  // Every place keeps its own slug if it's free, otherwise the county is added.
  // (Slugs.next adds -2, -3 when even that is taken.)

  for (const c of located.filter((c) => c.kind === 'townland')) {
    const { town } = contexts.around(c.centre);
    const context = town
      ? `Townland near ${shortName(town.name)}, County ${c.county}`
      : `Townland in County ${c.county}`;
    out.push({
      place: toPlace(c, slugs.next(c.name, c.county), context),
      src: 'osm',
      ...(c.sourceId ? { id: c.sourceId } : {}),
    });
  }

  const landmarks: Array<Candidate & { county: County }> = [];
  for (const c of located.filter((c) => c.kind === 'landmark')) {
    const repeat = landmarks.some(
      (k) => normalise(k.name) === normalise(c.name) && distanceMetres(k.centre, c.centre) <= 500,
    );
    if (repeat) {
      duplicateCount++;
      continue;
    }
    landmarks.push(c);
  }
  for (const c of landmarks) {
    const { context, routingKey } = contexts.contextFor(c.centre, c.county);
    out.push({
      place: toPlace(c, slugs.next(c.name, context), context, routingKey),
      src: 'osm',
      ...(c.sourceId ? { id: c.sourceId } : {}),
    });
  }

  const streets = mergeStreets(located.filter((c) => c.kind === 'street'));
  for (const s of streets) {
    const county = countyAt(s.centre, shapes);
    if (!county) {
      outsideRepublic++;
      continue;
    }
    const { context, routingKey } = contexts.contextFor(s.centre, county);
    out.push({
      place: toPlace({ ...s, county }, slugs.next(s.name, context), context, routingKey),
      src: 'osm',
      ...(s.sourceId ? { id: s.sourceId } : {}),
    });
  }
  return { places: out, dropped: { outsideRepublic, duplicates: duplicateCount } };
}

function toPlace(
  c: Candidate & { county: County },
  slug: string,
  context?: string,
  routingKey?: string,
): Place {
  return {
    slug,
    name: c.name,
    kind: c.kind,
    county: c.county,
    centre: c.centre,
    radiusMetres: Math.round(c.radiusMetres),
    ...(c.irishName ? { irishName: c.irishName } : {}),
    ...(c.aliases?.length ? { aliases: c.aliases } : {}),
    ...(context ? { context } : {}),
    ...(routingKey ? { routingKey } : {}),
    ...(c.landmarkKind ? { landmarkKind: c.landmarkKind } : {}),
    ...(c.line ? { line: c.line } : {}),
    ...(c.bbox ? { bbox: c.bbox } : {}),
    ...(c.population ? { population: c.population } : {}),
  };
}

/** The Dublin districts' names, for tests and checks. */
export const districtNames = dublinDistricts.map((d) => d.name);

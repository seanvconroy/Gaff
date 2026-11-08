/**
 * M56, M57, M71: plain geometry for search, without PostGIS (tech spec, decision 5). At Irish
 * scale a bounding box narrows the rows in SQL, and these functions do the rest.
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance along the ground, in metres (haversine). */
export function distanceMetres(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A box that contains every point within radius metres of the centre. */
export function bboxAround(centre: Point, radiusMetres: number): BBox {
  const dLat = (radiusMetres / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad(centre.lat));
  return {
    minLat: centre.lat - dLat,
    maxLat: centre.lat + dLat,
    minLng: centre.lng - dLng,
    maxLng: centre.lng + dLng,
  };
}

export function bboxOf(points: readonly Point[]): BBox {
  if (points.length === 0) throw new Error('bboxOf needs at least one point');
  return {
    minLat: Math.min(...points.map((p) => p.lat)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
}

export function inBBox(point: Point, box: BBox): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

/** Ray casting over a simple polygon (a drawn search area). Points on an edge may go either way. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** The island of Ireland, generously: anything outside isn't a home Gaff lists. */
export const IRELAND: BBox = { minLat: 51.3, maxLat: 55.5, minLng: -10.7, maxLng: -5.3 };

export function inIreland(point: Point): boolean {
  return inBBox(point, IRELAND);
}

/**
 * M38: when a letter shows only the street and area, renters see a point snapped to a grid of
 * about `metres`, so the map can't pinpoint the door.
 */
export function approximate(point: Point, metres = 150): Point {
  const snap = (value: number, step: number) => Math.round(value / step) * step;
  const stepLat = (metres / EARTH_RADIUS_M) * (180 / Math.PI);
  const lat = snap(point.lat, stepLat);
  // The longitude step comes from the snapped latitude, so snapping a snapped point is a no-op.
  const stepLng = stepLat / Math.cos(rad(lat));
  return { lat: Number(lat.toFixed(6)), lng: Number(snap(point.lng, stepLng).toFixed(6)) };
}

/** A box grown by `metres` on every side. */
export function expandBBox(box: BBox, metres: number): BBox {
  const dLat = (metres / EARTH_RADIUS_M) * (180 / Math.PI);
  const midLat = (box.minLat + box.maxLat) / 2;
  const dLng = dLat / Math.cos(rad(midLat));
  return {
    minLat: box.minLat - dLat,
    maxLat: box.maxLat + dLat,
    minLng: box.minLng - dLng,
    maxLng: box.maxLng + dLng,
  };
}

/** Flat x and y in metres around a latitude: accurate enough over a few kilometres. */
function project(point: Point, originLat: number): { x: number; y: number } {
  return {
    x: rad(point.lng) * EARTH_RADIUS_M * Math.cos(rad(originLat)),
    y: rad(point.lat) * EARTH_RADIUS_M,
  };
}

/** M113: how far a point is from a street, given as runs of points, in metres. */
export function distanceToLineMetres(point: Point, runs: readonly (readonly Point[])[]): number {
  let best = Infinity;
  const p = project(point, point.lat);
  for (const run of runs) {
    if (run.length === 1) best = Math.min(best, distanceMetres(point, run[0]!));
    for (let i = 1; i < run.length; i++) {
      const a = project(run[i - 1]!, point.lat);
      const b = project(run[i]!, point.lat);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
  }
  return best;
}

/** The area of a box, in square kilometres. */
export function bboxAreaKm2(box: BBox): number {
  const height = distanceMetres(
    { lat: box.minLat, lng: box.minLng },
    { lat: box.maxLat, lng: box.minLng },
  );
  const midLat = (box.minLat + box.maxLat) / 2;
  const width = distanceMetres({ lat: midLat, lng: box.minLng }, { lat: midLat, lng: box.maxLng });
  return (height * width) / 1_000_000;
}

/** The area inside a polygon, in square kilometres (the shoelace formula on flat metres). */
export function polygonAreaKm2(polygon: readonly Point[]): number {
  if (polygon.length < 3) return 0;
  const originLat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;
  const flat = polygon.map((p) => project(p, originLat));
  let twice = 0;
  for (let i = 0, j = flat.length - 1; i < flat.length; j = i++) {
    twice += flat[j]!.x * flat[i]!.y - flat[i]!.x * flat[j]!.y;
  }
  return Math.abs(twice) / 2 / 1_000_000;
}

/** M56: a drawn outline with fewer points, keeping its shape to within `metres` (Douglas–Peucker). */
export function simplify(points: readonly Point[], metres: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1;
    let furthest = 0;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToLineMetres(points[i]!, [[points[first]!, points[last]!]]);
      if (d > furthest) {
        furthest = d;
        index = i;
      }
    }
    if (index !== -1 && furthest > metres) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The encoded polyline format (five decimal places), for a drawn shape in a web address. It's a
 * public algorithm for compressing coordinates, not anything from a map provider.
 */
export function encodePolyline(points: readonly Point[]): string {
  let out = '';
  let lastLat = 0;
  let lastLng = 0;
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    encode(lat - lastLat);
    encode(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

/** The points of an encoded polyline; null if it isn't one. */
export function decodePolyline(encoded: string): Point[] | null {
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 0x3f) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (shift > 30) return null;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return null;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

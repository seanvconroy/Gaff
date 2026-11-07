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

import { z } from 'zod';
import {
  bboxOf,
  decodePolyline,
  distanceMetres,
  encodePolyline,
  inIreland,
  pointInPolygon,
  polygonAreaKm2,
  simplify,
  type BBox,
  type Point,
} from '@/domain/places/geo';

/**
 * UX-SR-13 (Q60): areas a renter draws on the map. A search may hold up to five; a home is in
 * the search when the point renters see for it is inside any of them. A drawn area is a fact
 * about where a home is, like a place or a map area: nothing about who is searching.
 *
 * A shape is its corners in order, closed from the last back to the first (the first isn't
 * repeated). In a search's address the shapes are encoded polylines (five decimal places, about
 * a metre), joined by full stops: a public format for compressing coordinates, not anything
 * from a map provider.
 */
export type Shape = Point[];

export const MAX_SHAPES = 5;
export const MIN_SHAPE_POINTS = 3;
/** Enough corners for a coastline traced by hand, and few enough for a web address. */
export const MAX_SHAPE_POINTS = 60;
/** A shape smaller than this (a slip of the finger) isn't an area: about 30 m by 30 m. */
export const MIN_SHAPE_KM2 = 0.001;
/** The largest shape a search may ask for: all of Ireland and a margin (as a map area's). */
export const MAX_SHAPE_KM2 = 600_000;

const SEPARATOR = '.';
const round5 = (n: number) => Number(n.toFixed(5));
const rounded = (point: Point): Point => ({ lat: round5(point.lat), lng: round5(point.lng) });

/** A shape with enough corners, every one in Ireland, and an area that is one. */
export function sensibleShape(shape: readonly Point[]): boolean {
  if (shape.length < MIN_SHAPE_POINTS || shape.length > MAX_SHAPE_POINTS) return false;
  if (!shape.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inIreland(p))) {
    return false;
  }
  const area = polygonAreaKm2(shape);
  return area >= MIN_SHAPE_KM2 && area <= MAX_SHAPE_KM2;
}

/** The same corners, without a repeated closing point or two corners in one spot. */
function distinct(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points.map(rounded)) {
    const last = out[out.length - 1];
    if (!last || last.lat !== point.lat || last.lng !== point.lng) out.push(point);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first!.lat === last!.lat && first!.lng === last!.lng) out.pop();
  return out;
}

/** Drawn areas as an address carries them; null if any part isn't one. */
export function readShapes(value: string | null | undefined): Shape[] | null {
  if (!value || value.length > 4000) return null;
  const parts = value.split(SEPARATOR);
  if (parts.length > MAX_SHAPES) return null;
  const shapes: Shape[] = [];
  for (const part of parts) {
    const points = part ? decodePolyline(part) : null;
    if (!points) return null;
    const shape = distinct(points);
    if (!sensibleShape(shape)) return null;
    shapes.push(shape);
  }
  return shapes.length > 0 ? shapes : null;
}

export function writeShapes(shapes: readonly (readonly Point[])[]): string {
  return shapes.map((shape) => encodePolyline(distinct(shape))).join(SEPARATOR);
}

const pointSchema = z.object({ lat: z.number(), lng: z.number() }).strict();

export const shapesSchema = z
  .array(z.array(pointSchema).min(MIN_SHAPE_POINTS).max(MAX_SHAPE_POINTS))
  .min(1)
  .max(MAX_SHAPES)
  .transform((shapes) => shapes.map(distinct))
  .refine((shapes) => shapes.every(sensibleShape));

/** Whether a point is inside any of the drawn areas. */
export function inShapes(point: Point, shapes: readonly (readonly Point[])[]): boolean {
  return shapes.some((shape) => pointInPolygon(point, shape));
}

/** The box round every drawn area: what the map shows of them. */
export function shapesBox(shapes: readonly (readonly Point[])[]): BBox {
  return bboxOf(shapes.flat());
}

/** The middle of the drawn areas' box: near enough to name them by ("near Rathgar"). */
export function shapesCentre(shapes: readonly (readonly Point[])[]): Point {
  const box = shapesBox(shapes);
  return { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
}

/** The same drawn areas, corner for corner, to the metre an address keeps. */
export function sameShapes(
  a: readonly (readonly Point[])[],
  b: readonly (readonly Point[])[],
): boolean {
  return writeShapes(a) === writeShapes(b);
}

/**
 * A line traced by hand, as a shape: its corners thinned until few enough remain, keeping its
 * outline to within `metres` (and more loosely only if it must, for a very long trace). Null
 * when what was traced isn't an area: too few corners, too small, or off the island.
 */
export function shapeFromTrace(trace: readonly Point[], metres: number): Shape | null {
  const points = distinct(trace);
  if (points.length < MIN_SHAPE_POINTS) return null;
  // Thinned as a closed ring, so the join between the last point and the first is thinned too.
  const ring = (tolerance: number) => distinct(simplify([...points, points[0]!], tolerance));
  let tolerance = Math.max(1, metres);
  let shape = ring(tolerance);
  for (let tries = 0; shape.length > MAX_SHAPE_POINTS && tries < 12; tries++) {
    tolerance *= 1.6;
    shape = ring(tolerance);
  }
  return sensibleShape(shape) ? shape : null;
}

/** A shape's corners kept on the island, for a corner dragged past the edge of the map. */
export function clampPoint(point: Point, box: BBox): Point {
  return {
    lat: Math.min(box.maxLat, Math.max(box.minLat, point.lat)),
    lng: Math.min(box.maxLng, Math.max(box.minLng, point.lng)),
  };
}

/**
 * The shape with one corner moved. Null if that would leave something that isn't an area (two
 * corners in one spot until only two are left, say): the caller keeps the shape as it was.
 */
export function moveCorner(shape: readonly Point[], index: number, to: Point): Shape | null {
  const moved = shape.map((point, i) => (i === index ? rounded(to) : point));
  const whole = distinct(moved);
  return whole.length === shape.length && sensibleShape(whole) ? moved : null;
}

/** The shape with a new corner between corner `after` and the next. */
export function addCorner(shape: readonly Point[], after: number, at: Point): Shape | null {
  if (shape.length >= MAX_SHAPE_POINTS) return null;
  const added = [...shape.slice(0, after + 1), rounded(at), ...shape.slice(after + 1)];
  const whole = distinct(added);
  return whole.length === added.length && sensibleShape(whole) ? added : null;
}

/** The shape without one corner; null when it would no longer be an area. */
export function removeCorner(shape: readonly Point[], index: number): Shape | null {
  const left = shape.filter((_, i) => i !== index);
  return sensibleShape(left) ? left : null;
}

/** The point half way along each side: where a new corner can be pulled out. */
export function midpoints(shape: readonly Point[]): Point[] {
  return shape.map((a, i) => {
    const b = shape[(i + 1) % shape.length]!;
    return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  });
}

/** The area nearest the drawn areas' middle, of these: what a saved drawn area is named by. */
export function nearestTo<P extends { centre: Point }>(
  shapes: readonly (readonly Point[])[],
  places: readonly P[],
): P | null {
  const centre = shapesCentre(shapes);
  let best: P | null = null;
  let least = Infinity;
  for (const place of places) {
    const metres = distanceMetres(centre, place.centre);
    if (metres < least) {
      least = metres;
      best = place;
    }
  }
  return best;
}

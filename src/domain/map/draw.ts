import {
  bboxOf,
  inIreland,
  polygonAreaKm2,
  simplify,
  type BBox,
  type Point,
} from '@/domain/places/geo';
import { MAX_SHAPE_KM2, MAX_SHAPE_POINTS } from '@/domain/search/url';

/**
 * M56, M128: drawing an area on the map. A drag draws round it freehand; a tap adds a corner,
 * so the same shape can be made without dragging (WCAG 2.2, 2.5.7). Either way the outline
 * becomes a shape the web address can hold.
 */

export interface Press {
  /** Where on the screen, in pixels. */
  x: number;
  y: number;
  /** When, in milliseconds. */
  at: number;
}

const TAP_MAX_PX = 8;
const TAP_MAX_MS = 400;
const CLOSE_WITHIN_PX = 24;
const MIN_CORNERS = 3;

/** A press let go where it began: a corner, not the start of a freehand outline. */
export function isTap(down: Press, up: Press): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_PX && up.at - down.at <= TAP_MAX_MS;
}

/** Tapping the first corner again finishes the shape, once it has enough corners. */
export function closesShape(
  corners: number,
  first: { x: number; y: number },
  tap: { x: number; y: number },
): boolean {
  return corners >= MIN_CORNERS && Math.hypot(tap.x - first.x, tap.y - first.y) <= CLOSE_WITHIN_PX;
}

/** Can these corners be finished? ("Done" waits for three.) */
export function canFinish(corners: number): boolean {
  return corners >= MIN_CORNERS;
}

export type DrawnShape =
  | { ok: true; polygon: Point[]; box: BBox }
  | { ok: false; problem: 'too_small' | 'too_big' | 'outside' };

/**
 * The shape an outline makes: simplified until the address can hold it, and refused when it
 * encloses nothing, is bigger than a search can be, or leaves Ireland.
 */
export function shapeFromOutline(outline: readonly Point[]): DrawnShape {
  let polygon = simplify(outline, 25);
  for (let metres = 50; polygon.length > MAX_SHAPE_POINTS; metres *= 2) {
    polygon = simplify(outline, metres);
  }
  const area = polygonAreaKm2(polygon);
  if (polygon.length < MIN_CORNERS || area === 0) return { ok: false, problem: 'too_small' };
  if (area > MAX_SHAPE_KM2) return { ok: false, problem: 'too_big' };
  if (!polygon.every(inIreland)) return { ok: false, problem: 'outside' };
  return { ok: true, polygon, box: bboxOf(polygon) };
}

import { bboxAround, expandBBox, IRELAND, type BBox, type Point } from '@/domain/places/geo';
import type { SearchPlace } from '@/domain/search/places';

/**
 * M127: when the map may move by itself. It fits the search's area when the area changes: a new
 * place, a new distance, a map area from a shared link or Back, or its removal. A filter never
 * moves it, and neither does the map area the renter has just searched by moving the map.
 */

/** What the map shows of a search's "Where": its box, and what to draw on it. */
export type MapArea =
  | { kind: 'everywhere' }
  | { kind: 'place'; slug: string; box: BBox }
  | {
      kind: 'near';
      slug: string;
      centre: Point;
      withinMetres: number;
      /** A street's line, drawn on the map (its credit is OpenStreetMap's, M137). */
      line: Point[][] | null;
      box: BBox;
    }
  | { kind: 'box'; box: BBox };

/** The map's area for a search: its map area, its place, or all of Ireland. */
export function mapAreaOf(where: SearchPlace | null, box: BBox | null | undefined): MapArea {
  if (box) return { kind: 'box', box };
  if (!where) return { kind: 'everywhere' };
  if (where.kind === 'routing_key') return { kind: 'everywhere' };
  const { place } = where;
  if (where.kind === 'near') {
    const around = bboxAround(place.centre, where.withinMetres);
    return {
      kind: 'near',
      slug: where.slug,
      centre: place.centre,
      withinMetres: where.withinMetres,
      line: place.line ?? null,
      box: place.bbox ? expandBBox(place.bbox, where.withinMetres) : around,
    };
  }
  return {
    kind: 'place',
    slug: where.slug,
    box: place.bbox ?? bboxAround(place.centre, place.radiusMetres),
  };
}

const point5 = (n: number) => n.toFixed(5);
const boxKey = (box: BBox) =>
  [box.minLng, box.minLat, box.maxLng, box.maxLat].map(point5).join(',');

/** What the map's view depends on: the search's area, and nothing else about the search. */
export function cameraKey(area: MapArea): string {
  switch (area.kind) {
    case 'everywhere':
      return 'everywhere';
    case 'place':
      return `place:${area.slug}`;
    case 'near':
      return `near:${area.slug}:${area.withinMetres}`;
    case 'box':
      return `box:${boxKey(area.box)}`;
  }
}

/** The same box, to the five decimal places a web address keeps (about a metre). */
export function sameBox(a: BBox, b: BBox): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 0.000015;
  return (
    close(a.minLat, b.minLat) &&
    close(a.minLng, b.minLng) &&
    close(a.maxLat, b.maxLat) &&
    close(a.maxLng, b.maxLng)
  );
}

/**
 * Should the map fit this area? Yes when the area has changed, unless it's the map area the
 * renter's own move made (`renterBox`): the map is already there, and fitting it again would
 * creep outwards.
 */
export function shouldFit(
  previousKey: string | null,
  area: MapArea,
  renterBox: BBox | null,
): boolean {
  if (previousKey === cameraKey(area)) return false;
  if (area.kind === 'box' && renterBox && sameBox(area.box, renterBox)) return false;
  return true;
}

/** Where the map starts: the search's area, or all of Ireland. */
export function startBox(area: MapArea): BBox {
  return area.kind === 'everywhere' ? IRELAND : area.box;
}

/** The map can't wander: the island, with room for the coast to sit clear of the edge. */
export const MAP_BOUNDS: BBox = expandBBox(IRELAND, 60_000);

/**
 * The part of a view that's over Ireland, or null when none of it is. Every home is in Ireland,
 * so a view zoomed out past the island searches the island: a map area is never too big to ask
 * for, and never names anywhere Gaff has no homes.
 */
export function clampToIreland(view: BBox): BBox | null {
  const box = {
    minLat: Math.max(view.minLat, IRELAND.minLat),
    maxLat: Math.min(view.maxLat, IRELAND.maxLat),
    minLng: Math.max(view.minLng, IRELAND.minLng),
    maxLng: Math.min(view.maxLng, IRELAND.maxLng),
  };
  return box.minLat < box.maxLat && box.minLng < box.maxLng ? box : null;
}

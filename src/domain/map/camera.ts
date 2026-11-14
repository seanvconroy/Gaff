import { bboxAround, expandBBox, IRELAND, type BBox } from '@/domain/places/geo';
import type { SearchArea } from '@/domain/search/places';

/**
 * M127: when the map may move by itself. It fits the search's area when the area changes: a
 * new place, a new distance, a drawn shape, or its removal. A filter, the order or the page
 * never moves it, and neither does the map area the renter has just made by moving the map.
 */

const point5 = (n: number) => n.toFixed(5);
const boxKey = (box: BBox) =>
  [box.minLng, box.minLat, box.maxLng, box.maxLat].map(point5).join(',');

/** What the map's view depends on: the search's area, and nothing else about the search. */
export function cameraKey(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return 'everywhere';
    case 'county':
      return `county:${area.place.slug}`;
    case 'routing_key':
      return `key:${area.routingKey}`;
    case 'radius':
      return `place:${area.place.slug}:${area.plusKm}`;
    case 'near':
      return `near:${area.place.slug}:${area.withinKm}`;
    case 'map':
      return `map:${boxKey(area.box)}`;
    case 'shape':
      return `shape:${area.polygon.map((p) => `${point5(p.lat)},${point5(p.lng)}`).join(';')}`;
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
  area: SearchArea,
  renterBox: BBox | null,
): boolean {
  if (previousKey === cameraKey(area)) return false;
  if (area.kind === 'map' && renterBox && sameBox(area.box, renterBox)) return false;
  return true;
}

/** Where the map starts: the place and its distance, the map area or shape, or all of Ireland. */
export function startBox(area: SearchArea): BBox {
  switch (area.kind) {
    case 'radius':
    case 'near':
    case 'map':
    case 'shape':
      return area.box;
    case 'county':
      return bboxAround(area.place.centre, area.place.radiusMetres);
    case 'routing_key':
      return area.place ? bboxAround(area.place.centre, area.place.radiusMetres) : IRELAND;
    case 'everywhere':
      return IRELAND;
  }
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

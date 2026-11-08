import type { Gazetteer } from '@/domain/places/gazetteer';
import {
  bboxAreaKm2,
  bboxOf,
  decodePolyline,
  encodePolyline,
  inIreland,
  polygonAreaKm2,
  type BBox,
  type Point,
} from '@/domain/places/geo';
import { readFilters, writeFilters, type Filters } from './filters';
import { areaPath, resolvePlacePath, searchArea, type PlaceArea, type SearchArea } from './places';

/**
 * M58, M113, M57: the web address is the search. The path names the place; the query holds the
 * filters, then the distance (`km`), the map area (`bbox`) or a drawn shape (`shape`), then the
 * order, the page and, on phones, the map view. One canonical order, so a search can be shared,
 * bookmarked, cached and saved as an alert.
 */

/** Limits on what a web address can ask for (tech spec, security and abuse). */
/** All of Ireland and a margin around it: a map zoomed out to the whole country. */
export const MAX_BBOX_KM2 = 600_000;
export const MAX_SHAPE_POINTS = 100;
export const MAX_SHAPE_KM2 = 2_000;

export type View = 'list' | 'map';

export interface Search {
  area: SearchArea;
  filters: Filters;
  view: View;
}

const round5 = (n: number) => Number(n.toFixed(5));

/** "w,s,e,n" with five decimals; null if it isn't a sensible box over Ireland. */
export function readBBox(value: string | null): BBox | null {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng >= maxLng || minLat >= maxLat) return null;
  const box = { minLat, minLng, maxLat, maxLng };
  const centre = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  if (!inIreland(centre) || bboxAreaKm2(box) > MAX_BBOX_KM2) return null;
  return {
    minLat: round5(minLat),
    minLng: round5(minLng),
    maxLat: round5(maxLat),
    maxLng: round5(maxLng),
  };
}

export function writeBBox(box: BBox): string {
  return [box.minLng, box.minLat, box.maxLng, box.maxLat].map((n) => round5(n)).join(',');
}

/** A drawn outline from the address; null if it's malformed, too detailed or too big. */
export function readShape(value: string | null): Point[] | null {
  if (!value) return null;
  const points = decodePolyline(value);
  if (!points || points.length < 3 || points.length > MAX_SHAPE_POINTS) return null;
  if (!points.every(inIreland)) return null;
  if (polygonAreaKm2(points) > MAX_SHAPE_KM2 || polygonAreaKm2(points) === 0) return null;
  return points;
}

export function writeShape(points: readonly Point[]): string {
  return encodePolyline(points);
}

/** The search area for a place and the query's distance, map area or shape. */
export function withAreaParams(base: PlaceArea, params: URLSearchParams, g: Gazetteer): SearchArea {
  const km = params.has('km') ? Number(params.get('km')) : undefined;
  let from: PlaceArea = base;
  if (km !== undefined && Number.isFinite(km) && (base.kind === 'radius' || base.kind === 'near')) {
    from = searchArea(base.place.slug, g, km) ?? base;
  }
  const polygon = readShape(params.get('shape'));
  if (polygon) return { kind: 'shape', polygon, box: bboxOf(polygon), from };
  const box = readBBox(params.get('bbox'));
  if (box) return { kind: 'map', box, from };
  return from;
}

/** The query for an area's own parameters: `km`, then `bbox` or `shape`. */
export function areaParams(area: SearchArea): Array<[string, string]> {
  const params: Array<[string, string]> = [];
  const base = area.kind === 'map' || area.kind === 'shape' ? area.from : area;
  if (base.kind === 'radius' && base.plusKm > 0) params.push(['km', String(base.plusKm)]);
  if (base.kind === 'near' && base.withinKm !== base.defaultKm) {
    params.push(['km', String(base.withinKm)]);
  }
  if (area.kind === 'map') params.push(['bbox', writeBBox(area.box)]);
  if (area.kind === 'shape') params.push(['shape', writeShape(area.polygon)]);
  return params;
}

/** The canonical query string for a search: filters, area, order, page, view. */
export function searchQuery(area: SearchArea, filters: Partial<Filters>, view: View = 'list') {
  const params = new URLSearchParams(writeFilters({ ...filters, sort: 'best', page: 1 }));
  for (const [key, value] of areaParams(area)) params.set(key, value);
  if (filters.sort && filters.sort !== 'best') params.set('sort', filters.sort);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (view === 'map') params.set('view', 'map');
  return params.toString();
}

/** The web address of a search, in its one canonical form. */
export function searchHref(area: SearchArea, filters: Partial<Filters>, view: View = 'list') {
  const query = searchQuery(area, filters, view);
  return query ? `${areaPath(area)}?${query}` : areaPath(area);
}

export type ResolvedSearch =
  { kind: 'search'; search: Search; path: string } | { kind: 'redirect'; path: string };

/** Reads a whole search from its path and query; null for a place Gaff doesn't know. */
export function readSearch(
  segments: readonly string[],
  params: URLSearchParams,
  g: Gazetteer,
): ResolvedSearch | null {
  const resolved = resolvePlacePath(segments, g);
  if (!resolved) return null;
  if (resolved.kind === 'redirect') {
    const query = params.toString();
    return { kind: 'redirect', path: query ? `${resolved.path}?${query}` : resolved.path };
  }
  const area = withAreaParams(resolved.area, params, g);
  const filters = readFilters(params);
  const view: View = params.get('view') === 'map' ? 'map' : 'list';
  return { kind: 'search', search: { area, filters, view }, path: resolved.path };
}

/** The area of a saved search (M86), from its address and query; null if no longer known. */
export function savedSearchArea(areaPath: string, query: string, g: Gazetteer): SearchArea | null {
  const resolved = resolvePlacePath(areaPath.split('/').filter(Boolean).slice(1), g);
  if (resolved?.kind !== 'area') return null;
  return withAreaParams(resolved.area, new URLSearchParams(query), g);
}

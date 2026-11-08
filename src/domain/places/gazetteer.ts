import type { counties } from '@/domain/lettings/new-letting';
import type { BBox, Point } from './geo';
import { slugify } from './slug';

/**
 * M56, M62, M113: the places renters search by. The place index (`places` in Postgres, built
 * from open data, ADR-0027) holds every county, city, town, village, area, Dublin district,
 * townland, street and landmark in the Republic. Domain code never loads it: the server passes a
 * Gazetteer in, holding the places with area pages, plus any street or landmark a search names.
 */

export type County = (typeof counties)[number];

export const placeKinds = [
  'county',
  'city',
  'town',
  'village',
  'district',
  'area',
  'townland',
  'street',
  'landmark',
] as const;
export type PlaceKind = (typeof placeKinds)[number];

export const landmarkKinds = ['college', 'hospital', 'station', 'park', 'shopping_centre'] as const;
export type LandmarkKind = (typeof landmarkKinds)[number];

export interface Place {
  slug: string;
  name: string;
  kind: PlaceKind;
  county: County;
  centre: Point;
  /** How far the place reaches from its centre, when it has no boundary. */
  radiusMetres: number;
  /** Dublin districts: their routing key. */
  routingKey?: string;
  aliases?: string[];
  irishName?: string;
  /** Shown under the name: "Rathgar, Dublin 6". Without it, the words come from the kind. */
  context?: string;
  landmarkKind?: LandmarkKind;
  /** Streets: the line, as one or more runs of points. */
  line?: Point[][];
  bbox?: BBox;
  population?: number;
  /** Live homes in the place, refreshed by a job (M121). */
  liveHomes?: number;
}

/** Kinds with an area page (M62). Townlands, streets and landmarks are searched "near" (M113). */
const areaPageKinds: ReadonlySet<PlaceKind> = new Set([
  'county',
  'city',
  'town',
  'village',
  'district',
  'area',
]);

export function hasAreaPage(place: Pick<Place, 'kind'>): boolean {
  return areaPageKinds.has(place.kind);
}

export interface Gazetteer {
  /** Every place with an area page. */
  readonly places: readonly Place[];
  bySlug(slug: string): Place | undefined;
  byRoutingKey(routingKey: string): Place | undefined;
  county(name: string): Place | undefined;
}

/**
 * A gazetteer over these places. `extra` adds streets, landmarks or townlands that a search or a
 * saved search names, so they can be found by slug without loading the whole index.
 */
export function gazetteer(places: readonly Place[], extra: readonly Place[] = []): Gazetteer {
  const withPages = places.filter(hasAreaPage);
  const bySlug = new Map<string, Place>();
  for (const place of [...places, ...extra]) bySlug.set(place.slug, place);
  const byRoutingKey = new Map<string, Place>();
  for (const place of withPages) {
    if (place.routingKey && !byRoutingKey.has(place.routingKey)) {
      byRoutingKey.set(place.routingKey, place);
    }
  }
  const counties = new Map(
    withPages.filter((p) => p.kind === 'county').map((p) => [slugify(p.name), p] as const),
  );
  return {
    places: withPages,
    bySlug: (slug) => bySlug.get(slug),
    byRoutingKey: (key) => byRoutingKey.get(key),
    county: (name) => counties.get(slugify(name)),
  };
}

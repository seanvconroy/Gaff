import type { counties } from '@/domain/lettings/new-letting';
import type { BBox, Point } from './geo';
import { slugify } from './slug';

/**
 * M56, M113 (ADR-0017): the places renters search by. The place
 * index (`places` in Postgres, built from OpenStreetMap by `scripts/places`) holds every county,
 * city, town, village, area, Dublin district, townland, street and landmark in the Republic.
 * Domain code never loads it: the server passes a Gazetteer in, holding the areas (the places a
 * search can be "in"), plus any street, landmark or townland a search names.
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
  /** A stable slug, as a search's address carries it: "ranelagh", "dublin-6w". */
  slug: string;
  name: string;
  kind: PlaceKind;
  county: County;
  centre: Point;
  /** How far the place reaches from its centre, when it has no boundary. */
  radiusMetres: number;
  /** Dublin districts: their routing key. Streets and landmarks: the one at their centre. */
  routingKey?: string;
  aliases?: string[];
  irishName?: string;
  /** Where it is: "Rathgar, Dublin 6", "Dublin 6". Without it, the words come from the kind. */
  context?: string;
  landmarkKind?: LandmarkKind;
  /** Streets: the line, as one or more runs of points. */
  line?: Point[][];
  bbox?: BBox;
  population?: number;
  /** M121: live homes in the place, counted when suggestions are made. */
  liveHomes?: number;
}

/**
 * Kinds a search can be "in": the home's address names them (UX-SR-4). Townlands, streets and
 * landmarks are searched "near" (M113).
 */
const areaKinds: ReadonlySet<PlaceKind> = new Set([
  'county',
  'city',
  'town',
  'village',
  'district',
  'area',
]);

export function isArea(place: Pick<Place, 'kind'>): boolean {
  return areaKinds.has(place.kind);
}

export interface Gazetteer {
  /** Every area (county, city, town, village, district, area). */
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
  const areas = places.filter(isArea);
  const bySlug = new Map<string, Place>();
  for (const place of [...places, ...extra]) bySlug.set(place.slug, place);
  const byRoutingKey = new Map<string, Place>();
  for (const place of areas) {
    if (place.kind === 'district' && place.routingKey && !byRoutingKey.has(place.routingKey)) {
      byRoutingKey.set(place.routingKey, place);
    }
  }
  const counties = new Map(
    areas.filter((p) => p.kind === 'county').map((p) => [slugify(p.name), p] as const),
  );
  return {
    places: areas,
    bySlug: (slug) => bySlug.get(slug),
    byRoutingKey: (key) => byRoutingKey.get(key),
    county: (name) => counties.get(slugify(name)),
  };
}

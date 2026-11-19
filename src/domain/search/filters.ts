import { z } from 'zod';
import { type propertyTypes } from '@/domain/lettings/new-letting';
import { bboxAreaKm2, inIreland, type BBox } from '@/domain/places/geo';
import { canonicalPlaceSlug, MAX_PLACE_SLUG, PLACE_SLUG } from './place-slug';

/**
 * UX-SR-4, UX-MT-12: everything a search can hold, and nothing else. These are facts about a
 * home and the terms of its let: where, the most rent, bedrooms, the move-in date, how long,
 * how many people, pets, and the home's own facts (furnished, parking, its type). There is no
 * field for anything about who the renter is, and no free text: whatever else a sentence says
 * has nowhere to go (rule 3).
 *
 * NOT HERE YET: "outdoor space", which section 6 lists among a home's facts. A letting doesn't
 * record it, so there is nothing to match it against; when a letting does, it is one more field.
 * Step-free access and a lift are the same, and a search for them is never kept (UX-MT-12).
 */

export const stays = ['under_year', 'year', 'longer'] as const;
export type Stay = (typeof stays)[number];

/** The kinds of home a renter can ask for. "Other" is a lister's answer, not a renter's. */
export const searchTypes = [
  'apartment',
  'house',
  'duplex',
  'studio',
] as const satisfies ReadonlyArray<keyof typeof propertyTypes>;
export type SearchType = (typeof searchTypes)[number];

/** "4" means four or more. */
export const MAX_BEDS = 4;
export const MAX_PEOPLE = 10;
/**
 * M113: how far a "near" search reaches, in kilometres, when the renter changes it ("Within").
 * The default is 1 km in Dublin or a city and 3 km elsewhere (places.ts).
 */
export const WITHIN_KM = [0.5, 1, 2, 3, 5] as const;
export type WithinKm = (typeof WITHIN_KM)[number];

/** M57: the largest map area a search may ask for: all of Ireland and a margin around it. */
export const MAX_BBOX_KM2 = 600_000;

const round5 = (n: number) => Number(n.toFixed(5));

/** M57: a map area as its address carries it, "west,south,east,north"; null if it isn't one. */
export function readBBox(value: string | null | undefined): BBox | null {
  if (!value || value.length > 80) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts.map(round5) as [number, number, number, number];
  const box = { minLat, minLng, maxLat, maxLng };
  return sensibleBox(box) ? box : null;
}

export function writeBBox(box: BBox): string {
  return [box.minLng, box.minLat, box.maxLng, box.maxLat].map(round5).join(',');
}

/** A box with its corners the right way round, centred over Ireland, and not too big. */
function sensibleBox(box: BBox): boolean {
  if (box.minLng >= box.maxLng || box.minLat >= box.maxLat) return false;
  const centre = { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
  return inIreland(centre) && bboxAreaKm2(box) <= MAX_BBOX_KM2;
}

const bboxSchema = z
  .object({ minLat: z.number(), minLng: z.number(), maxLat: z.number(), maxLng: z.number() })
  .strict()
  .refine(sensibleBox)
  .transform((box) => ({
    minLat: round5(box.minLat),
    minLng: round5(box.minLng),
    maxLat: round5(box.maxLat),
    maxLng: round5(box.maxLng),
  }));

/** Euros a month: the same bounds as a letting's rent (MIN_RENT_CENTS, MAX_RENT_CENTS). */
export const MIN_SEARCH_RENT = 100;
export const MAX_SEARCH_RENT = 20_000;

export const searchFiltersSchema = z
  .object({
    /**
     * A place's slug in Gaff's own place index (places.ts, ADR-0018). Its shape is checked here;
     * whether the index knows it is checked where the index is, on the server, and a place it
     * doesn't know is left out of the search (src/server/places).
     */
    where: z
      .string()
      .max(MAX_PLACE_SLUG)
      .transform(canonicalPlaceSlug)
      .pipe(z.string().regex(PLACE_SLUG))
      .optional(),
    /**
     * M113: "Within", for a street, landmark or townland to search near. It means nothing for an
     * area, and is left out where the place isn't one to search near (src/server/search).
     */
    within: z
      .number()
      .refine((km) => (WITHIN_KM as readonly number[]).includes(km))
      .optional(),
    /**
     * M57: "Search this area" on the map: the homes whose point is in this box. It takes the
     * place's role: a search has a place or a map area, never both.
     */
    box: bboxSchema.optional(),
    /** The most rent a month, in whole euros. */
    maxRent: z.number().int().min(MIN_SEARCH_RENT).max(MAX_SEARCH_RENT).optional(),
    beds: z.number().int().min(1).max(MAX_BEDS).optional(),
    /** When the renter wants to move in: "2027-01-01". */
    moveIn: z.iso.date().optional(),
    stay: z.enum(stays).optional(),
    people: z.number().int().min(1).max(MAX_PEOPLE).optional(),
    /** True: the renter has a pet. False: they don't, which asks nothing of a home. */
    pets: z.boolean().optional(),
    furnished: z.literal(true).optional(),
    parking: z.literal(true).optional(),
    type: z.enum(searchTypes).optional(),
  })
  .strict();

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type FilterKey = keyof SearchFilters;

/** The order filters are shown in, as chips and in the Filters sheet. */
export const filterKeys = [
  'where',
  'within',
  'box',
  'beds',
  'maxRent',
  'moveIn',
  'stay',
  'people',
  'pets',
  'type',
  'furnished',
  'parking',
] as const satisfies readonly FilterKey[];

/**
 * UX-SR-12: the names the filters carry in a search's address. The address holds these values
 * and nothing else: never the sentence that was typed, and nothing about a person (rule 8).
 */
export const paramNames: Record<FilterKey, string> = {
  where: 'where',
  within: 'km',
  box: 'area',
  maxRent: 'max',
  beds: 'beds',
  moveIn: 'from',
  stay: 'stay',
  people: 'people',
  pets: 'pets',
  furnished: 'furnished',
  parking: 'parking',
  type: 'type',
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const wholeNumber = (value: string | undefined): number | undefined =>
  value && /^\d{1,6}$/.test(value) ? Number(value) : undefined;

const decimal = (value: string | undefined): number | undefined =>
  value && /^\d{1,2}(?:\.\d)?$/.test(value) ? Number(value) : undefined;

/**
 * A search has a place or a map area, never both; and "Within" only with a place. Whatever an
 * address or a saved search holds, the search is made whole by these two rules.
 */
export function wholeSearch(filters: SearchFilters): SearchFilters {
  const whole = { ...filters };
  if (whole.box) delete whole.where;
  if (!whole.where) delete whole.within;
  return whole;
}

/**
 * A search from its address. Each value is checked on its own: one that isn't allowed is left
 * out, and the rest of the search still works. Unknown names are ignored.
 */
export function filtersFromParams(params: Params): SearchFilters {
  const raw: Record<string, unknown> = {
    where: first(params[paramNames.where]),
    within: decimal(first(params[paramNames.within])),
    box: readBBox(first(params[paramNames.box])) ?? undefined,
    maxRent: wholeNumber(first(params[paramNames.maxRent])),
    beds: wholeNumber(first(params[paramNames.beds])),
    moveIn: first(params[paramNames.moveIn]),
    stay: first(params[paramNames.stay]),
    people: wholeNumber(first(params[paramNames.people])),
    pets: { yes: true, no: false }[first(params[paramNames.pets]) ?? ''],
    furnished: first(params[paramNames.furnished]) === 'yes' ? true : undefined,
    parking: first(params[paramNames.parking]) === 'yes' ? true : undefined,
    type: first(params[paramNames.type]),
  };
  const filters: Record<string, unknown> = {};
  for (const key of filterKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    const checked = searchFiltersSchema.shape[key].safeParse(value);
    if (checked.success && checked.data !== undefined) filters[key] = checked.data;
  }
  return wholeSearch(filters as SearchFilters);
}

/** A search's values as its address carries them, in the order of `filterKeys`. */
export function filtersToParams(filters: SearchFilters): Array<[string, string]> {
  const safe = wholeSearch(searchFiltersSchema.parse(filters));
  const pairs: Array<[string, string]> = [];
  for (const key of filterKeys) {
    const value = safe[key];
    if (value === undefined) continue;
    const text =
      typeof value === 'object'
        ? writeBBox(value)
        : typeof value === 'boolean'
          ? key === 'pets'
            ? value
              ? 'yes'
              : 'no'
            : 'yes'
          : String(value);
    pairs.push([paramNames[key], text]);
  }
  return pairs;
}

/**
 * The address of a search (UX-SR-12), to share or reopen. `keep` carries the one setting of the
 * first screen that isn't a filter: `rent=1`, for someone who chose renting without finishing
 * first run (src/domain/navigation/context.ts).
 */
export function searchHref(filters: SearchFilters, keep: { rent?: boolean } = {}): string {
  const params = new URLSearchParams(filtersToParams(filters));
  if (keep.rent) params.set('rent', '1');
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export function hasFilters(filters: SearchFilters): boolean {
  return filterKeys.some((key) => filters[key] !== undefined);
}

/** The search without one of its filters: what a chip's "Remove" leads to. */
export function without(filters: SearchFilters, key: FilterKey): SearchFilters {
  const rest = { ...filters };
  delete rest[key];
  return rest;
}

import { berBand } from '@/domain/homes/ber';
import {
  accessibilityFeatures,
  furnishing,
  propertyTypes,
  type AccessibilityFeature,
  type PropertyType,
} from '@/domain/homes/facts';

/**
 * M58: what a renter can filter on. Filters live in the web address (M58), in one canonical
 * order, so a search can be shared, bookmarked, cached and turned into an alert (M86).
 */

export const sorts = ['best', 'newest', 'cheapest', 'dearest'] as const;
export type Sort = (typeof sorts)[number];
export const BER_BANDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export interface Filters {
  minRent?: number;
  maxRent?: number;
  beds?: number;
  baths?: number;
  types?: PropertyType[];
  availableBy?: string;
  furnishing?: Array<keyof typeof furnishing>;
  pets?: boolean;
  parking?: boolean;
  outdoor?: boolean;
  access?: AccessibilityFeature[];
  minBer?: (typeof BER_BANDS)[number];
  listedWithin?: '1d' | '7d';
  sort: Sort;
  page: number;
}

const int = (value: string | null, min: number, max: number): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};
const list = <T extends string>(
  value: string | null,
  allowed: readonly string[],
): T[] | undefined => {
  const items = (value ?? '').split(',').filter((v): v is T => allowed.includes(v));
  return items.length ? [...new Set(items)].sort() : undefined;
};

/** Reads filters from a web address's query string. Anything unknown or out of range is ignored. */
export function readFilters(params: URLSearchParams): Filters {
  const by = params.get('by');
  const minBer = params.get('ber');
  const within = params.get('new');
  const sort = params.get('sort');
  const filters: Filters = {
    minRent: int(params.get('min'), 0, 50_000),
    maxRent: int(params.get('max'), 0, 50_000),
    beds: int(params.get('beds'), 0, 10),
    baths: int(params.get('baths'), 1, 10),
    types: list<PropertyType>(params.get('type'), Object.keys(propertyTypes)),
    availableBy: by && /^\d{4}-\d{2}-\d{2}$/.test(by) ? by : undefined,
    furnishing: list<keyof typeof furnishing>(params.get('furnished'), Object.keys(furnishing)),
    pets: params.get('pets') === '1' || undefined,
    parking: params.get('parking') === '1' || undefined,
    outdoor: params.get('outdoor') === '1' || undefined,
    access: list<AccessibilityFeature>(params.get('access'), Object.keys(accessibilityFeatures)),
    minBer: BER_BANDS.includes(minBer as never) ? (minBer as Filters['minBer']) : undefined,
    listedWithin: within === '1d' || within === '7d' ? within : undefined,
    sort: sorts.includes(sort as Sort) ? (sort as Sort) : 'best',
    page: int(params.get('page'), 1, 500) ?? 1,
  };
  if (
    filters.minRent !== undefined &&
    filters.maxRent !== undefined &&
    filters.minRent > filters.maxRent
  ) {
    [filters.minRent, filters.maxRent] = [filters.maxRent, filters.minRent];
  }
  return filters;
}

/** The canonical query string for filters: same filters, same address. */
export function writeFilters(filters: Partial<Filters>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  };
  set('min', filters.minRent);
  set('max', filters.maxRent);
  set('beds', filters.beds);
  set('baths', filters.baths);
  set('type', filters.types?.join(','));
  set('by', filters.availableBy);
  set('furnished', filters.furnishing?.join(','));
  set('pets', filters.pets ? 1 : undefined);
  set('parking', filters.parking ? 1 : undefined);
  set('outdoor', filters.outdoor ? 1 : undefined);
  set('access', filters.access?.join(','));
  set('ber', filters.minBer);
  set('new', filters.listedWithin);
  if (filters.sort && filters.sort !== 'best') set('sort', filters.sort);
  if (filters.page && filters.page > 1) set('page', filters.page);
  return params.toString();
}

/** The facts of a public listing that filters read. Nothing about any person. */
export interface FilterableListing {
  rentCents: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  availableFrom: string;
  furnished: string;
  petsConsidered: boolean;
  berBand: string | null;
  facts: { parking?: string | null; outdoorSpace?: string | null; accessibility?: string[] };
  publishedAt: Date;
}

/** M58: does this listing pass the renter's filters? (Also used for alerts, M86.) */
export function matchesFilters(
  listing: FilterableListing,
  filters: Filters,
  now = new Date(),
): boolean {
  const euros = listing.rentCents / 100;
  if (filters.minRent !== undefined && euros < filters.minRent) return false;
  if (filters.maxRent !== undefined && euros > filters.maxRent) return false;
  if (filters.beds !== undefined && listing.bedrooms < filters.beds) return false;
  if (filters.baths !== undefined && listing.bathrooms < filters.baths) return false;
  if (filters.types && !filters.types.includes(listing.propertyType as PropertyType)) return false;
  if (filters.availableBy && listing.availableFrom > filters.availableBy) return false;
  if (filters.furnishing && !filters.furnishing.includes(listing.furnished as never)) return false;
  if (filters.pets && !listing.petsConsidered) return false;
  if (filters.parking && (!listing.facts.parking || listing.facts.parking === 'none')) return false;
  if (filters.outdoor && (!listing.facts.outdoorSpace || listing.facts.outdoorSpace === 'none')) {
    return false;
  }
  if (filters.access?.some((f) => !(listing.facts.accessibility ?? []).includes(f))) return false;
  if (filters.minBer) {
    if (!listing.berBand || listing.berBand > filters.minBer) return false;
  }
  if (filters.listedWithin) {
    const days = filters.listedWithin === '1d' ? 1 : 7;
    if (now.getTime() - listing.publishedAt.getTime() > days * 86_400_000) return false;
  }
  return true;
}

export { berBand };

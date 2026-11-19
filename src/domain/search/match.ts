import type { Criteria } from '@/domain/criteria/criteria';
import type { furnishing, parkingOptions, propertyTypes } from '@/domain/lettings/new-letting';
import { inBBox } from '@/domain/places/geo';
import type { SearchFilters, SearchType, Stay } from './filters';
import { type Gazetteer, type HomeAddress, placeHasHome, searchPlace } from './places';

/**
 * UX-SR-7, UX-MT-14, UX-MT-15: which homes fit a search. It reads a home's own facts and the
 * terms its lister set (the four fixed criteria) against what the renter asked, and nothing
 * else (a home's point, for a map area or a "near" search, is a fact about the home). It ranks
 * homes for a renter, never renters for anyone: nothing about who is searching
 * reaches an operator, and no operator can pay for position (rule 1, rule 3).
 *
 * Homes that fit everything come first, newest first. Homes that miss on one point follow, each
 * with that point, newest first. "Where" isn't a point a home can be close on: a home somewhere
 * else isn't close to what was asked.
 */

/** What a search reads of a live home: its facts and its letting's terms. */
export interface SearchableHome extends HomeAddress {
  id: string;
  rentCents: number;
  /** "2026-12-01". */
  availableFrom: string;
  propertyType: keyof typeof propertyTypes | string;
  bedrooms: number;
  furnished: keyof typeof furnishing | string | null;
  parking: keyof typeof parkingOptions | string | null;
  criteria: Criteria | null;
  /** When it went live: newest first. */
  liveAt: Date;
}

/** The one point a home misses on, with what the home offers and what was asked. */
export type Miss =
  | { point: 'maxRent'; rentCents: number; asked: number }
  | { point: 'beds'; bedrooms: number; asked: number }
  | { point: 'moveIn'; availableFrom: string; asked: string }
  | { point: 'moveInBy'; moveInBy: string; asked: string }
  | { point: 'stay'; minStayMonths: number; asked: Stay }
  | { point: 'people'; maxOccupants: number; asked: number }
  | { point: 'pets' }
  | { point: 'furnished'; furnished: string | null }
  | { point: 'parking'; parking: string | null }
  | { point: 'type'; propertyType: string; asked: SearchType };

/** The longest stay each answer can promise. "Longer" is more than a year, with no end said. */
const stayFits = (asked: Stay, minStayMonths: number): boolean =>
  asked === 'longer' || (asked === 'year' ? minStayMonths <= 12 : minStayMonths < 12);

/** Every point on which a home misses what was asked. Empty: it fits. */
export function missesOf(home: SearchableHome, filters: SearchFilters): Miss[] {
  const misses: Miss[] = [];
  if (filters.maxRent !== undefined && home.rentCents > filters.maxRent * 100) {
    misses.push({ point: 'maxRent', rentCents: home.rentCents, asked: filters.maxRent });
  }
  if (filters.beds !== undefined && home.bedrooms < filters.beds) {
    misses.push({ point: 'beds', bedrooms: home.bedrooms, asked: filters.beds });
  }
  if (filters.moveIn !== undefined) {
    // One point, the move-in date, whichever side of it the home is on.
    if (home.availableFrom > filters.moveIn) {
      misses.push({ point: 'moveIn', availableFrom: home.availableFrom, asked: filters.moveIn });
    } else if (home.criteria?.moveInBy && home.criteria.moveInBy < filters.moveIn) {
      misses.push({ point: 'moveInBy', moveInBy: home.criteria.moveInBy, asked: filters.moveIn });
    }
  }
  const minStay = home.criteria?.minStayMonths;
  if (filters.stay !== undefined && minStay && !stayFits(filters.stay, minStay)) {
    misses.push({ point: 'stay', minStayMonths: minStay, asked: filters.stay });
  }
  const most = home.criteria?.maxOccupants;
  if (filters.people !== undefined && most && filters.people > most) {
    misses.push({ point: 'people', maxOccupants: most, asked: filters.people });
  }
  // Assistance dogs are never pets (rule 3): only "I have a pet" can miss "No pets".
  if (filters.pets === true && home.criteria?.noPets) misses.push({ point: 'pets' });
  if (filters.furnished && home.furnished !== 'furnished') {
    misses.push({ point: 'furnished', furnished: home.furnished });
  }
  if (filters.parking && home.parking !== 'space' && home.parking !== 'street') {
    misses.push({ point: 'parking', parking: home.parking });
  }
  if (filters.type !== undefined && home.propertyType !== filters.type) {
    misses.push({ point: 'type', propertyType: home.propertyType, asked: filters.type });
  }
  return misses;
}

export interface SearchResults<H extends SearchableHome> {
  /** Homes that fit everything asked, newest first. */
  fits: H[];
  /** Homes that miss on one point, newest first, each with the point. */
  close: Array<{ home: H; miss: Miss }>;
}

const newestFirst = (a: SearchableHome, b: SearchableHome): number =>
  b.liveAt.getTime() - a.liveAt.getTime() || a.id.localeCompare(b.id);

/**
 * UX-SR-7: the homes for a search. With no filters, every home fits: the first screen shows all
 * of them, newest first (UX-SR-2). `g` holds the search's place (src/server/places); a place it
 * doesn't know finds no homes, as a search of nowhere should.
 */
export function searchHomes<H extends SearchableHome>(
  homes: readonly H[],
  filters: SearchFilters,
  g: Gazetteer,
): SearchResults<H> {
  const place = filters.where ? searchPlace(filters.where, g, filters.within) : null;
  if (filters.where && !place) return { fits: [], close: [] };
  const fits: H[] = [];
  const close: Array<{ home: H; miss: Miss }> = [];
  for (const home of [...homes].sort(newestFirst)) {
    if (place && !placeHasHome(place, home)) continue;
    // M57: a map area holds the homes whose pin is in it. A home without one can't be in it.
    if (filters.box && !(home.point && inBBox(home.point, filters.box))) continue;
    const misses = missesOf(home, filters);
    if (misses.length === 0) fits.push(home);
    else if (misses.length === 1) close.push({ home, miss: misses[0]! });
  }
  return { fits, close };
}

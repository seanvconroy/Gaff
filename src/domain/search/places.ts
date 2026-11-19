import { curatedPlaces } from '@/domain/places/curated';
import { COUNTY_POPULATION } from '@/domain/places/counties';
import { parseRoutingKey, routingKeyAreaName } from '@/domain/places/eircode';
import { isArea, type Gazetteer, type Place, type PlaceKind } from '@/domain/places/gazetteer';
import { distanceMetres, distanceToLineMetres, type Point } from '@/domain/places/geo';
import { normalise, queryWords } from '@/domain/places/normalise';
import { rankSuggestions } from '@/domain/places/suggest';
import { canonicalPlaceSlug, PLACE_SLUG } from './place-slug';

/**
 * UX-SR-4, UX-SR-5, M56, M113: "Where" in a search is one place from Gaff's own place index
 * (ADR-0018): a county, city, town, village, Dublin district or area, an Eircode routing key, or
 * a street, landmark or townland to search near. A search's address carries the place's slug.
 * Nothing typed is sent to a map or address provider (rule 10): the index is Gaff's own copy.
 *
 * Domain code never loads the index. The server passes a Gazetteer in (src/server/places).
 */

export { normalise };
export { canonicalPlaceSlug, LEGACY_PLACE_IDS, MAX_PLACE_SLUG, PLACE_SLUG } from './place-slug';
export type { Gazetteer, Place };

/**
 * What a search's place means:
 * - an area: the home's address names it (UX-SR-4);
 * - near: within a distance of a street, landmark or townland (M113);
 * - a routing key: the home's Eircode starts with it.
 */
export type SearchPlace =
  | { kind: 'area'; slug: string; place: Place }
  | { kind: 'near'; slug: string; place: Place; withinMetres: number }
  | { kind: 'routing_key'; slug: string; routingKey: string; town: string | null };

/** M113: how far "near" reaches, by default: 1 km in Dublin or a city, 3 km elsewhere. */
export const NEAR_IN_A_CITY_METRES = 1000;
export const NEAR_ELSEWHERE_METRES = 3000;
/** Within this of a city's centre, a street is a city street. */
const CITY_REACH_METRES = 8000;

export function defaultNearMetres(place: Place, g: Gazetteer): number {
  if (place.county === 'Dublin') return NEAR_IN_A_CITY_METRES;
  const inCity = g.places.some(
    (p) => p.kind === 'city' && distanceMetres(p.centre, place.centre) <= CITY_REACH_METRES,
  );
  return inCity ? NEAR_IN_A_CITY_METRES : NEAR_ELSEWHERE_METRES;
}

/** The place a slug names, or null if the index doesn't know it. */
export function searchPlace(slug: string, g: Gazetteer): SearchPlace | null {
  const canonical = canonicalPlaceSlug(slug);
  const place = g.bySlug(canonical);
  if (place && isArea(place)) return { kind: 'area', slug: canonical, place };
  if (place) {
    return { kind: 'near', slug: canonical, place, withinMetres: defaultNearMetres(place, g) };
  }
  const key = PLACE_SLUG.test(canonical) ? parseRoutingKey(canonical) : null;
  if (key) {
    // A Dublin district is its own place: "d06" is Dublin 6.
    const district = g.byRoutingKey(key);
    if (district) return { kind: 'area', slug: district.slug, place: district };
    return { kind: 'routing_key', slug: key.toLowerCase(), routingKey: key, town: null };
  }
  return null;
}

/** "Area in Cork city" → "Cork city"; "County Dublin" → "Co. Dublin". */
function contextWords(context: string): string {
  return context
    .replace(/^(?:area|village|town|city|townland|suburb) (?:in|near) /i, '')
    .replace(/\bCounty (?=[A-Z])/g, 'Co. ');
}

const countyWords = (county: string) => (county === 'Dublin' ? 'Co. Dublin' : `Co. ${county}`);

/**
 * How a place is named on a chip, in the place search and in a saved search: "Ranelagh,
 * Dublin 6", "Bray, Co. Wicklow", "Co. Cork", "Near Highfield Road, Rathgar", "P17, Kinsale".
 */
export function placeLabel(where: SearchPlace): string {
  if (where.kind === 'routing_key') {
    const town = where.town ?? routingKeyAreaName(where.routingKey);
    return town ? `${where.routingKey}, ${town}` : `Eircode area ${where.routingKey}`;
  }
  // A name given in English and Irish ("Dingle / Daingean Uí Chúis") is named by the first.
  const place = { ...where.place, name: where.place.name.split(' / ')[0]! };
  if (where.kind === 'near') {
    const at = place.context ? contextWords(place.context).split(',')[0]!.trim() : '';
    return at && normalise(at) !== normalise(place.name)
      ? `Near ${place.name}, ${at}`
      : `Near ${place.name}`;
  }
  switch (place.kind) {
    case 'county':
      return place.county === 'Dublin' ? 'Dublin' : `Co. ${place.name}`;
    case 'district':
    case 'city':
      return place.name;
    case 'area':
      return place.context
        ? `${place.name}, ${contextWords(place.context)}`
        : `${place.name}, ${countyWords(place.county)}`;
    default:
      return `${place.name}, ${countyWords(place.county)}`;
  }
}

/**
 * The names a place goes by, normalised: its name (each side of a "/"), Irish name, aliases.
 * In an address, "Cork city" is also written "Cork"; in a sentence, "Cork" is the county.
 */
export function namesOf(place: Place, inAddress = false): string[] {
  const names = [
    place.name,
    ...place.name.split(' / '),
    place.irishName,
    ...(place.aliases ?? []),
  ].filter((n): n is string => Boolean(n));
  const said = names.map(normalise);
  if (place.kind === 'district' && place.routingKey) said.push(...districtWords(place.routingKey));
  if (place.kind === 'city' && inAddress) {
    said.push(...said.filter((n) => n.endsWith(' city')).map((n) => n.slice(0, -5)));
  }
  return [...new Set(said.filter(Boolean))];
}

const addressNames = new WeakMap<Place, string[]>();

/** A place's names as an address would write them, worked out once for each place. */
function addressNamesOf(place: Place): string[] {
  let names = addressNames.get(place);
  if (!names) {
    names = namesOf(place, true).map(streetName);
    addressNames.set(place, names);
  }
  return names;
}

/** "D06" is also "dublin 6", "dublin 06", "d6", "d 6" and "d06"; "D6W" is "dublin 6w" and "d6w". */
function districtWords(routingKey: string): string[] {
  const west = routingKey === 'D6W';
  const number = west ? '6' : String(Number(routingKey.slice(1)));
  const forms = west ? ['6w', '6 w'] : [number, number.padStart(2, '0')];
  return forms.flatMap((n) => [`dublin ${n}`, `d${n}`, `d ${n}`]);
}

/** Where `needle` (normalised) sits in `words`, as whole words. -1 if it doesn't. */
function wordIndex(words: readonly string[], needle: string): number {
  const parts = needle.split(' ');
  outer: for (let i = 0; i + parts.length <= words.length; i++) {
    for (let j = 0; j < parts.length; j++) if (words[i + j] !== parts[j]) continue outer;
    return i;
  }
  return -1;
}

/** What of a home a place is matched against: the home's own facts. */
export interface HomeAddress {
  addressLine1: string;
  addressLine2: string | null;
  area: string;
  county: string;
  eircode: string | null;
  /**
   * SEAM (the map package): where the home is. Homes carry no point yet; once they do, a "near"
   * search measures the distance from the street or landmark, as M113 asks, instead of reading
   * the address.
   */
  point?: Point | null;
}

const routingKeyOf = (eircode: string | null): string | null =>
  eircode ? eircode.replace(/\s+/g, '').slice(0, 3).toUpperCase() : null;

/** A street's name in one form: "Highfield Rd" and "Highfield Road" are both "highfield road". */
export function streetName(street: string): string {
  const words = queryWords(street);
  return words
    .map((forms, i) => {
      if (forms.length === 1) return forms[0]!;
      // "St" is a street at the end of a name, and a saint anywhere else.
      return i === words.length - 1 ? forms[1]! : forms[forms.length - 1]!;
    })
    .join(' ');
}

const wordsOfHome = new WeakMap<HomeAddress, string[]>();

function addressWords(home: HomeAddress): string[] {
  const known = wordsOfHome.get(home);
  if (known) return known;
  // Each part of the address on its own, so "St" at the end of a part is that part's street.
  const words = [home.addressLine1, home.addressLine2 ?? '', home.area]
    .join(',')
    .split(',')
    .flatMap((part) => streetName(part).split(' '))
    .filter(Boolean);
  wordsOfHome.set(home, words);
  return words;
}

/** The metres from a home's point to a street's line or a landmark's centre. */
function metresFrom(place: Place, point: Point): number {
  return place.line?.length
    ? distanceToLineMetres(point, place.line)
    : distanceMetres(place.centre, point);
}

/**
 * Whether a home is in a search's place (UX-SR-4, "Matched against the home's address"):
 * - a county is the home's county;
 * - a Dublin district is its Eircode's routing key, or the district written in its address;
 * - a routing key is its Eircode's routing key;
 * - a city, town, village or area is its name in the address, in the same county;
 * - near a street, landmark or townland (M113): within the distance of it when the home has a
 *   point (the map package's seam); until then, as far as the address allows: the street's name
 *   in the address, or the landmark's neighbourhood, in the same county and routing key.
 */
export function placeHasHome(where: SearchPlace, home: HomeAddress): boolean {
  const homeKey = routingKeyOf(home.eircode);
  if (where.kind === 'routing_key') return homeKey === where.routingKey;
  const { place } = where;
  if (home.county !== place.county) return false;
  if (where.kind === 'near') {
    if (home.point) return metresFrom(place, home.point) <= where.withinMetres;
    if (place.routingKey && homeKey && homeKey !== place.routingKey) return false;
    const words = addressWords(home);
    if (place.kind === 'landmark') {
      const at = place.context ? contextWords(place.context).split(',')[0]!.trim() : '';
      if (at && wordIndex(words, streetName(at)) >= 0) return true;
      return Boolean(place.routingKey && homeKey === place.routingKey);
    }
    return wordIndex(words, streetName(place.name)) >= 0;
  }
  if (place.kind === 'county') return true;
  if (place.routingKey && place.kind === 'district' && homeKey === place.routingKey) return true;
  const words = addressWords(home);
  return addressNamesOf(place).some((name) => wordIndex(words, name) >= 0);
}

/** The more specific a place, the better it says what the renter meant. */
const specificity: Record<PlaceKind, number> = {
  county: 0,
  city: 1,
  town: 1,
  village: 1,
  district: 2,
  area: 3,
  townland: 3,
  street: 4,
  landmark: 4,
};

/** Words before a place that make it a place: "in Rush", "near Trim", "county Clare". */
const CUES = new Set(['in', 'near', 'around', 'at', 'co', 'county', 'to', 'of']);

/**
 * Names of towns and counties that are also everyday words or first names. In a sentence, they
 * (and every village, and every area beyond the curated base) count only after a cue: "no rush"
 * isn't Rush, "Clare here" isn't County Clare.
 */
const EVERYDAY_NAMES = new Set([
  'clare',
  'kerry',
  'shannon',
  'douglas',
  'mahon',
  'rush',
  'marino',
  'sutton',
  'callan',
  'trim',
  'clones',
  'boyle',
  'virginia',
  'clara',
  'knock',
  'prosperous',
  'tallow',
  'milford',
  'newport',
  'enfield',
  'kells',
  'cashel',
]);

const curatedSlugs = new Set(curatedPlaces.map((p) => p.slug));

function needsCue(place: Place, name: string): boolean {
  if (place.kind === 'village') return true;
  if (place.kind === 'area' && !curatedSlugs.has(place.slug)) return true;
  return EVERYDAY_NAMES.has(name);
}

/**
 * UX-SR-3, UX-MT-12: the place a sentence names, if it names one of the index's areas. Where it
 * names several ("Ranelagh, Dublin 6"), the most specific wins, then one in a county the sentence
 * also names, then a curated place, then the bigger place and county, then the first said. A name
 * inside a longer one ("Dublin" in "Dublin 6W") is the longer one.
 */
export function placeInSentence(sentence: string, g: Gazetteer): Place | null {
  const words = normalise(sentence).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  const found: Array<{ place: Place; at: number; end: number }> = [];
  for (const place of g.places) {
    for (const name of namesOf(place)) {
      const at = wordIndex(words, name);
      if (at < 0 || (needsCue(place, name) && !CUES.has(words[at - 1] ?? ''))) continue;
      found.push({ place, at, end: at + name.split(' ').length });
    }
  }
  const whole = found.filter(
    (one) =>
      !found.some(
        (other) =>
          other.at <= one.at && other.end >= one.end && other.end - other.at > one.end - one.at,
      ),
  );
  const counties = new Set(
    whole.filter((f) => f.place.kind === 'county').map((f) => f.place.county),
  );
  whole.sort(
    (a, b) =>
      specificity[b.place.kind] - specificity[a.place.kind] ||
      Number(counties.has(b.place.county)) - Number(counties.has(a.place.county)) ||
      Number(curatedSlugs.has(b.place.slug)) - Number(curatedSlugs.has(a.place.slug)) ||
      (b.place.population ?? 0) - (a.place.population ?? 0) ||
      (COUNTY_POPULATION[b.place.county] ?? 0) - (COUNTY_POPULATION[a.place.county] ?? 0) ||
      a.at - b.at,
  );
  return whole[0]?.place ?? null;
}

/**
 * States table, "Gaff didn't understand the words": the words tried as a place search. The best
 * area whose name matches what was typed; or, when only a near spelling does, nothing, with the
 * near spelling offered as "Did you mean …?".
 */
export function guessPlace(
  typed: string,
  g: Gazetteer,
): { place: Place | null; didYouMean: Place | null } {
  const ranked = rankSuggestions(typed, g.places);
  const best = ranked.groups[0]?.items[0]?.place ?? null;
  if (!best) return { place: null, didYouMean: null };
  return ranked.didYouMean ? { place: null, didYouMean: best } : { place: best, didYouMean: null };
}

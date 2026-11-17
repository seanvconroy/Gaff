import { counties } from '@/domain/lettings/new-letting';
import { countyPlaces, dublinDistricts, type ListedPlace } from './places-list';

/**
 * UX-SR-5: "Where" in a search is one of Gaff's own places: a county, a town, a Dublin postal
 * district or a neighbourhood. Words are matched against this list here, in Gaff's own code, and
 * a place is matched against a home's own address. Nothing is sent to a map or address provider
 * (rule 10), so no search leaves Gaff.
 */

export type County = (typeof counties)[number];
export type PlaceKind = 'county' | 'town' | 'district' | 'area';

export interface Place {
  /** A stable slug, as the search's address carries it: "ranelagh", "dublin-6w". */
  id: string;
  name: string;
  kind: PlaceKind;
  county: County;
  /** What else it is written as, already in `normalise` form. */
  aliases: readonly string[];
  /** For a neighbourhood or town: where it is, as a person would say it ("Dublin 6"). */
  context: string | null;
  /** The name is also an everyday word or a first name: a sentence must say "in" before it. */
  cue: boolean;
  /** A Dublin district's Eircode routing key, "D06" or "D6W". */
  routingKey: string | null;
}

/**
 * Text as places are compared: lower case, without accents, apostrophes or punctuation, single
 * spaces. "Harold’s Cross" and "harolds cross" are the same; so are "Dún Laoghaire" and "dun
 * laoghaire".
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const slug = (text: string): string => normalise(text).replace(/ /g, '-');

function fromListed(listed: ListedPlace, kind: PlaceKind, county: County): Place {
  return {
    id: slug(listed.name),
    name: listed.name,
    kind,
    county,
    aliases: [...new Set([normalise(listed.name), ...(listed.aliases ?? []).map(normalise)])],
    context: listed.context ?? (kind === 'town' ? `Co. ${county}` : null),
    cue: listed.cue ?? false,
    routingKey: null,
  };
}

function district(code: (typeof dublinDistricts)[number]): Place {
  const number = code.replace('W', '');
  const west = code.endsWith('W');
  const key = west ? 'D6W' : `D${number.padStart(2, '0')}`;
  const said = west ? ['6w', '6 w'] : [number, number.padStart(2, '0')];
  return {
    id: `dublin-${code.toLowerCase()}`,
    name: `Dublin ${code}`,
    kind: 'district',
    county: 'Dublin',
    aliases: [...new Set(said.flatMap((n) => [`dublin ${n}`, `d${n}`, `d ${n}`]))],
    context: null,
    cue: false,
    routingKey: key,
  };
}

function buildPlaces(): readonly Place[] {
  const all: Place[] = [];
  for (const county of counties) {
    const entry = countyPlaces[county];
    all.push({
      id: slug(county),
      name: county,
      kind: 'county',
      county,
      aliases: [normalise(county), ...(entry.aliases ?? [])],
      context: null,
      cue: entry.cue ?? false,
      routingKey: null,
    });
  }
  for (const code of dublinDistricts) all.push(district(code));
  for (const county of counties) {
    const entry = countyPlaces[county];
    for (const town of entry.towns) all.push(fromListed(town, 'town', county));
    for (const area of entry.areas ?? []) all.push(fromListed(area, 'area', county));
  }
  return all;
}

export const places: readonly Place[] = buildPlaces();
const byId = new Map(places.map((place) => [place.id, place]));

export function placeById(id: string): Place | null {
  return byId.get(id) ?? null;
}

/** How a place is named on a chip and in the place search: "Ranelagh, Dublin 6", "Co. Cork". */
export function placeLabel(place: Place): string {
  if (place.kind === 'county') return place.county === 'Dublin' ? 'Dublin' : `Co. ${place.name}`;
  return place.context ? `${place.name}, ${place.context}` : place.name;
}

/** The more specific a place, the better it says what the renter meant. */
const specificity: Record<PlaceKind, number> = { county: 0, town: 1, district: 2, area: 3 };

const CUES = new Set(['in', 'near', 'around', 'at', 'co', 'county', 'to', 'of']);

/** Where `needle` (normalised) sits in `words`, as whole words. -1 if it doesn't. */
function wordIndex(words: readonly string[], needle: string): number {
  const parts = needle.split(' ');
  outer: for (let i = 0; i + parts.length <= words.length; i++) {
    for (let j = 0; j < parts.length; j++) if (words[i + j] !== parts[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * UX-SR-3, UX-MT-12: the place a sentence names, if it names one of Gaff's places. Where it
 * names several ("Ranelagh, Dublin 6"), the most specific wins, then the first said. A name
 * inside a longer one ("Dublin" in "Dublin 6W") is the longer one. A name that is also an
 * everyday word counts only after "in", "near" and the like: "no rush" isn't Rush.
 */
export function placeInSentence(sentence: string): Place | null {
  const words = normalise(sentence).split(' ').filter(Boolean);
  const found: Array<{ place: Place; at: number; end: number }> = [];
  for (const place of places) {
    for (const alias of place.aliases) {
      const at = wordIndex(words, alias);
      if (at < 0 || (place.cue && !CUES.has(words[at - 1] ?? ''))) continue;
      found.push({ place, at, end: at + alias.split(' ').length });
    }
  }
  const whole = found.filter(
    (one) =>
      !found.some(
        (other) =>
          other.at <= one.at && other.end >= one.end && other.end - other.at > one.end - one.at,
      ),
  );
  whole.sort((a, b) => specificity[b.place.kind] - specificity[a.place.kind] || a.at - b.at);
  return whole[0]?.place ?? null;
}

/**
 * The place search under "Where" (UX-SR-4): places whose name, or a word of it, starts with what
 * was typed. Runs in the visitor's own browser against this list; nothing typed is sent anywhere.
 */
export function searchPlaces(typed: string, limit = 8): Place[] {
  const query = normalise(typed);
  if (!query) return [];
  const scored: Array<{ place: Place; score: number }> = [];
  for (const place of places) {
    let score = -1;
    for (const alias of place.aliases) {
      if (alias === query) score = Math.max(score, 3);
      else if (alias.startsWith(query)) score = Math.max(score, 2);
      else if (alias.split(' ').some((word) => word.startsWith(query))) score = Math.max(score, 1);
    }
    if (score >= 0) scored.push({ place, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        specificity[a.place.kind] - specificity[b.place.kind] ||
        a.place.name.localeCompare(b.place.name, 'en-IE', { numeric: true }),
    )
    .slice(0, limit)
    .map(({ place }) => place);
}

/** What of a home's address a place is matched against: the home's own facts. */
export interface HomeAddress {
  addressLine1: string;
  addressLine2: string | null;
  area: string;
  county: string;
  eircode: string | null;
}

const routingKeyOf = (eircode: string | null): string | null =>
  eircode ? eircode.replace(/\s+/g, '').slice(0, 3).toUpperCase() : null;

/**
 * Whether a home is in a place (UX-SR-4, "Matched against the home's address"). A county is the
 * home's county. A Dublin district is its Eircode's routing key, or the district written in its
 * address. A town or a neighbourhood is its name in the address, in the same county.
 */
export function placeHasHome(place: Place, home: HomeAddress): boolean {
  if (home.county !== place.county) return false;
  if (place.kind === 'county') return true;
  if (place.routingKey && routingKeyOf(home.eircode) === place.routingKey) return true;
  const words = normalise([home.addressLine1, home.addressLine2 ?? '', home.area].join(' ')).split(
    ' ',
  );
  return place.aliases.some((alias) => wordIndex(words, alias) >= 0);
}

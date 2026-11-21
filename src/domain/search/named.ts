import type { Place } from '@/domain/places/gazetteer';
import { joinSurnames, matchForm, normalise } from '@/domain/places/normalise';
import { namesOf, streetName } from './places';

/**
 * UX-SR-14 (Q60): the road, landmark or townland a renter's words name. The areas a sentence
 * names are found in memory (`placeInSentence`); the rest of the place index (45,000 streets,
 * 51,000 townlands) is asked for by the server, with the parts of the sentence that could be a
 * place's name. This file says which parts those are, and when a place from the index is what
 * a part names. It is plain code, like the rest of reading a sentence (parse.ts).
 *
 * Only words that could name a place are ever looked up: the words a search reads for its other
 * fields, and the small words round them, are left out first, so what a renter says about
 * themselves isn't sent to the index (UX-SR-11).
 */

/** A run of words that could be a place's name. */
export interface PlaceFragment {
  /** Normalised words, single-spaced: "highfield road rathgar". */
  text: string;
  /** It came after "in", "near", "on" and the like. */
  cued: boolean;
  /** It runs to the end of what was typed: the part still being typed. */
  last: boolean;
}

/** Words that come before a place: "near Highfield Road", "on Main Street". */
const CUES = new Set(['in', 'near', 'around', 'at', 'on', 'beside', 'off', 'by', 'nearby']);

/**
 * Words a sentence about a home uses that aren't part of a place's name as renters write one.
 * They end a fragment. Words that are in many names ("park", "road", "green", "north", "the")
 * are not here.
 */
const NOT_A_PLACE = new Set(
  `bed beds bedroom bedrooms bedroomed br bdr bdrm apartment apartments apt flat flats house
  houses studio studios bedsit duplex bungalow townhouse home homes room rooms property
  under below max maximum budget euro euros eur month months monthly mth mths year years yr yrs
  week weeks pm rent renting rental let letting to for with without no not pet pets dog dogs cat
  cats rabbit furnished unfurnished parking driveway garage balcony garden from starting start
  asap now immediately available me myself my our us we i im ive id partner wife husband
  boyfriend girlfriend friend flatmate housemate people person persons adults tenants sharers
  just only own looking look want wanted need needed would like please a an and or is are am be
  it that this somewhere anywhere something anything close up less more than about cheap nice
  quiet lovely good great small big large modern term short friendly allowed welcome ok okay
  have has got bringing moving move january february march april june july august september
  october november december jan feb mar apr jun jul aug sep sept oct nov dec next soon
  one two three four five six seven eight nine ten eleven twelve`
    .split(/\s+/)
    .filter(Boolean),
);

/** Small words that can sit inside a name ("Hill of Howth") but never start or end one here. */
const EDGE = new Set(['the', 'of', 'co', 'county', 'area']);

/** "2", "2000", "2k", "2bed", "d06" isn't one (a routing key is a place). */
const isNumber = (word: string) => /^\d+[a-z]{0,3}$/.test(word) && !/^[a-z]\d/.test(word);

/**
 * The parts of what was typed that could name a place, in the order to try them: one that
 * follows a cue first, then the longer. At most three.
 */
export function placeFragments(typed: string): PlaceFragment[] {
  const words = normalise(typed.slice(0, 500)).split(' ').filter(Boolean);
  const found: PlaceFragment[] = [];
  let run: string[] = [];
  let cued = false;
  let nextCued = false;
  const end = (last: boolean) => {
    while (run.length && EDGE.has(run[0]!)) run.shift();
    while (run.length && EDGE.has(run[run.length - 1]!) && !last) run.pop();
    if (run.length > 0 && run.length <= 6 && run.join('').length >= 2) {
      found.push({ text: run.join(' '), cued, last });
    }
    run = [];
  };
  for (const word of words) {
    if (CUES.has(word)) {
      end(false);
      nextCued = true;
    } else if (NOT_A_PLACE.has(word) || isNumber(word) || word.length > 30) {
      end(false);
      nextCued = false;
    } else {
      if (run.length === 0) cued = nextCued;
      run.push(word);
      nextCued = false;
    }
  }
  end(true);
  return found
    .sort((a, b) => Number(b.cued) - Number(a.cued) || b.text.length - a.text.length)
    .slice(0, 3);
}

/** The part still being typed, for suggestions: the fragment that runs to the end, if any. */
export function typingPlace(typed: string): string | null {
  // A space after the last word means it's finished, but it is still the place being named.
  return placeFragments(typed).find((fragment) => fragment.last)?.text ?? null;
}

/** Where a place is, as words an address or a renter might add after its name. */
function contextWordsOf(place: Place): Set<string> {
  const words = matchForm(`${place.context ?? ''} ${place.county}`).split(' ');
  return new Set([...words, 'co', 'county', 'ireland', 'city']);
}

/** The town or neighbourhood it is in, without its county: "Claddagh, Galway", not "County Galway". */
function localityWordsOf(place: Place): Set<string> {
  const local = (place.context ?? '').replace(/\b(?:County|Co\.?) [A-Z][a-z]+/g, ' ');
  return new Set(matchForm(local).split(' ').filter(Boolean));
}

/**
 * Whether a fragment names this place: one of the place's names, whole, with nothing left over
 * but words that say where it is ("highfield road rathgar", "main street bray wicklow"). The
 * answer is how many of the fragment's words were the name: the more, the better the match;
 * and a half more when the words left over name its own town or neighbourhood, so "Shop Street
 * Galway" is the one in Galway city before the one in Tuam, County Galway. Surnames are joined
 * on both sides first (Q60): "O Connell Street Limerick" names O'Connell Street.
 */
export function namedBy(fragment: string, place: Place): number {
  const words = joinSurnames(streetName(fragment)).split(' ').filter(Boolean);
  if (words.length === 0) return 0;
  const context = contextWordsOf(place);
  const locality = localityWordsOf(place);
  let best = 0;
  for (const name of namesOf(place)) {
    const parts = joinSurnames(streetName(name)).split(' ').filter(Boolean);
    if (parts.length === 0 || parts.length > words.length || parts.length < Math.floor(best)) {
      continue;
    }
    for (let at = 0; at + parts.length <= words.length; at++) {
      if (!parts.every((part, i) => words[at + i] === part)) continue;
      const rest = [...words.slice(0, at), ...words.slice(at + parts.length)];
      if (!rest.every((word) => context.has(word) || /^\d{1,2}w?$/.test(word))) continue;
      const local = rest.length > 0 && rest.some((word) => locality.has(word));
      best = Math.max(best, parts.length + (local ? 0.5 : 0));
      break;
    }
  }
  return best;
}

/**
 * From the index's candidates for a fragment, in the order the place search would suggest them,
 * the one the fragment names: the first whose name takes up most of it. A road, landmark or
 * townland named by one bare word counts only after a cue or when it is all that was typed:
 * "Glebe" in "a house with a glebe view" is not a townland.
 */
export function placeNamed<P extends Place>(
  fragment: PlaceFragment,
  ranked: readonly P[],
  alone: boolean,
): P | null {
  let best: P | null = null;
  let most = 0;
  for (const place of ranked) {
    const words = namedBy(fragment.text, place);
    if (words === 0) continue;
    if (Math.floor(words) === 1 && !fragment.cued && !alone) continue;
    if (words > most) {
      most = words;
      best = place;
    }
  }
  return best;
}

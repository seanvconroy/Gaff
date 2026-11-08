import { parseRoutingKey, routingKeyAreaName } from './eircode';
import type { Place, PlaceKind } from './gazetteer';
import { normalise, normaliseQuery, queryWords, similarity, wordsMatch } from './normalise';

/**
 * M56, M121: what the Where box suggests. Candidates come from the place index (Postgres finds
 * them with pg_trgm, ADR-0027) or, in tests and development, from the fixture; this ranks them
 * the same way either way.
 *
 *   score = match × kind + 0.05 × log10(1 + live homes) + 0.02 × log10(1 + population)
 *
 * Then at most 3 streets and 2 landmarks, unless nothing else matches, one row per name and
 * context, and 8 rows in all, in groups that come in the order of their best row.
 */

export type SuggestionGroupKind = 'places' | 'streets' | 'landmarks';

export interface Suggestion {
  /** The place's slug; for an Eircode area, its routing key in lower case. */
  slug: string;
  name: string;
  kind: PlaceKind | 'routing_key';
  context: string | null;
  homes: number | null;
  score: number;
  place: Place | null;
  routingKey: string | null;
}

export interface SuggestionGroup {
  kind: SuggestionGroupKind;
  items: Suggestion[];
}

export interface Suggestions {
  groups: SuggestionGroup[];
  /** True when only near spellings matched: the box says "Did you mean …?". */
  didYouMean: boolean;
}

export const MAX_SUGGESTIONS = 8;
const MAX_STREETS = 3;
const MAX_LANDMARKS = 2;
/** Below this, a near spelling isn't offered at all. */
const MIN_SIMILARITY = 0.35;

const kindWeight: Record<PlaceKind | 'routing_key', number> = {
  county: 1,
  city: 1,
  district: 0.95,
  town: 0.95,
  area: 0.9,
  routing_key: 0.85,
  village: 0.85,
  landmark: 0.72,
  street: 0.75,
  townland: 0.6,
};

function groupOf(kind: Suggestion['kind']): SuggestionGroupKind {
  if (kind === 'street') return 'streets';
  if (kind === 'landmark') return 'landmarks';
  return 'places';
}

/** How well a place's names match the query, from 0 (not at all) to 1 (exactly). */
export function matchQuality(query: string, place: Place): { quality: number; near: boolean } {
  const q = normaliseQuery(query);
  if (q.length === 0) return { quality: 0, near: false };
  const names = [place.name, place.irishName, ...(place.aliases ?? [])]
    .filter((n): n is string => Boolean(n))
    .map(normalise);
  const key = parseRoutingKey(query);
  if (names.includes(q) || (key !== null && place.routingKey === key)) {
    return { quality: 1, near: false };
  }
  // A name that starts with what was typed. When that's whole words with more after, the fewer
  // more the better, so "University College Dublin" puts "... (Belfield Campus)" before
  // "... - Lyons Research Farm". A word still being typed ("rath") keeps them equal.
  const starting = names.filter((n) => n.startsWith(q));
  if (starting.length) {
    const extra = Math.min(...starting.map((n) => (n[q.length] === ' ' ? n.length - q.length : 0)));
    return { quality: 0.9 - Math.min(0.05, extra * 0.002), near: false };
  }
  const words = queryWords(query);
  const nameWords = names.flatMap((n) => n.split(' '));
  if (wordsMatch(words, nameWords)) return { quality: 0.8, near: false };
  const contextWords = normalise(place.context ?? '').split(' ');
  const someWordInName = words.some((forms) =>
    forms.some((form) => nameWords.some((w) => w.startsWith(form))),
  );
  if (words.length > 1 && someWordInName && wordsMatch(words, [...nameWords, ...contextWords])) {
    return { quality: 0.7, near: false };
  }
  const best = Math.max(...names.map((n) => similarity(q, n)));
  return best >= MIN_SIMILARITY ? { quality: best * 0.7, near: true } : { quality: 0, near: false };
}

function scoreOf(match: number, place: Place): number {
  return (
    match * kindWeight[place.kind] +
    0.05 * Math.log10(1 + (place.liveHomes ?? 0)) +
    0.02 * Math.log10(1 + (place.population ?? 0))
  );
}

/** The routing key a query names, as a suggestion: "P17 · Eircode area · Kinsale". */
function routingKeySuggestion(query: string, places: readonly Place[]): Suggestion | null {
  const key = parseRoutingKey(query);
  if (!key || places.some((p) => p.routingKey === key && p.kind === 'district')) return null;
  const town = routingKeyAreaName(key);
  return {
    slug: key.toLowerCase(),
    name: key,
    kind: 'routing_key',
    context: town ? `Eircode area · ${town}` : 'Eircode area',
    homes: null,
    score: kindWeight.routing_key,
    place: null,
    routingKey: key,
  };
}

/** Ranks candidate places for what was typed, and groups them for the Where box. */
export function rankSuggestions(query: string, candidates: readonly Place[]): Suggestions {
  const q = normaliseQuery(query);
  if (q.length < 2 && parseRoutingKey(query) === null) return { groups: [], didYouMean: false };
  const scored: Array<Suggestion & { near: boolean }> = [];
  for (const place of candidates) {
    const { quality, near } = matchQuality(query, place);
    if (quality === 0) continue;
    scored.push({
      slug: place.slug,
      name: place.name,
      kind: place.kind,
      context: place.context ?? null,
      homes: place.liveHomes ?? null,
      score: scoreOf(quality, place),
      place,
      routingKey: place.kind === 'district' ? (place.routingKey ?? null) : null,
      near,
    });
  }
  const key = routingKeySuggestion(query, candidates);
  if (key) scored.push({ ...key, near: false });

  const exactEnough = scored.filter((s) => !s.near);
  const pool = exactEnough.length ? exactEnough : scored;
  pool.sort(
    (a, b) =>
      b.score - a.score || (b.homes ?? 0) - (a.homes ?? 0) || a.name.localeCompare(b.name, 'en-IE'),
  );

  const seen = new Set<string>();
  const unique = pool.filter((s) => {
    const id = `${normalise(s.name)}|${normalise(s.context ?? s.kind)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const onlyStreetsOrLandmarks = unique.every((s) => groupOf(s.kind) !== 'places');
  const counts = { streets: 0, landmarks: 0 };
  const chosen: Suggestion[] = [];
  for (const s of unique) {
    if (chosen.length === MAX_SUGGESTIONS) break;
    const group = groupOf(s.kind);
    if (!onlyStreetsOrLandmarks) {
      if (group === 'streets' && counts.streets === MAX_STREETS) continue;
      if (group === 'landmarks' && counts.landmarks === MAX_LANDMARKS) continue;
    }
    if (group !== 'places') counts[group]++;
    const { near: _near, ...suggestion } = s;
    chosen.push(suggestion);
  }

  const groups: SuggestionGroup[] = [];
  for (const s of chosen) {
    const kind = groupOf(s.kind);
    let group = groups.find((g) => g.kind === kind);
    if (!group) {
      group = { kind, items: [] };
      groups.push(group);
    }
    group.items.push(s);
  }
  return { groups, didYouMean: exactEnough.length === 0 && chosen.length > 0 };
}

/**
 * Candidates from a list of places held in memory (the fixture): every place a query could
 * match. The server asks Postgres instead, which narrows the whole index the same way.
 */
export function suggestFrom(query: string, places: readonly Place[]): Suggestions {
  return rankSuggestions(query, places);
}

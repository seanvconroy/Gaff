import { placeDescription, homesCount } from '@/copy/search';
import type { Gazetteer, LandmarkKind, Place } from '@/domain/places/gazetteer';
import { rankSuggestions, type Suggestion } from '@/domain/places/suggest';
import type { SearchFilters } from '@/domain/search/filters';
import { placeLabel, searchPlace, type SearchPlace } from '@/domain/search/places';
import { candidatePlaces, loadGazetteer, recordMiss } from '@/server/places/places';
import { countHomesIn } from './query';

/**
 * UX-SR-4, UX-SR-5, M56, M121, M124: "Where", on the server. A search's address holds only its
 * place's slug; here the slug is looked up in Gaff's own place index (ADR-0018), and the place
 * search's suggestions are made, with the homes on Gaff counted beside each place.
 */

/** A search with its place looked up: a slug the index doesn't know is left out. */
export interface ResolvedSearch {
  filters: SearchFilters;
  where: SearchPlace | null;
  /** The place as chips and saved searches name it: "Ranelagh, Dublin 6". Empty with no place. */
  placeName: string;
  g: Gazetteer;
}

export async function resolveSearch(filters: SearchFilters): Promise<ResolvedSearch> {
  const g = await loadGazetteer(filters.where ? [filters.where] : []);
  const where = filters.where ? searchPlace(filters.where, g, filters.within) : null;
  const { where: _unknown, within, ...rest } = filters;
  // M113: "Within" belongs to a place searched near, and to nothing else.
  const near = where?.kind === 'near' && within !== undefined ? { within } : {};
  return {
    filters: where ? { ...rest, where: where.slug, ...near } : rest,
    where,
    placeName: where ? placeLabel(where) : '',
    g,
  };
}

/** Each search's place name, for saved searches and their emails. */
export async function placeNames(
  searches: ReadonlyArray<SearchFilters>,
): Promise<Map<string, string>> {
  const slugs = [...new Set(searches.flatMap((s) => (s.where ? [s.where] : [])))];
  const names = new Map<string, string>();
  if (slugs.length === 0) return names;
  const g = await loadGazetteer(slugs);
  for (const slug of slugs) {
    const where = searchPlace(slug, g);
    if (where) names.set(slug, placeLabel(where));
  }
  return names;
}

/** What the place search shows for one suggestion. */
export interface WhereOption {
  /** The place's slug, as the search's address will carry it. */
  slug: string;
  /** The name, as typed text is shown in bold within it. */
  name: string;
  /** What the field says once it's chosen, and the chip after: "Kinsale, Co. Cork". */
  label: string;
  /** Under the name: "Town in County Cork · 4 homes". */
  description: string;
  kind: Suggestion['kind'];
  landmarkKind?: LandmarkKind;
}

export type WhereGroupKind = 'places' | 'streets' | 'landmarks' | 'popular';

export interface WhereSuggestions {
  groups: Array<{ kind: WhereGroupKind; items: WhereOption[] }>;
  /** True when only near spellings matched: "We couldn't find … Did you mean …?". */
  didYouMean: boolean;
}

const COUNTS_FOR_MS = 60_000;
const countsCache = globalThis as unknown as {
  gaffPopularCounts?: { at: number; counts: Map<string, number> };
};

/** Forgets the cached counts of homes in every place (in tests). */
export function forgetHomeAddresses(): void {
  delete countsCache.gaffPopularCounts;
}

/**
 * M121: the homes on Gaff in each of these areas (streets and landmarks aren't counted), counted
 * by the database with search's own query (BA-14). `cached`: every area at once, for the places
 * with the most homes, kept a minute; counts beside places may lag that.
 */
async function withHomes(found: readonly Place[], g: Gazetteer, cached = false): Promise<Place[]> {
  let counts: Map<string, number>;
  const kept = countsCache.gaffPopularCounts;
  if (cached && kept && Date.now() - kept.at < COUNTS_FOR_MS) counts = kept.counts;
  else {
    counts = await countHomesIn(found, g);
    if (cached) countsCache.gaffPopularCounts = { at: Date.now(), counts };
  }
  return found.map((place) => {
    const homes = counts.get(place.slug);
    return homes === undefined ? place : { ...place, liveHomes: homes };
  });
}

function option(s: Suggestion, g: Gazetteer): WhereOption | null {
  const where = searchPlace(s.slug, g);
  if (!where) return null;
  // A routing key that is a Dublin district is described as the district.
  const place = s.place ?? (where.kind === 'routing_key' ? null : where.place);
  const description = place ? placeDescription(place) : (s.context ?? 'Eircode area');
  const homes = s.homes ? ` · ${homesCount(s.homes).toLowerCase()}` : '';
  return {
    slug: where.slug,
    name: s.name,
    label: placeLabel(where),
    description: `${description}${homes}`,
    kind: s.kind,
    ...(s.place?.landmarkKind ? { landmarkKind: s.place.landmarkKind } : {}),
  };
}

/**
 * M56, M124: suggestions for what was typed, ranked and grouped (src/domain/places/suggest.ts).
 * What found nothing, or only near spellings, is counted, with no person, device or digits.
 */
export async function suggestWhere(typed: string): Promise<WhereSuggestions> {
  const found = await candidatePlaces(typed);
  const g = await loadGazetteer(found.map((p) => p.slug));
  const suggestions = rankSuggestions(typed, await withHomes(found, g));
  if (suggestions.groups.length === 0 || suggestions.didYouMean) await recordMiss(typed);
  return {
    groups: suggestions.groups
      .map((group) => ({
        kind: group.kind,
        items: group.items.flatMap((s) => option(s, g) ?? []),
      }))
      .filter((group) => group.items.length > 0),
    didYouMean: suggestions.didYouMean,
  };
}

/** M121: before anything is typed, the places with the most homes on Gaff. */
export async function popularWhere(limit = 6): Promise<WhereSuggestions> {
  const g = await loadGazetteer();
  const counted = await withHomes(
    g.places.filter((p) => p.kind !== 'county'),
    g,
    true,
  );
  const items = counted
    .filter((p) => (p.liveHomes ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.liveHomes ?? 0) - (a.liveHomes ?? 0) ||
        // Of places with as many homes, the one that says most: Ranelagh before Dublin 6.
        Number(b.kind === 'area') - Number(a.kind === 'area') ||
        a.name.localeCompare(b.name, 'en-IE'),
    )
    .slice(0, limit)
    .flatMap(
      (place) =>
        option(
          {
            slug: place.slug,
            name: place.name,
            kind: place.kind,
            context: place.context ?? null,
            homes: place.liveHomes ?? null,
            score: 0,
            place,
            routingKey: null,
          },
          g,
        ) ?? [],
    );
  return { groups: items.length ? [{ kind: 'popular', items }] : [], didYouMean: false };
}

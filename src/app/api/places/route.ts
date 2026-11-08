import { NextResponse, type NextRequest } from 'next/server';
import { homesCount, placeDescription } from '@/copy/search';
import type { LandmarkKind } from '@/domain/places/gazetteer';
import type { Suggestion, Suggestions } from '@/domain/places/suggest';
import { placePath } from '@/domain/search/places';
import { env } from '@/lib/env';
import { popularPlaces, suggestPlaces } from '@/server/places/places';

/** What the Where box shows for one suggestion. */
export interface SuggestionItem {
  slug: string;
  name: string;
  kind: Suggestion['kind'];
  /** For landmarks: a college, hospital, station, park or shopping centre, for its icon. */
  landmarkKind?: LandmarkKind;
  /** "Town in County Cork · 4 homes". */
  description: string;
  path: string;
}

export interface SuggestionsResponse {
  groups: Array<{ kind: 'places' | 'streets' | 'landmarks' | 'popular'; items: SuggestionItem[] }>;
  didYouMean: boolean;
}

function item(s: Suggestion): SuggestionItem {
  const description = s.place ? placeDescription(s.place) : (s.context ?? 'Eircode area');
  const homes = s.homes ? ` · ${homesCount(s.homes).toLowerCase()}` : '';
  return {
    slug: s.slug,
    name: s.name,
    kind: s.kind,
    ...(s.place?.landmarkKind ? { landmarkKind: s.place.landmarkKind } : {}),
    description: `${description}${homes}`,
    path: s.place ? placePath(s.place) : `/to-rent/${s.slug}`,
  };
}

function response(suggestions: Suggestions): SuggestionsResponse {
  return {
    groups: suggestions.groups.map((g) => ({ kind: g.kind, items: g.items.map(item) })),
    didYouMean: suggestions.didYouMean,
  };
}

/**
 * M56, M121: place suggestions as a renter types, from Gaff's own place index (ADR-0027); with
 * nothing typed, the places with the most homes. The same for everyone, so the CDN keeps it.
 */
export async function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const typed = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  const body: SuggestionsResponse = typed
    ? response(await suggestPlaces(typed))
    : {
        groups: [{ kind: 'popular', items: (await popularPlaces()).map(item) }],
        didYouMean: false,
      };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' },
  });
}

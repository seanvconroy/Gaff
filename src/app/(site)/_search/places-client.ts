import { searchCopy } from '@/copy/search';
import type { WhereGroupKind, WhereOption, WhereSuggestions } from '@/server/search/where';
import type { PlaceIcon, PlaceOption, PlaceSuggestions } from '@/ui/PlaceSearch';
import { recentPlaces } from './recent';

/**
 * Place suggestions in the browser, for the search bar and for "Where" in Filters. They come
 * from Gaff's own place index (/api/places, ADR-0018) and nowhere else: no map or address
 * provider sees what is typed (UX-SR-5, rule 10). What was searched this visit stays in this
 * browser tab (./recent.ts).
 */

const groupLabels: Record<WhereGroupKind, string> = {
  places: searchCopy.where.groups.places,
  streets: searchCopy.where.groups.streets,
  landmarks: searchCopy.where.groups.landmarks,
  popular: searchCopy.where.groups.popular,
};

function iconOf(option: WhereOption): PlaceIcon {
  if (option.kind === 'street') return 'street';
  if (option.kind === 'routing_key') return 'routing_key';
  if (option.kind === 'landmark') return option.landmarkKind ?? 'landmark';
  return 'place';
}

/** Suggestions from Gaff's own place index; before typing, this visit's places first. */
export async function findPlaces(query: string, from?: 'bar'): Promise<PlaceSuggestions> {
  const response = await fetch(
    `/api/places?q=${encodeURIComponent(query)}${from === 'bar' && query ? '&bar=1' : ''}`,
  );
  if (!response.ok) throw new Error(`Place search: ${response.status}`);
  const found = (await response.json()) as WhereSuggestions;
  const groups = found.groups.map((group) => ({
    label: groupLabels[group.kind],
    options: group.items.map((item): PlaceOption => ({
      id: item.slug,
      name: item.name,
      label: item.label,
      description: item.description,
      icon: iconOf(item),
    })),
  }));
  if (query) return { groups, didYouMean: found.didYouMean };
  const recent = recentPlaces();
  const seen = new Set(recent.map((o) => o.id));
  return {
    groups: [
      ...(recent.length ? [{ label: searchCopy.where.groups.recent, options: recent }] : []),
      ...groups
        .map((group) => ({ ...group, options: group.options.filter((o) => !seen.has(o.id)) }))
        .filter((group) => group.options.length > 0),
    ],
    didYouMean: false,
  };
}

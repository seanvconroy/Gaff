import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isArea, type Gazetteer, type Place } from '@/domain/places/gazetteer';
import { normaliseQuery } from '@/domain/places/normalise';
import { rankSuggestions } from '@/domain/places/suggest';
import { type SearchFilters, searchFiltersSchema, searchHref } from '@/domain/search/filters';
import { placeFragments, placeNamed } from '@/domain/search/named';
import { parseSearch } from '@/domain/search/parse';
import { MAX_PLACE_SLUG, searchPlace } from '@/domain/search/places';
import { irishToday } from '@/lib/format';
import { noteFunnelStep } from '@/server/funnels/steps';
import { candidatePlaces, loadGazetteer } from '@/server/places/places';

/**
 * UX-SR-3, UX-SR-11, UX-MT-12, UX-MT-13: a renter's words in the search box become the search's
 * address, and the words are let go. The sentence is read once, here, by plain code
 * (src/domain/search/parse.ts), so it works with the reader switched off. It is not stored, not
 * written to an event or a log, not put in the address and not sent anywhere: whatever it said
 * beyond the allowed fields is gone when this returns.
 */
const wordsSchema = z.object({
  /** What was typed. Untrusted, and read only for the allowed fields. */
  words: z.string().max(2000).catch(''),
  /** `rent=1` on the first screen, kept as the renter moves on (see `searchHref`). */
  rent: z.literal('1').optional().catch(undefined),
  /** UX-SR-14: the place picked from the suggestions, as its slug. It is the search's place. */
  place: z.string().max(MAX_PLACE_SLUG).optional().catch(undefined),
});

export type WordsOutcome = { href: string; understood: boolean };

/** The places the index would suggest for these words, best first; and whether only near spellings matched. */
async function suggested(words: string): Promise<{ places: Place[]; near: boolean }> {
  const ranked = rankSuggestions(words, await candidatePlaces(words));
  return {
    places: ranked.groups
      .flatMap((group) => group.items)
      .sort((a, b) => b.score - a.score)
      .flatMap((item) => (item.place ? [item.place] : [])),
    near: ranked.didYouMean,
  };
}

/**
 * UX-SR-14: the road, landmark or townland the words name, from the whole place index. With an
 * area already understood ("on Main Street in Bray"), only one found together with that area
 * counts: a road of the same name somewhere else isn't what was asked.
 */
async function namedInIndex(
  words: string,
  area: Place | null,
  alone: boolean,
): Promise<Place | null> {
  for (const fragment of placeFragments(words)) {
    const areaName = area ? normaliseQuery(area.name.split(' / ')[0]!) : '';
    if (area && fragment.text === areaName) continue;
    const asked = area && !fragment.text.includes(areaName) ? `${fragment.text} ${areaName}` : '';
    const { places } = await suggested(asked || fragment.text);
    const found = placeNamed(
      { ...fragment, text: asked || fragment.text },
      places.filter((place) => !isArea(place)),
      alone,
    );
    if (found) return found;
  }
  return null;
}

export async function searchFromWords(
  input: unknown,
  now: Date = new Date(),
): Promise<WordsOutcome> {
  const { words, rent, place } = wordsSchema.parse(input);
  const keep = { rent: rent === '1' };
  // The index's areas, which a sentence's place is looked for among (ADR-0018), and the place
  // that was picked from the suggestions, whatever kind it is.
  const g: Gazetteer = await loadGazetteer(place ? [place] : []);
  const { filters, understood, didYouMean } = parseSearch(words, irishToday(now), g);
  const withPlace = (slug: string): SearchFilters =>
    searchFiltersSchema.parse({ ...filters, where: slug });

  // A place picked from the suggestions is the place, whatever else the words say.
  const picked = place ? searchPlace(place, g) : null;
  if (picked) return { href: searchHref(withPlace(picked.slug), keep), understood: true };

  // Nothing but a place's name: "Highfield Road", "ucd", "Kinsael". The place search's own
  // first suggestion is the place; a near spelling is offered, never assumed.
  const others = Object.keys(filters).filter((key) => key !== 'where');
  const alone = others.length === 0;
  // "near Trinity College" is asked as "trinity college".
  const fragments = placeFragments(words);
  const typed = fragments.length === 1 ? fragments[0]!.text : normaliseQuery(words.slice(0, 60));
  if (alone && typed.length >= 2 && typed.split(' ').length <= 6) {
    const { places, near } = await suggested(typed);
    // An area the sentence reader found ("Ranelagh") stands, unless the index has an exact
    // match that is more than the area: "Highfield Road, Rathgar" is the road.
    const exact = placeNamed({ text: typed, cued: false, last: true }, places, true);
    if (exact && (!filters.where || !isArea(exact))) {
      return { href: searchHref(withPlace(exact.slug), keep), understood: true };
    }
    if (!filters.where && places[0]) {
      if (!near) return { href: searchHref(withPlace(places[0].slug), keep), understood: true };
      const params = new URLSearchParams({
        unclear: '1',
        maybe: places[0].slug,
        ...(rent ? { rent } : {}),
      });
      return { href: `/?${params.toString()}`, understood: false };
    }
  } else if (!alone) {
    const area = filters.where ? (g.bySlug(filters.where) ?? null) : null;
    const named = await namedInIndex(words, area, false);
    if (named) return { href: searchHref(withPlace(named.slug), keep), understood: true };
  }

  if (!understood) {
    // States table: nothing understood. The address says so, and holds nothing of the words:
    // at most the slug of a place whose name they nearly were, for "Did you mean …?".
    const params = new URLSearchParams({
      unclear: '1',
      ...(didYouMean ? { maybe: didYouMean } : {}),
      ...(rent ? { rent } : {}),
    });
    return { href: `/?${params.toString()}`, understood };
  }
  return { href: searchHref(filters, keep), understood };
}

/**
 * UX-ME-4, the Search funnel: a search was made, and whether anything fit. It is counted under
 * an ID made for it alone, so it is never tied to a person, a device or another search. A search
 * that found nothing at all also starts the "Saved search" funnel (WP-23 adds the rest of it).
 */
export async function countSearch(found: { fits: number; close: number }): Promise<void> {
  const subjectId = randomUUID();
  await noteFunnelStep({
    step: 'search.search_made',
    subjectId,
    variant: found.fits > 0 ? 'fit' : 'no_fit',
  });
  if (found.fits === 0 && found.close === 0) {
    await noteFunnelStep({ step: 'saved_search.no_result', subjectId });
  }
}

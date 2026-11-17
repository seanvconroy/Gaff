import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type SearchFilters, searchHref } from '@/domain/search/filters';
import { parseSearch } from '@/domain/search/parse';
import { irishToday } from '@/lib/format';
import { noteFunnelStep } from '@/server/funnels/steps';

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
});

export type WordsOutcome = { href: string; understood: boolean };

export function searchFromWords(input: unknown, now: Date = new Date()): WordsOutcome {
  const { words, rent } = wordsSchema.parse(input);
  const { filters, understood } = parseSearch(words, irishToday(now));
  if (!understood) {
    // States table: nothing understood. The address says so, and holds nothing of the words.
    const params = new URLSearchParams({ unclear: '1', ...(rent ? { rent } : {}) });
    return { href: `/?${params.toString()}`, understood };
  }
  return { href: searchHref(filters, { rent: rent === '1' }), understood };
}

/**
 * UX-ME-4, the Search funnel: a search was made, and whether anything fit. It is counted under
 * an ID made for it alone, so it is never tied to a person, a device or another search. A search
 * that found nothing at all also starts the "Saved search" funnel (WP-23 adds the rest of it).
 */
export async function countSearch(_filters: SearchFilters, found: { fits: number; close: number }) {
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

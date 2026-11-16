import { kindOfHome } from '@/domain/frame/frame';
import { formatRent } from '@/lib/format';
import type { DraftAnswers } from './add-letting';
import { describeKeyFacts, furnishing } from './new-letting';

/**
 * UX-LT-4, UX-LT-22: the home as renters will see it, made from what's already there. The
 * review screen and the go-live screen both show this, and the public page (work package WP-20)
 * is built from the same facts. Nothing here is typed twice, and nothing describes a person.
 */

/** The one summary line under the address: "€1,850 a month · 2-bed apartment · Furnished". */
export function previewSummary(
  home: Pick<DraftAnswers, 'rentCents' | 'propertyType' | 'bedrooms' | 'furnished'>,
): string | null {
  const parts: string[] = [];
  if (home.rentCents !== undefined) parts.push(formatRent(home.rentCents));
  if (home.propertyType && home.bedrooms !== undefined) {
    parts.push(kindOfHome({ propertyType: home.propertyType, bedrooms: home.bedrooms }));
  }
  if (home.furnished) parts.push(furnishing[home.furnished]);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The facts, as label and answer: the key facts, then anything else renters often ask. */
export function previewFacts(home: DraftAnswers): Array<{ label: string; value: string }> {
  if (!home.propertyType || home.bedrooms === undefined) return [];
  return describeKeyFacts({
    propertyType: home.propertyType,
    bedrooms: home.bedrooms,
    bathrooms: home.bathrooms,
    furnished: home.furnished,
    // The BER has a block of its own on the page (UX-LS-8), so it isn't repeated here.
    parking: home.parking,
  });
}

/** "BER C1", "BER exempt", or null where it hasn't been given. */
export function previewBer(berRating: string | undefined | null): string | null {
  if (!berRating) return null;
  return berRating === 'exempt' ? 'BER exempt' : `BER ${berRating}`;
}

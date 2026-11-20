/**
 * UX-SR-12, M56: a search's place, as its address carries it. Kept apart from the place rules
 * (places.ts) so the search's address can be read in the browser without them.
 */

/** A place's slug, as a search's address carries it: "ranelagh", "dublin-6w", "p17". */
export const PLACE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PLACE_SLUG = 120;

/**
 * The redesign's first, hand-made list named a few places differently from the index. A search
 * saved or shared with one of these still opens the same place (the migration moves saved ones).
 */
export const LEGACY_PLACE_IDS: Readonly<Record<string, string>> = {
  bagenalstown: 'muine-bheag',
  dingle: 'dingle-daingean-ui-chuis',
  tubbercurry: 'tobercurry',
};

/** A slug as the search keeps it: lower case, and an old ID as its place in the index. */
export function canonicalPlaceSlug(slug: string): string {
  const lower = slug.trim().toLowerCase();
  return LEGACY_PLACE_IDS[lower] ?? lower;
}

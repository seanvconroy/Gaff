import type { Tx } from '@/db/client';

/** A home's cover photo, as a list or a header shows it (UX-DS-10, UX-NV-9). */
export interface CoverPhoto {
  /** Where the picture is served from. */
  src: string;
  /** What the picture shows, for someone who can't see it. Empty when it only repeats the address. */
  alt: string;
}

/**
 * The cover photo of each of these homes, by letting ID. A home with no photo isn't in the map,
 * and whatever shows it uses the house icon instead, never a broken image (UX-DS-10).
 *
 * The seam for work package WP-9, which adds photos to a letting: no home has one yet, so this
 * returns nothing. When photos are stored, read each home's first one here, in this
 * transaction, which is already scoped to the organisation. Nothing else needs to change:
 * Lettings already draws whatever this returns.
 */
export async function coverPhotosFor(
  _tx: Tx,
  _lettingIds: readonly string[],
): Promise<Map<string, CoverPhoto>> {
  return new Map();
}

import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { lettingPhotos } from '@/db/schema';
import { photoSources } from '@/ports/photo-store';
import { COVER_WIDTH } from '@/domain/lettings/photo-files';

/** A home's cover photo, as a list or a header shows it (UX-DS-10, UX-NV-9). */
export interface CoverPhoto {
  /** Where the picture is served from. */
  src: string;
  /** What the picture shows, for someone who can't see it. Empty when it only repeats the address. */
  alt: string;
}

/**
 * The cover photo of each of these homes, by letting ID: the first of its photos (UX-LT-10).
 * A floor plan is never a cover (M44). A home with no photo isn't in the map, and whatever shows it uses the house icon instead,
 * never a broken image (UX-DS-10). Read in the caller's transaction, which is already scoped to
 * the organisation.
 */
export async function coverPhotosFor(
  tx: Tx,
  lettingIds: readonly string[],
): Promise<Map<string, CoverPhoto>> {
  const covers = new Map<string, CoverPhoto>();
  if (lettingIds.length === 0) return covers;
  const photos = await tx
    .select({
      lettingId: lettingPhotos.lettingId,
      storageKey: lettingPhotos.storageKey,
      widths: lettingPhotos.widths,
    })
    .from(lettingPhotos)
    .where(and(inArray(lettingPhotos.lettingId, [...lettingIds]), eq(lettingPhotos.kind, 'photo')))
    .orderBy(asc(lettingPhotos.position));
  for (const photo of photos) {
    if (photo.lettingId && !covers.has(photo.lettingId)) {
      // The address is beside it wherever a cover is shown, so the picture adds no words.
      // M43: the small size: a cover in a list is never wide.
      covers.set(photo.lettingId, { src: photoSources(photo, COVER_WIDTH).src, alt: '' });
    }
  }
  return covers;
}

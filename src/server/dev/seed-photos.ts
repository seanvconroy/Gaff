import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * BA-4: the test copy's photos (data/seed-photos), real photos of homes, so the made-up homes
 * look as they will when Gaff is live. Each original comes in up to three framings, one for
 * each made-up lister, because Gaff keeps a perceptual hash of every photo for the check that
 * a photo isn't taken from another lister's home (M29, `looksLikeTheSamePhoto`). The seed's
 * tests check the framings stay far enough apart. Every photo goes through the photo pipeline
 * as a lister's would (ADR-0023).
 */

export const SEED_PHOTO_DIR = 'data/seed-photos';

/** Each photo, and what it shows. */
export const seedPhotos = {
  'living-room-and-kitchen': 'Living room opening onto the kitchen',
  'living-room-tall-windows': 'Living room with tall windows and a corner sofa',
  'bed-by-the-window': 'Bed and sofa by tall windows with a city view',
  studio: 'Studio with its kitchen, sofa and bed',
  outside: 'The building from the street, with its balconies',
} as const;

export type SeedPhoto = keyof typeof seedPhotos;
export type Framing = 'full' | 'left' | 'right';

export function seedPhotoFile(photo: SeedPhoto, framing: Framing): string {
  return join(SEED_PHOTO_DIR, `${photo}-${framing}.jpg`);
}

/** The photo as a lister's phone would send it. */
export async function seedPhoto(photo: SeedPhoto, framing: Framing): Promise<Buffer> {
  return readFile(seedPhotoFile(photo, framing));
}

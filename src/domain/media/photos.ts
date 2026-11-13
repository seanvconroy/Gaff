/**
 * M43: listing photos. The browser converts and shrinks what it can; the server trusts only
 * the bytes: it checks the real type, re-encodes every photo at fixed sizes with no location
 * or camera details, and keeps a perceptual hash to spot photos taken from another listing.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTOS_PER_HOME = 40;
/** Q33: at least this many photos to publish (configurable). */
export const MIN_PHOTOS_TO_PUBLISH = 3;
/** Fixed widths served to renters; the largest is also kept as the master. */
export const PHOTO_WIDTHS = [480, 960, 1440, 2048] as const;
/** Smaller than this on its longest side, a photo is too small to show well. */
export const MIN_PHOTO_PIXELS = 400;

export const mediaKinds = ['photo', 'floor_plan', 'logo', 'agent_photo'] as const;
export type MediaKind = (typeof mediaKinds)[number];

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The real type of an image from its first bytes, or null if it isn't one we take. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => at(i) === b)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Words for the letter if this upload can't be taken, or null. */
export function uploadProblem(upload: { contentType: string; bytes: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(upload.contentType)) {
    return 'Add photos as JPEG, PNG or WebP. Photos from an iPhone are converted for you';
  }
  if (upload.bytes <= 0) return 'That file is empty. Try adding it again';
  if (upload.bytes > MAX_UPLOAD_BYTES) return 'Each photo can be up to 25 MB';
  return null;
}

/**
 * A difference hash: from a 9 × 8 greyscale thumbnail (72 values, row by row), one bit per
 * neighbouring pair: is the left pixel brighter than the right? Similar photos get similar bits,
 * even after resizing or recompressing.
 */
export function differenceHash(greyscale: ArrayLike<number>): bigint {
  if (greyscale.length !== 72) throw new Error('differenceHash needs a 9 × 8 greyscale thumbnail');
  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = greyscale[row * 9 + col]!;
      const right = greyscale[row * 9 + col + 1]!;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/** Bits that differ between two 64-bit hashes. */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/** M29: this close, two photos are very likely the same picture. */
export const DUPLICATE_DISTANCE = 6;

/** Postgres stores the hash as a signed 64-bit integer. */
export function toSigned64(hash: bigint): bigint {
  return BigInt.asIntN(64, hash);
}

/** Storage keys: unguessable (the media ID is random), one folder per photo. */
export function mediaKeys(organisationId: string, mediaId: string) {
  const folder = `${organisationId}/${mediaId}`;
  return {
    upload: `${folder}/original`,
    sized: (width: number) => `${folder}/${width}.webp`,
    preview: `${folder}/preview.jpg`,
  };
}

/**
 * M43 (ADR-0023): a home's photo files. The browser redraws what it can; the server trusts only
 * the bytes. It checks the real type, turns every photo upright and writes it again at fixed
 * sizes with no location or camera details, and keeps a perceptual hash of it, so a photo taken
 * from another home's page can be spotted (M29, a later package).
 */

/** Fixed widths a page can ask for. The largest a photo reaches is also its master. */
export const PHOTO_WIDTHS = [480, 960, 1440, 2048] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

/** The width a page usually shows a home's photo at, in pixels across. */
export const SHOWN_WIDTH = 960;
/** The width a list or a header shows a cover at. */
export const COVER_WIDTH = 480;
/**
 * UX-SR-6: how many of a home's photos its card in search carries, to look through in place.
 * The rest are on its page.
 */
export const CARD_PHOTOS = 8;

/** Smaller than this on its longest side, a photo is too small to show well. */
export const MIN_PHOTO_PIXELS = 400;

/**
 * The largest a photo may be when it goes straight to the photo store (Supabase). Through
 * Gaff's own server it is capped lower, by the request limit (`MAX_PHOTO_BYTES`).
 */
export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;

/** No more than this many pixels: anything bigger is refused before it is decoded. */
export const MAX_PHOTO_INPUT_PIXELS = 100_000_000;

/** M44: what a picture is of. A floor plan is shown after the photos and is never the cover. */
export const photoKinds = ['photo', 'floor_plan'] as const;
export type PhotoKind = (typeof photoKinds)[number];

export type ReadablePhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * The real type of a file from its first bytes, never its name or what the browser says. HEIC
 * (an iPhone's own format) is known but not readable here: a phone's browser converts it before
 * it's sent, and one that can't gets a plain answer saying what to do.
 */
export function sniffPhotoType(bytes: Uint8Array): ReadablePhotoType | 'image/heic' | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(8, 12))) {
    return 'image/heic';
  }
  return null;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * The widths to write for a photo this wide (upright): every fixed width it reaches, and at
 * least the smallest, never enlarged past what it is.
 */
export function widthsFor(width: number): PhotoWidth[] {
  const reached = PHOTO_WIDTHS.filter((w) => w <= width);
  return reached.length > 0 ? reached : [PHOTO_WIDTHS[0]];
}

/**
 * The stored width that serves a page asking for `wanted` pixels: the smallest at least that
 * wide, or the largest there is.
 */
export function widthFor(widths: readonly number[], wanted: number): number | null {
  if (widths.length === 0) return null;
  const sorted = [...widths].sort((a, b) => a - b);
  return sorted.find((w) => w >= wanted) ?? sorted[sorted.length - 1]!;
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

/**
 * M29: this close, two photos are very likely the same picture. The check that uses it (a photo
 * taken from another organisation's home) is a later package; the hash is kept for it now.
 */
export const DUPLICATE_DISTANCE = 6;

/** Whether two photos' hashes say they are the same picture (the seam for M29). */
export function looksLikeTheSamePhoto(a: bigint, b: bigint): boolean {
  return hammingDistance(a, b) <= DUPLICATE_DISTANCE;
}

/** Postgres keeps the hash as a signed 64-bit integer. */
export function toSigned64(hash: bigint): bigint {
  return BigInt.asIntN(64, hash);
}

import sharp from 'sharp';
import {
  MAX_PHOTO_INPUT_PIXELS,
  MIN_PHOTO_PIXELS,
  differenceHash,
  sniffPhotoType,
  widthsFor,
  type PhotoWidth,
} from '@/domain/lettings/photo-files';

/**
 * M43 (ADR-0021): every photo a lister adds is made again from its pixels. Its real type is read
 * from its bytes; it is turned the right way up; it is written at the fixed WebP widths and as a
 * 1,200 px JPEG for link previews. sharp keeps no metadata unless asked to, so nothing that says
 * where, when or with what it was taken (location above all) survives, and colours are sRGB.
 * The file that came in is never kept.
 */

export type PipelineProblem = 'not_a_photo' | 'heic' | 'too_small' | 'unreadable';

export interface PreparedPhoto {
  /** Upright, in pixels. */
  width: number;
  height: number;
  sizes: Array<{ width: PhotoWidth; bytes: Buffer }>;
  preview: Buffer;
  /** M29: a 64-bit difference hash of the upright picture. */
  phash: bigint;
}

const PREVIEW_WIDTH = 1200;

/** Refuses anything over the pixel limit before decoding it, and any damaged file. */
const reading = { limitInputPixels: MAX_PHOTO_INPUT_PIXELS, failOn: 'error' as const };

/** M29: a photo's perceptual hash, from a 9 × 8 greyscale thumbnail of it the right way up. */
export async function photoHash(input: Buffer): Promise<bigint> {
  const thumb = await sharp(input, reading)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  return differenceHash(thumb);
}

export async function preparePhoto(
  input: Buffer,
): Promise<{ ok: true; photo: PreparedPhoto } | { ok: false; problem: PipelineProblem }> {
  const type = sniffPhotoType(input);
  if (type === 'image/heic') return { ok: false, problem: 'heic' };
  if (!type) return { ok: false, problem: 'not_a_photo' };
  try {
    const meta = await sharp(input, reading).metadata();
    // EXIF orientations 5 to 8 are a quarter turn: the picture is taller than it is stored.
    const turned = (meta.orientation ?? 1) >= 5;
    const width = (turned ? meta.height : meta.width) ?? 0;
    const height = (turned ? meta.width : meta.height) ?? 0;
    if (Math.max(width, height) < MIN_PHOTO_PIXELS) return { ok: false, problem: 'too_small' };

    const upright = sharp(input, reading).rotate();
    const sizes: PreparedPhoto['sizes'] = [];
    for (const w of widthsFor(width)) {
      const bytes = await upright
        .clone()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      sizes.push({ width: w, bytes });
    }
    const preview = await upright
      .clone()
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { ok: true, photo: { width, height, sizes, preview, phash: await photoHash(input) } };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

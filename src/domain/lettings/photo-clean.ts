import { photoKind, stripJpegMetadata } from '@/domain/tenancy/movein';
import type { PhotoType } from './photos';

/**
 * UX-LT-10: Gaff keeps its own copy of a home's photo with no location or camera data. The
 * browser re-draws a photo before upload, which already drops all of it and resizes it for
 * display (src/ui/PhotoUploader). This is the server's own check, for a photo that arrives
 * as it left the camera: the picture is kept, and anything that describes where, when or with
 * what it was taken is taken out. A file it can't read safely is refused, never stored as it is.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** PNG chunks that hold text, Exif or the time a file was last changed. */
const PNG_DROPPED = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** A PNG without its text, Exif and time chunks, or null if it isn't a PNG that reads cleanly. */
export function stripPngMetadata(input: Buffer): Buffer | null {
  if (input.length < 20 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const parts: Buffer[] = [PNG_SIGNATURE];
  let at = 8;
  while (at + 12 <= input.length) {
    const end = at + 12 + input.readUInt32BE(at);
    if (end > input.length) return null;
    const type = input.subarray(at + 4, at + 8).toString('latin1');
    if (!PNG_DROPPED.has(type)) parts.push(input.subarray(at, end));
    if (type === 'IEND') return Buffer.concat(parts);
    at = end;
  }
  return null;
}

/** In a WebP's VP8X header: whether the file carries Exif, and XMP. */
const WEBP_EXIF_FLAG = 0x08;
const WEBP_XMP_FLAG = 0x04;

/** A WebP without its Exif and XMP chunks, or null if it isn't a WebP that reads cleanly. */
export function stripWebpMetadata(input: Buffer): Buffer | null {
  if (
    input.length < 20 ||
    input.subarray(0, 4).toString('latin1') !== 'RIFF' ||
    input.subarray(8, 12).toString('latin1') !== 'WEBP'
  ) {
    return null;
  }
  const parts: Buffer[] = [];
  let at = 12;
  while (at + 8 <= input.length) {
    const type = input.subarray(at, at + 4).toString('latin1');
    const size = input.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    if (at + 8 + size > input.length) return null;
    if (type === 'VP8X' && size >= 1) {
      const chunk = Buffer.from(input.subarray(at, Math.min(end, input.length)));
      chunk[8] = chunk[8]! & ~(WEBP_EXIF_FLAG | WEBP_XMP_FLAG);
      parts.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      parts.push(input.subarray(at, Math.min(end, input.length)));
    }
    at = end;
  }
  if (parts.length === 0) return null;
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

export type CleanedPhoto =
  | { ok: true; bytes: Buffer; type: PhotoType }
  | { ok: false; problem: 'not_a_photo' | 'unreadable' };

/**
 * The photo to keep: its real type, read from its first bytes and never from what the browser
 * claims, and its bytes with the metadata taken out.
 */
export function cleanPhoto(input: Buffer): CleanedPhoto {
  const type = photoKind(input);
  if (!type) return { ok: false, problem: 'not_a_photo' };
  const bytes =
    type === 'image/jpeg'
      ? stripJpegMetadata(input)
      : type === 'image/png'
        ? stripPngMetadata(input)
        : stripWebpMetadata(input);
  return bytes ? { ok: true, bytes, type } : { ok: false, problem: 'unreadable' };
}

import { z } from 'zod';

/**
 * R25, stage 8: moving in. A short checklist (keys, alarms, meter readings, repairs), and an
 * inventory room by room with photos, which the tenant can see and confirm.
 */
export const checklistItems = [
  { name: 'keys', label: 'Keys handed over' },
  { name: 'alarms', label: 'Smoke and carbon monoxide alarms tested' },
  { name: 'repairs', label: 'Told the tenant how to report repairs' },
] as const;

const reading = z.string().trim().max(40, 'Keep it to the number on the meter.');

export const checklistSchema = z.object({
  keys: z
    .string()
    .optional()
    .transform((v) => (v === 'yes' ? 'yes' : '')),
  alarms: z
    .string()
    .optional()
    .transform((v) => (v === 'yes' ? 'yes' : '')),
  electricity: reading.optional().transform((v) => v ?? ''),
  gas: reading.optional().transform((v) => v ?? ''),
  repairs: z
    .string()
    .optional()
    .transform((v) => (v === 'yes' ? 'yes' : '')),
});

export type Checklist = z.output<typeof checklistSchema>;

export const conditions = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  worn: 'Worn',
  damaged: 'Damaged',
} as const;

export const inventoryItemSchema = z.object({
  room: z.string().trim().min(1, 'Enter the room.').max(60),
  item: z.string().trim().min(1, 'Enter the item.').max(80),
  condition: z.enum(['new', 'good', 'fair', 'worn', 'damaged'], {
    error: 'Choose its condition.',
  }),
  note: z
    .string()
    .trim()
    .max(280, 'Keep the note short.')
    .optional()
    .transform((v) => (v ? v : null)),
});

export { MAX_PHOTO_BYTES } from './photos';

/** The real type of a photo, from its first bytes, never from what the browser claims. */
export function photoKind(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Removes Exif (which can hold the location and the camera), Photoshop/IPTC and comment
 * segments from a JPEG, keeping the picture. Returns null if it can't read the file safely.
 * The browser already re-draws photos before upload; this is the server's own check.
 */
export function stripJpegMetadata(input: Buffer): Buffer | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const parts: Buffer[] = [input.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= input.length) {
    if (input[i] !== 0xff) return null;
    const marker = input[i + 1]!;
    if (marker === 0xda) {
      parts.push(input.subarray(i));
      return Buffer.concat(parts);
    }
    const end = i + 2 + input.readUInt16BE(i + 2);
    if (end > input.length) return null;
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(input.subarray(i, end));
    i = end;
  }
  return null;
}

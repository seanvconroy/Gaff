import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  checklistSchema,
  inventoryItemSchema,
  photoKind,
  stripJpegMetadata,
} from './movein';

const segment = (marker: number, body: number[]) => [0xff, marker, 0, body.length + 2, ...body];

describe('R25: the move-in checklist', () => {
  it('records the keys, the alarms, the meter readings and how to report repairs', () => {
    expect(
      checklistSchema.parse({
        keys: 'yes',
        alarms: 'yes',
        electricity: ' 012345 ',
        gas: '',
        repairs: '',
      }),
    ).toEqual({ keys: 'yes', alarms: 'yes', electricity: '012345', gas: '', repairs: '' });
    expect(checklistSchema.safeParse({ electricity: 'x'.repeat(41) }).success).toBe(false);
  });
});

describe('R25: the inventory', () => {
  it('takes a room, an item, its condition and an optional short note', () => {
    expect(
      inventoryItemSchema.parse({ room: 'Kitchen', item: 'Fridge', condition: 'good', note: '' }),
    ).toEqual({ room: 'Kitchen', item: 'Fridge', condition: 'good', note: null });
    const bad = inventoryItemSchema.safeParse({ room: '', item: '', condition: 'shiny' });
    expect(bad.error!.issues.map((i) => i.message)).toEqual([
      'Enter the room.',
      'Enter the item.',
      'Choose its condition.',
    ]);
  });

  it('accepts only real JPEG, PNG or WebP photos, and not too big', () => {
    expect(photoKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(photoKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
    expect(photoKind(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(photoKind(Buffer.from('<svg></svg>'))).toBeNull();
    expect(MAX_PHOTO_BYTES).toBe(4 * 1024 * 1024);
  });

  it('strips location and camera details from a JPEG, keeping the picture', () => {
    const jpeg = Buffer.from([
      0xff,
      0xd8,
      ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46]), // JFIF: kept
      ...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x47, 0x50, 0x53]), // Exif with GPS: removed
      ...segment(0xfe, [0x68, 0x69]), // comment: removed
      0xff,
      0xda,
      0x00,
      0x02,
      0x11,
      0x22,
      0xff,
      0xd9, // scan data to the end: kept
    ]);
    const stripped = stripJpegMetadata(jpeg)!;
    expect([...stripped]).toEqual([
      0xff,
      0xd8,
      ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46]),
      0xff,
      0xda,
      0x00,
      0x02,
      0x11,
      0x22,
      0xff,
      0xd9,
    ]);
    expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0x00]))).toBeNull();
  });
});

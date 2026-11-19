import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_DISTANCE,
  differenceHash,
  hammingDistance,
  looksLikeTheSamePhoto,
  sniffPhotoType,
  toSigned64,
  widthFor,
  widthsFor,
} from './photo-files';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('M43: a home’s photo files', () => {
  it('M43: knows an image by its bytes, not its name', () => {
    expect(sniffPhotoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffPhotoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffPhotoType(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffPhotoType(text('%PDF-1.7'))).toBeNull();
    expect(sniffPhotoType(text('<svg>'))).toBeNull();
    expect(sniffPhotoType(bytes())).toBeNull();
  });

  it('M43: knows a HEIC photo from an iPhone by its bytes, whatever it is called', () => {
    expect(sniffPhotoType(text('\0\0\0\x18ftypheic\0\0\0\0mif1heic'))).toBe('image/heic');
    expect(sniffPhotoType(text('\0\0\0\x18ftypmif1\0\0\0\0mif1heic'))).toBe('image/heic');
    // A video or an AVIF is not a HEIC photo.
    expect(sniffPhotoType(text('\0\0\0\x18ftypisom\0\0\0\0'))).toBeNull();
    expect(sniffPhotoType(text('\0\0\0\x18ftypavif\0\0\0\0'))).toBeNull();
  });

  it('M43: writes every fixed width a photo reaches, and never enlarges one', () => {
    expect(widthsFor(4032)).toEqual([480, 960, 1440, 2048]);
    expect(widthsFor(1600)).toEqual([480, 960, 1440]);
    expect(widthsFor(960)).toEqual([480, 960]);
    expect(widthsFor(420)).toEqual([480]);
  });

  it('M43: a page asks for the size it needs, and gets the nearest kept', () => {
    expect(widthFor([480, 960, 1440], 900)).toBe(960);
    expect(widthFor([480, 960, 1440], 480)).toBe(480);
    expect(widthFor([480, 960], 2048)).toBe(960);
    expect(widthFor([], 960)).toBeNull();
  });

  it('M29: similar thumbnails get close hashes, different ones distant hashes', () => {
    const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 20);
    const nudged = gradient.map((v, i) => (i === 40 ? v + 50 : v));
    const reversed = gradient.map((v) => 255 - v);
    const a = differenceHash(gradient);
    expect(hammingDistance(a, differenceHash(nudged))).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
    expect(looksLikeTheSamePhoto(a, differenceHash(nudged))).toBe(true);
    expect(hammingDistance(a, differenceHash(reversed))).toBe(64);
    expect(looksLikeTheSamePhoto(a, differenceHash(reversed))).toBe(false);
    expect(hammingDistance(a, a)).toBe(0);
    expect(() => differenceHash([1, 2, 3])).toThrow(/9 × 8/);
  });

  it('M29: keeps hashes as signed 64-bit numbers without losing bits', () => {
    const hash = 0xffff_0000_ffff_0000n;
    const stored = toSigned64(hash);
    expect(stored).toBeLessThan(0n);
    expect(hammingDistance(hash, stored)).toBe(0);
  });
});

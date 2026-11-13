import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_DISTANCE,
  differenceHash,
  hammingDistance,
  mediaKeys,
  sniffImageType,
  toSigned64,
  uploadProblem,
} from './photos';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('M43: photos', () => {
  it('knows an image by its bytes, not its name', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<svg>'))).toBeNull();
  });

  it('takes JPEG, PNG and WebP up to 25 MB', () => {
    expect(uploadProblem({ contentType: 'image/jpeg', bytes: 2_000_000 })).toBeNull();
    expect(uploadProblem({ contentType: 'image/heic', bytes: 2_000_000 })).toMatch(/iPhone/);
    expect(uploadProblem({ contentType: 'image/png', bytes: 26 * 1024 * 1024 })).toMatch(/25 MB/);
    expect(uploadProblem({ contentType: 'image/png', bytes: 0 })).toMatch(/empty/);
  });

  it('M29: similar thumbnails get close hashes, different ones distant hashes', () => {
    const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 20);
    const nudged = gradient.map((v, i) => (i === 40 ? v + 50 : v));
    const reversed = gradient.map((v) => 255 - v);
    const a = differenceHash(gradient);
    expect(hammingDistance(a, differenceHash(nudged))).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
    expect(hammingDistance(a, differenceHash(reversed))).toBe(64);
    expect(hammingDistance(a, a)).toBe(0);
  });

  it('stores hashes as signed 64-bit numbers without losing bits', () => {
    const hash = 0xffff_0000_ffff_0000n;
    const stored = toSigned64(hash);
    expect(stored).toBeLessThan(0n);
    expect(hammingDistance(hash, stored)).toBe(0);
  });

  it('keeps each photo in its own folder', () => {
    const keys = mediaKeys('org-1', 'media-1');
    expect(keys.upload).toBe('org-1/media-1/original');
    expect(keys.sized(960)).toBe('org-1/media-1/960.webp');
  });
});

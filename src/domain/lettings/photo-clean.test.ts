import { describe, expect, it } from 'vitest';
import { cleanPhoto, stripPngMetadata, stripWebpMetadata } from './photo-clean';

/** A made-up place in a made-up Exif block: what must never be kept. */
const WHERE = 'GPS 53.3263 -6.2551';

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The check is on structure, not on the checksum, so any four bytes will do here.
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (...chunks: Buffer[]) => Buffer.concat([pngSignature, ...chunks]);
const picture = Buffer.from('the picture itself');

function webpChunk(type: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  return Buffer.concat([
    Buffer.from(type, 'latin1'),
    size,
    data,
    Buffer.alloc(data.length % 2), // chunks are padded to an even length
  ]);
}

function webp(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

function jpeg(...segments: Array<[number, Buffer]>): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  for (const [marker, data] of segments) {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(data.length + 2);
    parts.push(Buffer.from([0xff, marker]), length, data);
  }
  parts.push(Buffer.from([0xff, 0xda]), picture, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

describe('UX-LT-10: Gaff’s copy of a photo has no location or camera data', () => {
  it('UX-LT-10: a JPEG loses its Exif and keeps its picture', () => {
    const cleaned = cleanPhoto(
      jpeg([0xe0, Buffer.from('JFIF')], [0xe1, Buffer.from(`Exif ${WHERE}`)]),
    );
    expect(cleaned.ok).toBe(true);
    if (!cleaned.ok) return;
    expect(cleaned.type).toBe('image/jpeg');
    expect(cleaned.bytes.includes(WHERE)).toBe(false);
    expect(cleaned.bytes.includes(picture)).toBe(true);
    expect(cleaned.bytes.includes('JFIF')).toBe(true);
  });

  it('UX-LT-10: a PNG loses its text, Exif and time chunks and keeps its picture', () => {
    const cleaned = stripPngMetadata(
      png(
        pngChunk('IHDR', Buffer.alloc(13)),
        pngChunk('eXIf', Buffer.from(WHERE)),
        pngChunk('tEXt', Buffer.from('Author\0Ann Power')),
        pngChunk('iTXt', Buffer.from('made on a phone')),
        pngChunk('tIME', Buffer.alloc(7)),
        pngChunk('IDAT', picture),
        pngChunk('IEND', Buffer.alloc(0)),
      ),
    )!;
    expect(cleaned.includes(WHERE)).toBe(false);
    expect(cleaned.includes('Ann Power')).toBe(false);
    expect(cleaned.includes('made on a phone')).toBe(false);
    expect(cleaned.includes('tIME')).toBe(false);
    expect(cleaned.includes(picture)).toBe(true);
    expect(cleaned.subarray(0, 8).equals(pngSignature)).toBe(true);
    expect(cleaned.subarray(-12, -8).readUInt32BE()).toBe(0);
    expect(cleaned.subarray(-8, -4).toString('latin1')).toBe('IEND');
  });

  it('UX-LT-10: a WebP loses its Exif and XMP chunks, and no longer says it has them', () => {
    const cleaned = stripWebpMetadata(
      webp(
        webpChunk('VP8X', Buffer.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
        webpChunk('VP8 ', picture),
        webpChunk('EXIF', Buffer.from(WHERE)),
        webpChunk('XMP ', Buffer.from('<x:xmpmeta>a camera</x:xmpmeta>')),
      ),
    )!;
    expect(cleaned.includes(WHERE)).toBe(false);
    expect(cleaned.includes('xmpmeta')).toBe(false);
    expect(cleaned.includes(picture)).toBe(true);
    // The header still adds up, and the flags for Exif and XMP are cleared.
    expect(cleaned.readUInt32LE(4)).toBe(cleaned.length - 8);
    expect(cleaned[20]! & 0x0c).toBe(0);
    expect(cleanPhoto(cleaned)).toMatchObject({ ok: true, type: 'image/webp' });
  });

  it('UX-LT-10: a photo with nothing to take out comes back whole', () => {
    const plain = png(
      pngChunk('IHDR', Buffer.alloc(13)),
      pngChunk('IDAT', picture),
      pngChunk('IEND', Buffer.alloc(0)),
    );
    expect(stripPngMetadata(plain)!.equals(plain)).toBe(true);
    const simple = webp(webpChunk('VP8 ', picture));
    expect(stripWebpMetadata(simple)!.equals(simple)).toBe(true);
  });

  it('UX-LT-10: a file that isn’t a photo is refused, whatever it calls itself', () => {
    expect(cleanPhoto(Buffer.from('<svg onload="x"></svg>'))).toEqual({
      ok: false,
      problem: 'not_a_photo',
    });
    expect(cleanPhoto(Buffer.from('%PDF-1.7 a brochure'))).toEqual({
      ok: false,
      problem: 'not_a_photo',
    });
  });

  it('UX-LT-10: a photo that can’t be read safely is refused, never kept as it is', () => {
    const cutShort = png(pngChunk('IHDR', Buffer.alloc(13)), pngChunk('eXIf', Buffer.from(WHERE)));
    expect(cleanPhoto(cutShort)).toEqual({ ok: false, problem: 'unreadable' });
    const lying = webp(webpChunk('VP8 ', picture)).subarray(0, 24);
    expect(cleanPhoto(lying)).toEqual({ ok: false, problem: 'unreadable' });
    expect(cleanPhoto(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toEqual({
      ok: false,
      problem: 'unreadable',
    });
  });
});

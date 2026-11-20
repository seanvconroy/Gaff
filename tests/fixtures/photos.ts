import { deflateSync } from 'node:zlib';

/** Made-up photos for tests: squares of one colour. Never a real home, never a real place. */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, sum]);
}

/**
 * A PNG of one colour, 480 pixels square unless `size` says (big enough to show: M43). `text` adds a text chunk, as a camera or an editor writes one: the kind
 * of thing Gaff takes out before it keeps a photo (UX-LT-10).
 */
export function aPng(
  [r, g, b]: readonly [number, number, number],
  options: { size?: number; text?: string } = {},
): Buffer {
  const size = options.size ?? 480;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([r, g, b]))]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(options.text ? [chunk('tEXt', Buffer.from(`Comment\0${options.text}`, 'latin1'))] : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * BA-10 (M29): a made-up "photo" with detail: a grid of grey blocks, from a seed. The same seed
 * makes the same picture, so its hash matches; a different seed makes a different one. A plain
 * square (`aPng`) has no detail to match, so the checks never call it another lister's.
 */
export function aDetailedPng(seed: number, size = 480): Buffer {
  const cells = 12;
  let state = (Math.imul(seed, 2654435761) + 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
  const shades = Array.from({ length: cells * cells }, () => Math.round(random() * 255));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: size }, (_, y) => {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const shade =
        shades[Math.floor((y * cells) / size) * cells + Math.floor((x * cells) / size)]!;
      row.set([shade, shade, Math.min(255, shade + 30)], 1 + x * 3);
    }
    return row;
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

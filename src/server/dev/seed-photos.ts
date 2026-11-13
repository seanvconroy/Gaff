import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * The test copy's photos (data/seed-photos): real photos of homes, so the made-up listings look
 * as they will when Gaff is live. Each original comes in three framings, one for each made-up
 * letter, because Gaff's copied-photo check (M29) holds a listing whose photos match another
 * letter's. The seed's tests check the framings stay far enough apart.
 */

export const SEED_PHOTO_DIR = 'data/seed-photos';

/** Each photo, and what it shows, for screen readers (M109). */
export const seedPhotos = {
  'living-room-and-kitchen': 'Living room opening onto the kitchen',
  'living-room-tall-windows': 'Living room with tall windows and a corner sofa',
  'bed-by-the-window': 'Bed and sofa by tall windows with a city view',
  studio: 'Studio with its kitchen, sofa and bed',
  outside: 'The building from the street, with its balconies',
} as const;

export type SeedPhoto = keyof typeof seedPhotos;
export type Framing = 'full' | 'left' | 'right';

export function seedPhotoFile(photo: SeedPhoto, framing: Framing): string {
  return join(SEED_PHOTO_DIR, `${photo}-${framing}.jpg`);
}

/** The photo as a letter's phone would upload it. */
export async function seedPhoto(photo: SeedPhoto, framing: Framing): Promise<Buffer> {
  return readFile(seedPhotoFile(photo, framing));
}

/**
 * Earlier versions of the seed drew each home's photos instead: simple drawings made from a
 * seed. They're kept so the seed can recognise those drawings on the test copy and swap them for
 * the photos above.
 */

export type SceneKind = 'outside' | 'living' | 'kitchen' | 'bedroom';

const WIDTH = 1600;
const HEIGHT = 1067;

function random(seed: number) {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof random>;
const between = (r: Rand, min: number, max: number) => min + (max - min) * r();
const pick = <T>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

const walls = ['#efe6d8', '#e4ebe4', '#f1e3dc', '#dfe6ee', '#ece4cf', '#e8dfe9', '#f4efe6'];
const woods = ['#b08156', '#9c6b43', '#c79a6b', '#8a5a3b', '#d2b48c', '#a47551'];
const fabrics = ['#3f6f73', '#7a4e5a', '#566d3c', '#c08a3e', '#44506b', '#8c3f3f', '#6d6a75'];
const doors = ['#9b2c2c', '#24486b', '#2f5d3a', '#d7a62b', '#5a2d4f', '#1f1f1f'];
const bricks = ['#a2553e', '#b86b4b', '#8e4a3a', '#c9b79c', '#d8cfc0', '#9a9a92'];
const skies = [
  ['#9cc3e6', '#e6f0f7'],
  ['#7fa9d1', '#d9e7f2'],
  ['#b5c9d6', '#eef2f4'],
  ['#c7b8d9', '#f2e8e1'],
] as const;

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${fill}" ${extra}/>`;
}

function windowPane(r: Rand, x: number, y: number, w: number, h: number, sky: readonly string[]) {
  const frame = '#f7f5f0';
  const glass = r() < 0.5 ? sky[0]! : '#c9dbe8';
  return [
    rect(x - 10, y - 10, w + 20, h + 20, frame),
    rect(x, y, w, h, glass),
    rect(x + w / 2 - 4, y, 8, h, frame),
    rect(x, y + h / 2 - 4, w, 8, frame),
  ].join('');
}

function outside(r: Rand): string {
  const sky = pick(r, skies);
  const horizon = between(r, 640, 820);
  const parts: string[] = [
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>`,
    rect(0, 0, WIDTH, HEIGHT, 'url(#sky)'),
  ];
  for (let i = 0; i < 3 + Math.floor(r() * 4); i++) {
    const cx = between(r, 0, WIDTH);
    const cy = between(r, 60, 300);
    parts.push(
      `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${between(r, 80, 200).toFixed(0)}" ry="${between(r, 25, 55).toFixed(0)}" fill="#ffffff" opacity="0.8"/>`,
    );
  }
  parts.push(rect(0, horizon, WIDTH, HEIGHT - horizon, pick(r, ['#6f8f4e', '#7d9a5a', '#8c8c86'])));
  parts.push(rect(0, horizon + between(r, 60, 140), WIDTH, 400, '#a9a59c'));

  const style = Math.floor(r() * 3);
  const left = between(r, 120, 520);
  const width = between(r, 640, 980);
  const floors = style === 1 ? 4 + Math.floor(r() * 3) : 2;
  const floorHeight = style === 1 ? between(r, 100, 130) : between(r, 180, 230);
  const top = horizon - floors * floorHeight;
  const wall = pick(r, bricks);
  if (style !== 1) {
    // A pitched roof for a house; a flat parapet for an apartment block.
    const peak = top - between(r, 120, 220);
    parts.push(
      `<polygon points="${left - 30},${top} ${left + width / 2},${peak} ${left + width + 30},${top}" fill="${pick(r, ['#4a4a52', '#5b3d33', '#3d4a52'])}"/>`,
    );
  } else {
    parts.push(rect(left - 15, top - 30, width + 30, 30, '#77736c'));
  }
  parts.push(rect(left, top, width, horizon - top, wall));
  const columns = 2 + Math.floor(r() * 3);
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < columns; c++) {
      const w = (width / columns) * between(r, 0.38, 0.55);
      const x = left + (width / columns) * (c + 0.5) - w / 2;
      const h = floorHeight * between(r, 0.5, 0.65);
      const y = top + f * floorHeight + floorHeight * 0.2;
      const isDoor = f === floors - 1 && c === Math.floor(columns / 2) && style !== 1;
      if (isDoor) {
        parts.push(
          rect(
            x,
            top + f * floorHeight + floorHeight * 0.15,
            w,
            floorHeight * 0.85,
            pick(r, doors),
          ),
        );
        parts.push(
          `<circle cx="${(x + w * 0.8).toFixed(0)}" cy="${(top + (f + 0.6) * floorHeight).toFixed(0)}" r="7" fill="#d9c27a"/>`,
        );
      } else {
        parts.push(windowPane(r, x, y, w, h, sky));
      }
    }
  }
  for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
    const tx = pick(r, [between(r, 20, left - 60), between(r, left + width + 60, WIDTH - 40)]);
    const size = between(r, 70, 150);
    parts.push(rect(tx - 10, horizon - size * 1.2, 20, size * 1.4, '#6b4f3a'));
    parts.push(
      `<circle cx="${tx.toFixed(0)}" cy="${(horizon - size * 1.5).toFixed(0)}" r="${size.toFixed(0)}" fill="${pick(r, ['#4f7942', '#5e8a4f', '#3f6b3a'])}"/>`,
    );
  }
  return parts.join('');
}

function room(r: Rand, kind: Exclude<SceneKind, 'outside'>): string {
  const sky = pick(r, skies);
  const floorLine = between(r, 640, 780);
  const wall = pick(r, walls);
  const floor = pick(r, woods);
  const parts: string[] = [
    rect(0, 0, WIDTH, floorLine, wall),
    rect(0, floorLine, WIDTH, HEIGHT - floorLine, floor),
  ];
  for (let i = 1; i < 8; i++) {
    const x = (WIDTH / 8) * i + between(r, -40, 40);
    parts.push(
      `<line x1="${(WIDTH / 2).toFixed(0)}" y1="${floorLine.toFixed(0)}" x2="${(x * 2 - WIDTH / 2).toFixed(0)}" y2="${HEIGHT}" stroke="#000" stroke-opacity="0.08" stroke-width="4"/>`,
    );
  }
  parts.push(rect(0, floorLine - 24, WIDTH, 24, '#ffffff', 'opacity="0.7"'));
  const wx = between(r, 80, WIDTH - 520);
  const ww = between(r, 300, 460);
  const wy = between(r, 120, 220);
  parts.push(windowPane(r, wx, wy, ww, between(r, 260, 380), sky));

  if (kind === 'living') {
    const sx = between(r, 60, WIDTH - 760);
    const sw = between(r, 560, 720);
    const sofa = pick(r, fabrics);
    parts.push(rect(sx, floorLine - 260, sw, 140, sofa, 'rx="24"'));
    parts.push(rect(sx - 30, floorLine - 170, sw + 60, 150, sofa, 'rx="24" opacity="0.92"'));
    parts.push(rect(sx + 40, floorLine - 230, 140, 90, '#f2ede4', 'rx="18"'));
    parts.push(
      `<ellipse cx="${(sx + sw / 2).toFixed(0)}" cy="${(floorLine + 150).toFixed(0)}" rx="${(sw * 0.6).toFixed(0)}" ry="70" fill="${pick(r, fabrics)}" opacity="0.55"/>`,
    );
    // A picture on the wall, on whichever side of the window has room.
    const fx =
      wx > WIDTH / 2
        ? between(r, 80, Math.max(90, wx - 300))
        : between(r, Math.min(wx + ww + 60, WIDTH - 310), WIDTH - 300);
    parts.push(
      rect(
        fx,
        between(r, 140, 260),
        200,
        150,
        pick(r, ['#d9a441', '#5b7f95', '#b5654b']),
        'stroke="#3a3a3a" stroke-width="10"',
      ),
    );
  } else if (kind === 'kitchen') {
    const units = 4 + Math.floor(r() * 4);
    const start = between(r, 0, 240);
    const unitWidth = (WIDTH - start - between(r, 0, 240)) / units;
    const cabinet = pick(r, ['#f4f1ea', '#5d7a6f', '#2f3e4f', '#c9b28f', '#8aa1b1']);
    for (let i = 0; i < units; i++) {
      const x = start + i * unitWidth;
      parts.push(
        rect(
          x + 4,
          floorLine - 300,
          unitWidth - 8,
          290,
          cabinet,
          'stroke="#000" stroke-opacity="0.15" stroke-width="3"',
        ),
      );
      if (r() < 0.6 && (x + unitWidth < wx || x > wx + ww)) {
        parts.push(
          rect(
            x + 4,
            60,
            unitWidth - 8,
            220,
            cabinet,
            'stroke="#000" stroke-opacity="0.15" stroke-width="3"',
          ),
        );
      }
    }
    parts.push(
      rect(
        start,
        floorLine - 320,
        WIDTH - start * 2 + start,
        30,
        pick(r, ['#d9d4cc', '#3b3b3b', '#e8e2d6']),
      ),
    );
    for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
      const lx = between(r, 200, WIDTH - 200);
      parts.push(
        `<line x1="${lx.toFixed(0)}" y1="0" x2="${lx.toFixed(0)}" y2="140" stroke="#333" stroke-width="4"/>`,
      );
      parts.push(
        `<ellipse cx="${lx.toFixed(0)}" cy="160" rx="60" ry="34" fill="${pick(r, ['#2f2f2f', '#c9a227', '#e8e8e8'])}"/>`,
      );
    }
  } else {
    const bx = between(r, 80, WIDTH - 900);
    const bw = between(r, 680, 820);
    parts.push(rect(bx, floorLine - 380, bw, 220, pick(r, woods), 'rx="14"'));
    parts.push(rect(bx - 20, floorLine - 200, bw + 40, 210, '#f6f3ee', 'rx="20"'));
    parts.push(rect(bx - 20, floorLine - 120, bw + 40, 160, pick(r, fabrics), 'rx="20"'));
    parts.push(rect(bx + 60, floorLine - 250, 200, 80, '#ffffff', 'rx="20"'));
    parts.push(rect(bx + bw - 260, floorLine - 250, 200, 80, '#ffffff', 'rx="20"'));
    for (const side of [bx - 200, bx + bw + 60]) {
      if (side < 0 || side > WIDTH - 140) continue;
      parts.push(rect(side, floorLine - 170, 140, 170, pick(r, woods)));
      parts.push(
        `<polygon points="${side + 30},${floorLine - 290} ${side + 110},${floorLine - 290} ${side + 130},${floorLine - 210} ${side + 10},${floorLine - 210}" fill="#f1e7c9"/>`,
      );
    }
  }
  return parts.join('');
}

/** The SVG drawing for a scene; the same seed always draws the same picture. */
export function sceneSvg(kind: SceneKind, seed: number): string {
  const r = random(seed);
  const body = kind === 'outside' ? outside(r) : room(r, kind);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}</svg>`;
}

/** A JPEG of the scene, as a letter's phone would upload it. */
export async function scenePhoto(kind: SceneKind, seed: number): Promise<Buffer> {
  return sharp(Buffer.from(sceneSvg(kind, seed)))
    .jpeg({ quality: 82 })
    .toBuffer();
}

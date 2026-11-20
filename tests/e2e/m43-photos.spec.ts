import { expect, test } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { aPng } from '../fixtures/photos';
import {
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  homeIdIn,
  screenshot,
  signUpOperator,
} from './support';

/** BA-7: the photo pipeline (M43) and floor plans (M44), through the real screens. */

const widths = [
  ['390', { width: 390, height: 844 }],
  ['1280', { width: 1280, height: 900 }],
] as const;

async function refOf(lettingId: string): Promise<string> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<{ ref: string }>(
      'select public_ref as ref from lettings where id = $1',
      [lettingId],
    );
    await client.query('commit');
    return rows[0]!.ref;
  } finally {
    await client.end();
  }
}

/** A made-up photo as a camera writes it: sideways, with the camera's name and a place. */
async function aCameraPhoto(): Promise<Buffer> {
  const [width, height] = [1200, 800];
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    const x = (i / 3) % width;
    pixels[i] = Math.round((x / width) * 200);
    pixels[i + 1] = 90;
    pixels[i + 2] = 140;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: 'Made-up Camera Co' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '53/1 19/1 3144/100' },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** A made-up floor plan: rooms drawn in lines on white. */
async function aFloorPlan(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
    <rect width="1000" height="700" fill="#fff"/>
    <g fill="none" stroke="#222" stroke-width="8">
      <rect x="40" y="40" width="920" height="620"/>
      <path d="M520 40 V420 M40 420 H760 M760 420 V660 M300 420 V660"/>
    </g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** An iPhone's HEIC photo, by its first bytes: this browser can't open it. */
const aHeic = Buffer.concat([
  Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heic', 'latin1'),
  Buffer.alloc(256),
]);

test('M43, M44: every photo comes out upright, clean and at fixed sizes; a floor plan follows the photos, on the letting and on its page', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page, `Halcyon Lettings ${String(Date.now()).slice(-5)}`);
  const camera = await aCameraPhoto();
  const plan = await aFloorPlan();

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await addHomeThroughUi(page, `${width} Ranelagh Road`);
    const lettingId = homeIdIn(page.url());
    await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
    await page.getByLabel('Choose photos').setInputFiles([
      { name: 'front.jpg', mimeType: 'image/jpeg', buffer: camera },
      { name: 'kitchen.png', mimeType: 'image/png', buffer: aPng([201, 140, 60]) },
      { name: 'plan.png', mimeType: 'image/png', buffer: plan },
      { name: 'living-room.heic', mimeType: 'image/heic', buffer: aHeic },
    ]);
    const photos = page.getByRole('list', { name: 'Photos' });
    await expect(photos.getByRole('img')).toHaveCount(3);

    // M43: the HEIC this browser couldn't open says what to do, on its own tile.
    await expect(photos.getByText('Didn’t upload')).toBeVisible();
    await expect(photos.getByText(/This browser can’t open that iPhone photo/)).toBeVisible();

    // M43: Gaff keeps its own copy, made again: WebP, upright, with no camera or place in it.
    const cover = photos.getByRole('img', { name: 'Photo 1 of 3, the cover' });
    const src = await cover.getAttribute('src');
    expect(src).toMatch(/^\/media\/homes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(480|960)\.webp$/);
    expect(await cover.getAttribute('srcset')).toMatch(/480\.webp 480w/);
    const served = await page.request.get(src!);
    expect(served.headers()['content-type']).toBe('image/webp');
    const body = Buffer.from(await served.body());
    const meta = await sharp(body).metadata();
    expect(meta.height).toBeGreaterThan(meta.width!);
    expect(meta.exif).toBeUndefined();
    expect(body.toString('latin1')).not.toMatch(/Made-up Camera Co|GPS/);

    // M44: the plan is marked from its menu, and goes after the photos, never the cover.
    await page.getByRole('button', { name: 'Photo 3 of 3' }).click();
    await page.getByRole('menuitem', { name: 'Mark as floor plan' }).click();
    await expect(photos.getByRole('img', { name: 'Floor plan 1 of 1' })).toBeVisible();
    await expect(photos.getByRole('listitem').last()).toContainText('Floor plan');
    await expect(photos.getByRole('img', { name: 'Photo 2 of 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave it out' }).click();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `m44-photos-floor-plan-${width}`);

    await goLiveThroughUi(page);

    // M44: the letting's Home view shows the floor plan after the photos.
    await page.goto(`/lettings/${lettingId}?view=home`);
    const shown = page.getByRole('region', { name: 'Photos', exact: true });
    await expect(shown.getByRole('img')).toHaveCount(3);
    await expect(shown.getByRole('img').last()).toHaveAccessibleName('Floor plan');
    await expectAccessible(page);
    await screenshot(page, `m44-home-view-floor-plan-${width}`);

    // M44: on the home's page, the floor plan is the last picture in the gallery.
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const visitor = await context.newPage();
    await visitor.goto(`/homes/${await refOf(lettingId)}`);
    const gallery = visitor.getByRole('region', { name: `Photos of ${width} Ranelagh Road` });
    await expect(
      gallery.getByRole('button', { name: 'Floor plan, 3 of 3, full screen' }),
    ).toBeAttached();
    // M43: the link preview is the JPEG kept for it.
    await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/preview\.jpg$/,
    );
    await gallery.getByRole('button', { name: 'Photo 1 of 3, full screen' }).click();
    const full = visitor.getByRole('dialog', { name: `Photos of ${width} Ranelagh Road` });
    await full.getByRole('button', { name: 'Previous' }).click();
    await expect(full.getByRole('img', { name: 'Floor plan, 3 of 3' })).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, `m44-gallery-floor-plan-${width}`);
    await visitor.keyboard.press('Escape');
    await context.close();
  }
});

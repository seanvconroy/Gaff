import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { aPng } from '../fixtures/photos';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { expectAccessible, expectNoSidewaysScroll, isoDateInDays, screenshot } from './support';

/**
 * BA-5: the search map, on the stand-in (MAP_PROVIDER unset in end-to-end runs): M57, M113,
 * M117, M119, M125, M127, M131, M132, M133, M137. The homes are made-up homes put live straight
 * into the database, in Kenmare, which no other journey uses, each with the point its lister
 * placed (or none). Every journey runs signed out.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const STREET = 'main-street-kenmare-county-kerry';

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

interface Home {
  address: string;
  rent: number;
  point: { lat: number; lng: number } | null;
}

/** Made-up live homes in Kenmare, let by a made-up confirmed agency, on Gaff. */
async function liveHomes(homes: Home[]): Promise<void> {
  const made = await asSystem("select 1 from organisations where name = 'Kenmare Bay Lettings'");
  if (made.length > 0) return;
  const userId = randomUUID();
  const [org] = await asSystem<{ id: string }>(
    `insert into organisations (name, kind, confirmed_at, psra_licence_number, inbound_slug)
     values ('Kenmare Bay Lettings', 'agency', now(), '7770045', $1) returning id`,
    [`kenmare-${userId.slice(0, 8)}`],
  );
  await asSystem('insert into users (id, name, email) values ($1, $2, $3)', [
    userId,
    'Úna Test',
    `una.${userId.slice(0, 8)}@kenmare.test`,
  ]);
  const photo = aPng([36, 99, 168]);
  for (const [i, home] of homes.entries()) {
    const [letting] = await asSystem<{ id: string }>(
      `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
         available_from, property_type, bedrooms, furnished, parking, criteria, stage, status,
         created_by, lead_user_id, live_at, ber_rating, latitude, longitude, point_source,
         point_set_at)
       values ($1, $2, 'Kenmare', 'Kerry', $3, $4, 'apartment', 2, 'furnished', 'street',
         '{"noPets": true}', 'enquiries', 'live', $5, $5, now() - make_interval(hours => $6),
         'C1', $7, $8, $9, $10) returning id`,
      [
        org!.id,
        home.address,
        home.rent * 100,
        isoDateInDays(3),
        userId,
        i + 1,
        home.point?.lat ?? null,
        home.point?.lng ?? null,
        home.point ? 'letter' : null,
        home.point ? new Date() : null,
      ],
    );
    const key = `homes/${org!.id}/${randomUUID()}.png`;
    await asSystem(
      'insert into dev_photo_store (key, content_type, bytes, size) values ($1, $2, $3, $4)',
      [key, 'image/png', photo, photo.length],
    );
    await asSystem(
      `insert into letting_photos (organisation_id, letting_id, position, storage_key,
         content_type, bytes, created_by)
       values ($1, $2, 0, $3, 'image/png', $4, $5)`,
      [org!.id, letting!.id, key, photo.length, userId],
    );
  }
}

test.beforeAll(async () => {
  const henryStreet = { lat: 51.87897, lng: -9.58351 };
  await liveHomes([
    { address: '3 Main Street', rent: 1400, point: { lat: 51.87975, lng: -9.5827 } },
    { address: '8 Henry Street', rent: 1650, point: henryStreet },
    // Two homes at one point: they share a pin (M117).
    { address: 'Apartment 2, 8 Henry Street', rent: 1700, point: henryStreet },
    // In Kenmare by its address, but its pin is about 3.6 km out (M113 measures the pin).
    { address: '1 Sneem Road', rent: 1500, point: { lat: 51.91, lng: -9.6 } },
    // No pin placed: in the list, never on the map (M125).
    { address: '12 Shelbourne Street', rent: 1550, point: null },
  ]);
});

const map = (page: Page) => page.getByRole('group', { name: 'Map of the homes in this search' });
const pin = (page: Page, name: RegExp) => map(page).getByRole('button', { name });
const fits = (page: Page) =>
  page.getByRole('list', { name: /fits? what you asked$|^Homes on Gaff now$/ });

/** M117: a cluster zooms in when chosen, until the pin asked for is on its own. */
async function zoomInTo(page: Page, name: RegExp): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    if (await pin(page, name).isVisible()) return;
    const cluster = map(page).getByRole('button', { name: /homes here: zoom in$/ }).first();
    if (await cluster.isVisible()) await cluster.click();
    else await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(150);
  }
  await expect(pin(page, name)).toBeVisible();
}

async function mapCounts(): Promise<Record<string, number>> {
  const rows = await asSystem<{ event: string; kind: string; count: number }>(
    'select event, kind, count from map_daily_counts',
  );
  return Object.fromEntries(rows.map((r) => [`${r.event}:${r.kind}`, r.count]));
}

/** Drags the stand-in map by its middle, as a renter's finger or mouse would. */
async function dragMap(page: Page, by: { x: number; y: number }): Promise<void> {
  const box = (await map(page).boundingBox())!;
  // A spot on the map with no pin under it: the top left quarter.
  const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.75 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + by.x / 2, start.y + by.y / 2, { steps: 4 });
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
  await page.mouse.up();
}

test('M57, M117, M125, M127: beside the list at 1280px, a pin and its card light each other, a pin opens its card, and "Search this area" searches the homes in view', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: desktop, locale: 'en-IE' });
  const page = await context.newPage();
  const before = await mapCounts();
  await page.goto('/?where=kenmare');
  await expect(fits(page).getByRole('listitem')).toHaveCount(5);
  // The map is beside the list, and loads once the page has settled (M119, M131).
  await expect(map(page)).toBeVisible();
  await expect(page.getByText('Test map: not Google Maps')).toBeVisible();
  const listBox = (await fits(page).boundingBox())!;
  const mapBox = (await map(page).boundingBox())!;
  expect(mapBox.x).toBeGreaterThan(listBox.x + listBox.width - 1);
  // M125: four have a pin; the fifth is in the list alone.
  await expect(page.getByRole('status').filter({ hasText: 'homes on the map' })).toHaveText(
    '4 of 5 homes on the map. The others are in the list.',
  );
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeHidden();

  // M127: resizing the window isn't the renter's move: nothing offers to search the area.
  await page.setViewportSize({ width: 1180, height: 860 });
  await page.waitForTimeout(400);
  await expect(page.getByRole('button', { name: 'Search this area' })).toHaveCount(0);
  await page.setViewportSize(desktop);

  // M117: at first the homes cluster; choosing the cluster zooms in. The two homes at one
  // point share a pin, which lists them.
  await expect(map(page).getByRole('button', { name: /homes here: zoom in$/ })).toBeVisible();
  await zoomInTo(page, /^2 homes here, from €1,650 a month/);
  await zoomInTo(page, /^€1,400 a month/);
  const shared = pin(page, /^2 homes here, from €1,650 a month/);
  await expect(shared).toBeVisible();
  // Pointing at a card lights its pin.
  const mainStreet = pin(page, /^€1,400 a month/);
  await fits(page).getByRole('link', { name: '€1,400 a month' }).hover();
  await expect(mainStreet).toHaveAttribute('data-on', 'true');
  await expectAccessible(page);
  await screenshot(page, 'ba5-search-map-1280');

  await mainStreet.click();
  const card = page.getByRole('article', { name: 'Chosen home: €1,400 a month' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('2-bed apartment · Kenmare, Co. Kerry');
  await expectAccessible(page);
  await screenshot(page, 'ba5-search-map-card-1280');
  await card.getByRole('button', { name: 'Close' }).click();
  await shared.click();
  const list = page.getByRole('article', { name: '2 homes here' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await list.getByRole('button', { name: 'Close' }).click();

  // M57: the renter moves the map; "Search this area" searches what's in view.
  await dragMap(page, { x: -120, y: 0 });
  const searchArea = page.getByRole('button', { name: 'Search this area' });
  await expect(searchArea).toBeVisible();
  await searchArea.click();
  await page.waitForURL(/[?&]area=/);
  await expect(page.getByRole('list', { name: 'What Gaff understood' })).toContainText(
    'Area on the map',
  );
  // Only homes with a pin can be in a map area.
  await expect(fits(page).getByRole('link', { name: '€1,550 a month' })).toHaveCount(0);
  await expect(fits(page).getByRole('link', { name: '€1,400 a month' })).toBeVisible();
  // The map stays where the renter put it: the button doesn't come back by itself.
  await expect(page.getByRole('button', { name: 'Search this area' })).toHaveCount(0);

  // M133: counted by fixed codes, with nothing about the search.
  await expect
    .poll(async () => {
      const after = await mapCounts();
      return [
        (after['opened:larger'] ?? 0) > (before['opened:larger'] ?? 0),
        (after['shown:larger'] ?? 0) > (before['shown:larger'] ?? 0),
        (after['pin_opened:'] ?? 0) > (before['pin_opened:'] ?? 0),
        (after['group_opened:'] ?? 0) > (before['group_opened:'] ?? 0),
        (after['area_searched:'] ?? 0) > (before['area_searched:'] ?? 0),
      ];
    })
    .toEqual([true, true, true, true, true]);
  await context.close();
});

test('M57, M119: below 900px the list comes first, complete, and "Map" swaps it for the map', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: phone, locale: 'en-IE' });
  const page = await context.newPage();
  await page.goto('/?where=kenmare');
  await expect(fits(page).getByRole('listitem')).toHaveCount(5);
  // Nothing of the map loads until it's asked for.
  await expect(map(page)).toHaveCount(0);
  await expect(page.getByText('Test map: not Google Maps')).toHaveCount(0);
  const show = page.getByRole('button', { name: 'Map', exact: true });
  await expect(show).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);
  await screenshot(page, 'ba5-search-list-390');

  await show.click();
  await expect(map(page)).toBeVisible();
  await expect(fits(page)).toBeHidden();
  await zoomInTo(page, /^2 homes here, from €1,650 a month/);
  await pin(page, /^2 homes here, from €1,650 a month/).click();
  await expect(page.getByRole('article', { name: '2 homes here' })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);
  await screenshot(page, 'ba5-search-map-390');

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(fits(page)).toBeVisible();
  await context.close();
});

test('M113, M137: near a street, the homes whose pin is within the distance, which the renter changes with "Within"', async ({
  browser,
}) => {
  for (const viewport of [phone, desktop]) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await page.goto(`/?where=${STREET}`);
    const found = fits(page);
    // Within 3 km of Main Street (outside a city): the three pinned homes nearby, not the one
    // 3.6 km out, nor the one without a pin (its address names another street).
    await expect(found.getByRole('listitem')).toHaveCount(3);
    await expect(found.getByRole('link', { name: '€1,500 a month' })).toHaveCount(0);
    await expect(found.getByRole('link', { name: '€1,550 a month' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    const within = sheet.getByRole('group', { name: 'Within' });
    await expect(within.getByRole('radio', { name: 'Within 3 km' })).toBeChecked();
    await expectAccessible(page);
    await screenshot(page, `ba5-within-${viewport.width}`);
    await within.getByRole('radio', { name: 'Within 5 km' }).check();
    await sheet.getByRole('button', { name: 'Show homes' }).click();
    await page.waitForURL(/km=5/);
    await expect(fits(page).getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('list', { name: 'What Gaff understood' })).toContainText(
      'Within 5 km',
    );
    if (viewport === desktop) {
      // The street is drawn on the map, with its credit (M137).
      await expect(map(page)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Places © OpenStreetMap' })).toBeVisible();
    }
    await context.close();
  }
});

test('M132: no map for robots: the list alone', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: desktop,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  });
  const page = await context.newPage();
  await page.goto('/?where=kenmare');
  await expect(fits(page).getByRole('listitem')).toHaveCount(5);
  await expect(map(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveCount(0);
  await context.close();
});

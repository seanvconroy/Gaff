import { devices, expect, test, type Page } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  getChecked,
  goLiveThroughUi,
  screenshot,
  signUpLandlord,
} from './support';

const FLAT_1 = '2 bed apartment in Dalkey, Co. Dublin';
const SHARED_PIN = '2 homes here, from €1,850 a month';
const DESCRIPTION =
  'A two-bedroom apartment a short walk from Dalkey village and the DART, with gas central heating, a balcony and a fitted kitchen.';

/** Two flats in one building: their pins start, and stay, on the same point. */
async function listTwoFlats(page: Page) {
  await signUpLandlord(page);
  await getChecked(page);
  for (const flat of ['Flat 1', 'Flat 2']) {
    await createLettingThroughUi(page, `${flat}, 5 Coliemore Road`, '', 'Dalkey, Co. Dublin');
    await goLiveThroughUi(page);
    await completeListing(page, `${DESCRIPTION} This is ${flat.toLowerCase()} of two.`);
    await page.getByLabel(/I own this home or I’m authorised to let it/).check();
    await page.getByRole('button', { name: 'Publish this listing' }).click();
    await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();
  }
}

test('M117, M127, M128: on a computer, homes at one point share a pin, a filter leaves the map alone, and an area is drawn by tapping its corners', async ({
  page,
}) => {
  test.slow();
  await listTwoFlats(page);

  await page.goto('/to-rent/dublin/dalkey');
  await expect(page.getByRole('heading', { level: 1, name: '2 homes in Dalkey' })).toBeVisible();
  const map = page.getByRole('complementary', { name: 'Map' });

  // M117: one pin for the two homes, which lists them both.
  const shared = map.getByRole('button', { name: SHARED_PIN });
  await expect(shared).toBeVisible();
  await expect(shared).toHaveText('2 homes');
  await shared.click();
  const list = map.getByRole('article', { name: '2 homes here' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await expect(list.getByRole('link').first()).toContainText('€1,850 a month');
  await expect(shared).toHaveAttribute('aria-pressed', 'true');
  await expectAccessible(page);
  await screenshot(page, 'm57-map-shared-pin');
  await list.getByRole('button', { name: 'Close' }).click();

  // M117: the keyboard lights up a home's pin from its card, as the mouse does.
  await page.getByRole('article', { name: FLAT_1 }).first().getByRole('link').first().focus();
  await expect(shared).toHaveAttribute('data-on', 'true');

  // M127: a filter changes the homes, never the view: the pin stays exactly where it was.
  const before = (await shared.boundingBox())!;
  await page.getByRole('button', { name: 'Beds', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Bedrooms and bathrooms' })
    .getByRole('group', { name: 'Bedrooms' })
    .getByRole('radio', { name: '2+' })
    .check();
  await expect(page).toHaveURL(/\/to-rent\/dublin\/dalkey\?beds=2$/);
  await page.keyboard.press('Escape');
  await expect(shared).toBeVisible();
  const after = (await shared.boundingBox())!;
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(2);

  // M127: a window being resized is never the renter moving the map: no map-area search.
  await page.setViewportSize({ width: 1300, height: 760 });
  await expect(shared).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/to-rent\/dublin\/dalkey\?beds=2$/);
  await page.setViewportSize({ width: 1280, height: 720 });

  // M128: an area drawn without dragging: tap its corners, then Done.
  await map.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(map.getByText(/or tap its corners and choose Done/)).toBeVisible();
  const canvas = map.getByRole('group', { name: 'Map of the homes in this search' });
  const box = (await canvas.boundingBox())!;
  const pin = (await shared.boundingBox())!;
  const centre = { x: pin.x + pin.width / 2 - box.x, y: pin.y + pin.height / 2 - box.y };
  const corners = [
    { x: centre.x - 90, y: centre.y - 90 },
    { x: centre.x + 90, y: centre.y - 90 },
    { x: centre.x + 90, y: centre.y + 90 },
    { x: centre.x - 90, y: centre.y + 90 },
  ];
  await canvas.click({ position: corners[0]!, force: true });
  await expect(map.getByText('1 corner so far. Tap the next corner.')).toBeVisible();
  await expect(map.getByRole('button', { name: 'Done' })).toBeDisabled();
  await canvas.click({ position: corners[1]!, force: true });
  await canvas.click({ position: corners[2]!, force: true });
  await canvas.click({ position: { x: centre.x, y: centre.y + 140 }, force: true });
  await expect(
    map.getByText('4 corners so far. Tap the next corner, or choose Done.'),
  ).toBeVisible();
  // Undo takes the last corner back.
  await map.getByRole('button', { name: 'Undo' }).click();
  await expect(
    map.getByText('3 corners so far. Tap the next corner, or choose Done.'),
  ).toBeVisible();
  await canvas.click({ position: corners[3]!, force: true });
  await expectAccessible(page);
  await screenshot(page, 'm57-map-drawing');
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/[?&]shape=/);
  await expect(
    page.getByRole('heading', { level: 1, name: '2 homes in the area you drew' }),
  ).toBeVisible();
  await expect(map.getByRole('button', { name: 'Remove shape' })).toBeVisible();
  await map.getByRole('button', { name: 'Remove shape' }).click();
  await expect(page).toHaveURL(/\/to-rent\/dublin\/dalkey\?beds=2$/);

  // M57: dragging the map searches the area in view, and says so.
  const from = { x: box.x + 60, y: box.y + box.height - 80 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 4 });
  await page.mouse.up();
  await expect(page).toHaveURL(/[?&]bbox=/);
  await expect(
    page.getByRole('heading', { level: 1, name: /^2 homes in this map area$/ }),
  ).toBeVisible();
  // M127: the map stays where the renter left it: the pin hasn't jumped back.
  const moved = (await shared.boundingBox())!;
  expect(Math.round(moved.x - before.x)).toBeGreaterThan(20);
  await expectNoSidewaysScroll(page);
});

test('M117, M119: on a phone, the map loads when it’s opened, and a shared pin marks both cards', async ({
  browser,
}) => {
  // The two flats listed in the journey above.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  const counted: string[] = [];
  renter.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v' && url.searchParams.has('m')) {
      counted.push(`${url.searchParams.get('m')}:${url.searchParams.get('k') ?? ''}`);
    }
  });
  await renter.goto('/to-rent/dublin/dalkey');
  await expect(renter.getByRole('heading', { level: 1, name: '2 homes in Dalkey' })).toBeVisible();
  // M119: in the list, the map hasn't loaded or been counted.
  await renter.waitForTimeout(1000);
  expect(counted).toEqual([]);
  await expect(renter.locator('[data-stage]')).toHaveAttribute('data-stage', 'waiting');

  await renter.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(renter.locator('[data-stage]')).toHaveAttribute('data-stage', 'ready');
  // M133: counted by fixed codes: opened and shown, on a phone.
  await expect.poll(() => counted).toEqual(['opened:phone', 'shown:phone']);
  const shared = renter.getByRole('button', { name: SHARED_PIN });
  await shared.tap();
  const row = renter.getByRole('list', { name: 'Homes on the map' });
  await expect(row.getByRole('listitem')).toHaveCount(2);
  await expect(row.locator('[data-same-point]')).toHaveCount(2);
  await expect(row.locator('[aria-current="true"]')).toHaveCount(1);
  await expect.poll(() => counted).toContain('group_opened:');
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm57-map-phone');
  await phone.close();
});

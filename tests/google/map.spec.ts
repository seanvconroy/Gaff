import { expect, test, type Page } from '@playwright/test';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  getChecked,
  goLiveThroughUi,
  screenshot,
  signUpLandlord,
} from '../e2e/support';
import {
  COUNTY,
  NEEDS_KEY,
  RANELAGH_PIN,
  SEARCH,
  expectAttributionClear,
  expectMapReady,
  expectOnlyTheOriginSent,
  expectPolicyHolds,
  hasKey,
  mapStage,
  phone,
  pinsInMap,
  watch,
} from './support';

/**
 * M136: Google's real map, with the test run's own key, in a production build. It draws after
 * the page, shows Gaff's pins by name, stays where the renter leaves it, keeps the content
 * security policy, leaves Google's logo and terms uncovered, and tells Google nothing of what
 * was searched. Screenshots go to screenshots/google for a person to look over: they aren't
 * compared, because Google's map changes.
 */

test.skip(!hasKey, NEEDS_KEY);

const CLUSTER = /^\d+ homes here: zoom in$/;

/** The map has stopped moving and the page has caught up with it. */
async function settled(page: Page): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await pinsInMap(page)) + page.url();
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [700], timeout: 15_000 },
    )
    .toBe(true);
}

test('M136, M117, M127, M128: on a computer, the real map draws after the page, shows its pins, and stays where the renter leaves it', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await page.goto(COUNTY);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('4 homes');
  await expectMapReady(page);
  await expect.poll(() => seen.counted).toEqual(['opened:larger', 'shown:larger']);
  const map = page.getByRole('complementary', { name: 'Map' });

  // M131: the map waits for the page: nothing was asked of another site before the page loaded.
  const order = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    const elsewhere = performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).hostname !== location.hostname)
      .map((entry) => entry.startTime);
    return { loaded: navigation!.loadEventStart, first: Math.min(...elsewhere) };
  });
  expect(order.first).toBeGreaterThanOrEqual(order.loaded);

  // M117: homes close together share a ring with their number. It's a button: it zooms in,
  // and the renter's own move searches the area in view.
  const cluster = map.getByRole('button', { name: CLUSTER }).first();
  await expect(cluster).toBeVisible();
  await screenshot(page, 'google/map-county');
  const ranelagh = map.getByRole('button', { name: RANELAGH_PIN });
  for (let i = 0; i < 4 && !(await ranelagh.isVisible()); i++) {
    await map.getByRole('button', { name: CLUSTER }).first().click();
    await settled(page);
  }
  await expect(ranelagh).toBeVisible();
  await expect(page).toHaveURL(/[?&]bbox=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in this map area');
  expect(seen.counted).toContain('area_searched:');

  // M127: the map stays where the renter left it once the search has caught up.
  const left = (await pinsInMap(page))[RANELAGH_PIN]!;
  await page.waitForTimeout(2000);
  const stayed = (await pinsInMap(page))[RANELAGH_PIN]!;
  expect(Math.abs(stayed.x - left.x) + Math.abs(stayed.y - left.y)).toBeLessThan(2);

  // M117: a pin is a button with the home's rent and name. It opens the home's card.
  await ranelagh.click();
  const card = map.getByRole('article', {
    name: 'Chosen home: 2 bed apartment in Ranelagh, Dublin 6',
  });
  await expect(card.getByRole('link')).toBeVisible();
  expect(seen.counted).toContain('pin_opened:');
  // Google's logo and terms are never covered: not by the card, and not by the map's buttons.
  await expectAttributionClear(page, mapStage(page));
  await screenshot(page, 'google/map-card');
  await card.getByRole('button', { name: 'Close' }).click();
  await expectAttributionClear(page, mapStage(page));

  // M117: the keyboard reaches a pin, lights it up, and opens its card with Enter.
  await ranelagh.focus();
  await expect(ranelagh.locator('[data-on]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Close' }).click();

  // M127: a filter changes the homes, never the view.
  const before = (await pinsInMap(page))[RANELAGH_PIN]!;
  await page.getByRole('button', { name: 'Beds', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Bedrooms and bathrooms' })
    .getByRole('group', { name: 'Bedrooms' })
    .getByRole('radio', { name: '2+' })
    .check();
  await expect(page).toHaveURL(/[?&]beds=2/);
  await page.keyboard.press('Escape');
  await settled(page);
  const after = (await pinsInMap(page))[RANELAGH_PIN]!;
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(2);

  // M127: a window being resized is never the renter moving the map.
  const address = page.url();
  await page.setViewportSize({ width: 1180, height: 700 });
  await page.waitForTimeout(1500);
  expect(page.url()).toBe(address);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1500);
  expect(page.url()).toBe(address);

  // M57, M127: dragging the map searches the area in view, and the map doesn't jump back.
  const box = (await mapStage(page).boundingBox())!;
  const from = { x: box.x + 90, y: box.y + box.height - 120 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y - 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.url()).not.toBe(address);
  await settled(page);
  const dragged = (await pinsInMap(page))[RANELAGH_PIN]!;
  expect(dragged.x - after.x).toBeGreaterThan(40);
  await page.waitForTimeout(2000);
  const kept = (await pinsInMap(page))[RANELAGH_PIN]!;
  expect(Math.abs(kept.x - dragged.x) + Math.abs(kept.y - dragged.y)).toBeLessThan(2);

  // M128: the map moves without dragging: Google's camera control has zoom and pan buttons.
  await map.getByRole('button', { name: 'Map camera controls' }).click();
  await expect(map.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await page.keyboard.press('Escape');

  // M128: an area drawn without dragging: tap its corners, then Done.
  await map.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(map.getByText(/or tap its corners and choose Done/)).toBeVisible();
  const around = (await mapStage(page).boundingBox())!;
  const centre = { x: around.x + around.width / 2, y: around.y + around.height / 2 };
  for (const [dx, dy] of [
    [-120, -80],
    [120, -80],
    [120, 120],
    [-120, 120],
  ] as const) {
    await page.mouse.click(centre.x + dx, centre.y + dy);
  }
  await expect(
    map.getByText('4 corners so far. Tap the next corner, or choose Done.'),
  ).toBeVisible();
  await screenshot(page, 'google/map-drawing');
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/[?&]shape=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in the area you drew');
  expect(seen.counted).toContain('shape_drawn:');
  await map.getByRole('button', { name: 'Remove shape' }).click();
  await expect(page).not.toHaveURL(/[?&]shape=/);

  // M119, M136: Google was told the site's origin, and nothing of what was searched; the
  // content security policy held; nothing broke on the page.
  expectOnlyTheOriginSent(seen, ['to-rent', '/dublin', 'bbox=', 'beds=', 'shape=']);
  expectPolicyHolds(seen);
  expect(seen.errors).toEqual([]);
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual([]);
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await screenshot(page, 'google/map-computer');
});

test.describe('on a phone', () => {
  test.use(phone);

  test('M136, M117, M119: the real map loads when the renter opens it, and its pins mark their cards', async ({
    page,
  }) => {
    const seen = watch(page);
    await page.goto(SEARCH);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('3 homes');
    await page.waitForTimeout(1500);
    // M119: in the list, nothing has been asked of another site.
    expect(seen.elsewhere).toEqual([]);

    await page.getByRole('link', { name: 'Map', exact: true }).click();
    await expectMapReady(page);
    await expect.poll(() => seen.counted).toEqual(['opened:phone', 'shown:phone']);

    // Zoomed out, the homes may share a ring: a tap on it zooms in until the pin stands alone.
    const ranelagh = page.getByRole('button', { name: RANELAGH_PIN });
    for (let i = 0; i < 4 && !(await ranelagh.isVisible()); i++) {
      await page.getByRole('button', { name: CLUSTER }).first().tap();
      await settled(page);
    }
    await ranelagh.tap();
    const row = page.getByRole('list', { name: 'Homes on the map' });
    await expect(row.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(row.locator('[aria-current="true"]')).toContainText('Ranelagh');
    expect(seen.counted).toContain('pin_opened:');

    // The cards along the bottom and the List button leave Google's logo and terms in sight.
    await expectAttributionClear(page, mapStage(page));
    expectOnlyTheOriginSent(seen, ['to-rent', 'rathmines', 'km=3']);
    expectPolicyHolds(seen);
    expect(seen.errors).toEqual([]);
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, 'google/map-phone');
  });
});

test('M136, M38: a letter places the home’s pin on the real map: a tap, the buttons, the arrow keys and a drag', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '40 Highfield Road', '', 'Rathgar, Dublin 6');
  await goLiveThroughUi(page);
  // Nothing in the workspace asks another site for anything, until the page with the map.
  expect(seen.elsewhere).toEqual([]);
  await page.getByRole('link', { name: 'Listing', exact: true }).click();

  const where = page.getByRole('region', { name: 'Where it is' });
  const pin = where.getByRole('button', { name: 'The home’s pin' });
  await expect(pin).toBeVisible({ timeout: 30_000 });
  await expect(where.getByText('The pin is on Highfield Road, in Rathgar.')).toBeVisible();
  const canvas = where.getByRole('group', { name: 'Map for placing the home’s pin' });
  await canvas.scrollIntoViewIfNeeded();
  /** Where the pin's tip is, inside the picker's map. */
  const tip = async () => {
    const [marker, around] = [(await pin.boundingBox())!, (await canvas.boundingBox())!];
    return { x: marker.x + marker.width / 2 - around.x, y: marker.y + marker.height - around.y };
  };

  // A tap on the map puts the pin there.
  await canvas.click({ position: { x: 200, y: 250 } });
  await expect(where.getByText('The pin has moved. Save the location to keep it.')).toBeVisible();
  await expect.poll(async () => Math.abs((await tip()).x - 200)).toBeLessThan(6);
  expect(Math.abs((await tip()).y - 250)).toBeLessThan(6);

  // The buttons and the arrow keys move it a step at a time, without dragging.
  await where.getByRole('button', { name: 'Move the pin up' }).click();
  await expect.poll(async () => (await tip()).y).toBeLessThan(246);
  const beforeKey = await tip();
  await pin.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await tip()).x).toBeGreaterThan(beforeKey.x + 20);

  // Dragging the pin moves it, and the words for where it is follow.
  const marker = (await pin.boundingBox())!;
  const hold = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
  const beforeDrag = await tip();
  await page.mouse.move(hold.x, hold.y);
  await page.mouse.down();
  await page.mouse.move(hold.x + 90, hold.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await tip()).x - beforeDrag.x).toBeGreaterThan(70);
  await expect(where.getByText(/^The pin is (on|in) /)).toBeVisible();

  await expectAttributionClear(page, canvas);
  await screenshot(page, 'google/pin');
  await where.getByRole('button', { name: 'Save the location' }).click();
  await expect(where.getByText('Saved. Renters see the home here on the map.')).toBeVisible();

  // M38: no address service is asked where the home is: the Maps JavaScript API alone.
  const hosts = [...new Set(seen.elsewhere.map((request) => new URL(request.url).hostname))];
  expect(hosts.filter((host) => !/(^|\.)(googleapis|gstatic|google)\.com$/.test(host))).toEqual([]);
  expect(
    seen.elsewhere.filter((request) => /geocod|place|findplace|autocomplete/i.test(request.url)),
  ).toEqual([]);
  expectOnlyTheOriginSent(seen, ['lettings', 'listing', 'Highfield']);
  expectPolicyHolds(seen);
  expect(seen.errors).toEqual([]);
  await expectAccessible(page);
});

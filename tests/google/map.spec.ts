import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, screenshot, signUpOperator } from '../e2e/support';
import {
  COUNTY,
  NEEDS_KEY,
  RANELAGH_PIN,
  SEARCH,
  SEARCHED,
  expectAttributionClear,
  expectMapReady,
  expectOnlyTheOriginSent,
  expectPolicyHolds,
  fits,
  hasKey,
  mapStage,
  phone,
  pinsInMap,
  watch,
} from './support';

/**
 * BA-5 (the live line's M136): Google's real map, with the test run's own key, in a production
 * build. It draws after the page, shows Gaff's pins by name, stays where the renter leaves it,
 * keeps the content security policy, leaves Google's logo and terms uncovered, and tells Google
 * nothing of what was searched. Screenshots go to screenshots/google for a person to look over:
 * they aren't compared, because Google's map changes.
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

test('M136, M117, M127: on a computer, the real map draws after the page, shows its pins, and opens a pin’s card', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await page.goto(COUNTY);
  await expect(fits(page).getByRole('listitem')).toHaveCount(4);
  await expectMapReady(page);
  await expect.poll(() => seen.counted).toEqual(['opened:larger', 'shown:larger']);

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
  await screenshot(page, 'google/map-county');

  // M117: clusters zoom in when chosen, until the Ranelagh pin is on its own.
  const ranelagh = mapStage(page).getByRole('button', { name: RANELAGH_PIN });
  for (let i = 0; i < 5 && !(await ranelagh.isVisible()); i++) {
    await mapStage(page).getByRole('button', { name: CLUSTER }).first().click();
    await settled(page);
  }
  await expect(ranelagh).toBeVisible();
  // M57, Q60: the renter's own move is the search: the list follows to the homes in view.
  await page.waitForURL(/[?&]area=/);
  await expect(page.getByRole('button', { name: 'Search this area' })).toHaveCount(0);

  // M127: the map stays where the renter left it.
  const left = (await pinsInMap(page))[RANELAGH_PIN]!;
  await page.waitForTimeout(2000);
  const stayed = (await pinsInMap(page))[RANELAGH_PIN]!;
  expect(Math.abs(stayed.x - left.x) + Math.abs(stayed.y - left.y)).toBeLessThan(2);

  await ranelagh.click();
  const card = page.getByRole('article', { name: 'Chosen home: €2,250 a month' });
  await expect(card.getByRole('link')).toBeVisible();
  // Google's logo and terms are never covered: not by the card, and not by Gaff's controls.
  await expectAttributionClear(page, mapStage(page));
  await screenshot(page, 'google/map-card');
  await card.getByRole('button', { name: 'Close' }).click();

  // M127: resizing the window isn't the renter's move: the map stays, and so does the search.
  await settled(page);
  const before = (await pinsInMap(page))[RANELAGH_PIN]!;
  const searched = page.url();
  await page.setViewportSize({ width: 1200, height: 860 });
  await settled(page);
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(searched);
  expect((await pinsInMap(page))[RANELAGH_PIN]).toBeDefined();
  expect(before).toBeDefined();

  // UX-SR-13: an area is drawn over Google's map, by tapping its corners, and is the search.
  // What is drawn is Gaff's own layer: nothing of it is sent to Google.
  const at = (await pinsInMap(page))[RANELAGH_PIN]!;
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  for (const [dx, dy] of [
    [-90, -70],
    [90, -70],
    [90, 70],
    [-90, 70],
  ] as const) {
    await page.mouse.click(at.x + dx, at.y + dy);
  }
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.waitForURL(/[?&]draw=/);
  await expect(page.getByRole('button', { name: /^Corner \d+ of 4/ })).toHaveCount(4);
  // The corners sit where they were tapped: the layer and Google's map agree on where things are.
  const corner = (await page.getByRole('button', { name: /^Corner 1 of 4/ }).boundingBox())!;
  expect(Math.abs(corner.x + corner.width / 2 - (at.x - 90))).toBeLessThan(3);
  expect(Math.abs(corner.y + corner.height / 2 - (at.y - 70))).toBeLessThan(3);
  await expectAttributionClear(page, mapStage(page));
  await screenshot(page, 'google/map-drawn');

  expectPolicyHolds(seen);
  expectOnlyTheOriginSent(seen, SEARCHED);
  await expectAccessible(page);
});

test.describe('on a phone', () => {
  test.use(phone);

  test('M136, M57: the map opens from "Map", draws, and keeps Google’s credits clear', async ({
    page,
  }) => {
    const seen = watch(page);
    await page.goto(SEARCH);
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expectMapReady(page);
    await expect.poll(() => seen.counted).toEqual(['opened:phone', 'shown:phone']);
    await expectAttributionClear(page, mapStage(page));
    await screenshot(page, 'google/map-phone');
    expectPolicyHolds(seen);
    expectOnlyTheOriginSent(seen, SEARCHED);
    await expectAccessible(page);
  });
});

test('M38, M136: the lister places the pin on Google’s map with the buttons and the keys', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await signUpOperator(page);
  await page.goto('/lettings/new');
  await page.getByRole('link', { name: 'Fill it in myself' }).click();
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill('40 Highfield Road');
  await page.getByLabel('Town or area').fill('Rathgar, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const pin = page.getByRole('button', { name: 'The home’s pin' });
  await expect(pin).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Move the pin up' }).click();
  await pin.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status').filter({ hasText: /^The pin is/ })).toBeVisible();
  await expectAttributionClear(page, page.locator('[data-provider="google"]'));
  await screenshot(page, 'google/pin');
  expectPolicyHolds(seen);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rent and date' })).toBeVisible();
});

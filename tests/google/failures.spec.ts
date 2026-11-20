import { expect, test, type Page } from '@playwright/test';
import { mapEnv } from '../../playwright.google.config';
import { isMapPage } from '../../src/lib/map-pages';
import { expectAccessible, screenshot, signUpOperator } from '../e2e/support';
import {
  COUNTY,
  SEARCH,
  SEARCHED,
  blockOtherSites,
  fits,
  GOOGLE_MAP_CONFIG,
  GOOGLE_VIEWPORT,
  expectOnlyTheOriginSent,
  holdBack,
  mapStage,
  phone,
  sendAKeyGoogleRefuses,
  sendNoKey,
  stallGoogleScript,
  watch,
} from './support';

/**
 * BA-5 (the live line's M136, M119, M120): Google's map in a production build, with no key of
 * our own. Nothing leaves for another site until the map is wanted, Google is told only what it
 * needs, and every way the map can fail ends in Gaff's sentence, never Google's error box. The
 * list carries on throughout.
 */

const UNAVAILABLE = 'The map isn’t available right now. Every home is still in the list.';

test('M136: this is the map’s build: only the map’s pages let Google in, and no page sends its address on', async ({
  request,
}) => {
  const headersOf = async (path: string) => {
    const response = await request.get(path, { maxRedirects: 0 });
    return {
      policy: response.headers()['content-security-policy'] ?? '',
      referrer: response.headers()['referrer-policy'],
    };
  };
  const search = await headersOf('/');
  expect(search.policy, 'Run `pnpm build:map` before `pnpm test:map`').toContain(
    'https://*.googleapis.com',
  );
  // "Where is it on the map?", where a lister places a home's pin (M38), has the same policy.
  const pin = await headersOf('/lettings/00000000-0000-4000-8000-000000000000/setup/pin');
  expect(pin.policy).toBe(search.policy);
  // The pages the header rules name are the pages the scripts treat as the map's (M119).
  for (const path of [
    '/',
    '/lettings/00000000-0000-4000-8000-000000000000/setup/pin',
    '/sign-in',
    '/lettings',
    '/lettings/00000000-0000-4000-8000-000000000000/setup/address',
    '/homes/000000000000',
    '/map-and-place-data',
  ]) {
    const page = await headersOf(path);
    expect(page.policy, path).toContain("default-src 'self'");
    expect(/google|gstatic/.test(page.policy), path).toBe(isMapPage(path));
    expect(page.referrer, path).toBe('no-referrer');
  }
});

test.describe('on a phone', () => {
  test.use(phone);

  test('M119, M120: nothing leaves for another site until the renter opens the map; when Google is out of reach, the list carries on', async ({
    page,
  }) => {
    const seen = watch(page);
    await blockOtherSites(page);
    await page.goto(SEARCH);
    await expect(fits(page).getByRole('listitem')).toHaveCount(3);
    await page.waitForTimeout(1500);
    // In the list, the map hasn't loaded, been counted, or asked anyone for anything.
    expect(seen.elsewhere).toEqual([]);
    expect(seen.counted).toEqual([]);
    await expect(mapStage(page)).toHaveAttribute('data-stage', 'waiting');

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expect.poll(() => seen.counted).toEqual(['opened:phone', 'failed:script']);

    // The first thing asked of another site is Google's script, told only what draws a map:
    // the key, the release channel, the language and region, and to check the key against the
    // site's origin alone. No extra libraries, and none of the map library's usage tags.
    const script = new URL(seen.elsewhere[0]!.url);
    expect(script.origin + script.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect([...script.searchParams.keys()].sort()).toEqual([
      'auth_referrer_policy',
      'callback',
      'key',
      'language',
      'libraries',
      'region',
      'v',
    ]);
    expect(script.searchParams.get('libraries')).toBe('');
    expect(script.searchParams.get('auth_referrer_policy')).toBe('origin');
    expect(script.searchParams.get('v')).toBe(mapEnv.GOOGLE_MAPS_VERSION);
    expect(script.searchParams.get('language')).toBe('en');
    expect(script.searchParams.get('region')).toBe('IE');
    expectOnlyTheOriginSent(seen, SEARCHED);

    await expectAccessible(page);
    await screenshot(page, 'google/failed-phone');
    // The list is a tap away, with every home in it.
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(fits(page).getByRole('listitem')).toHaveCount(3);
  });
});

test('M120: when Google’s script never answers, Gaff says so and the list carries on', async ({
  page,
}) => {
  const seen = watch(page);
  const release = await stallGoogleScript(page);
  await page.goto(SEARCH);
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'loading');
  // The list is whole while the map waits.
  await expect(fits(page).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => seen.counted).toEqual(['opened:larger', 'failed:timeout']);
  await expectAccessible(page);
  release();
});

test('M120: a key Google refuses ends in Gaff’s sentence, not Google’s error box', async ({
  page,
}) => {
  const seen = watch(page);
  await sendAKeyGoogleRefuses(page);
  await page.goto(SEARCH);
  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => seen.counted).toEqual(['opened:larger', 'failed:auth']);
  // Google's own error box went with the map.
  await expect(page.locator('.gm-err-container')).toHaveCount(0);
  await expect(fits(page).getByRole('listitem')).toHaveCount(3);
  expectOnlyTheOriginSent(seen, SEARCHED);
  await expectAccessible(page);
  await screenshot(page, 'google/failed-key');

  // The next search, in the same document: Google's script won't say it again, so Gaff does,
  // at once, and doesn't wait 10 seconds for a map that can't draw.
  await page
    .getByRole('list', { name: 'What Gaff understood' })
    .getByRole('button', { name: 'Ranelagh, Dublin 6' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole('heading', { name: 'Homes on Gaff now' })).toBeVisible();
  expect(seen.errors).toEqual([]);
});

/** The page is whole: every home in the list, and nothing thrown. */
async function expectPageWhole(page: Page, errors: string[]): Promise<void> {
  await expect(fits(page).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  expect(errors).toEqual([]);
}

test('M120: a key refused while the pins wait to go on the map takes the map away, never the page', async ({
  page,
}) => {
  // Markers handed to a map that's still starting wait for its configuration. When Google then
  // refuses the key it takes its map apart, and the waiting markers throw as Gaff removes them.
  const seen = watch(page);
  await sendAKeyGoogleRefuses(page);
  await holdBack(page, GOOGLE_MAP_CONFIG, 8000);
  await holdBack(page, GOOGLE_VIEWPORT, 3000);
  const pins = page.waitForResponse((response) => response.url().includes('/api/search/points'));
  await page.goto(COUNTY);
  expect((await pins).ok()).toBe(true);
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual([]);

  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30_000 });
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual(['failed:auth']);
  await expectPageWhole(page, seen.errors);
  await expectAccessible(page);
});

test('M120: a map that never finishes starting is given up on after 10 seconds, and the page is whole', async ({
  page,
}) => {
  const seen = watch(page);
  const releaseConfig = await holdBack(page, GOOGLE_MAP_CONFIG);
  const releaseViewport = await holdBack(page, GOOGLE_VIEWPORT);
  const pins = page.waitForResponse((response) => response.url().includes('/api/search/points'));
  await page.goto(COUNTY);
  expect((await pins).ok()).toBe(true);

  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30_000 });
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual(['failed:timeout']);
  await expectPageWhole(page, seen.errors);
  releaseConfig();
  releaseViewport();
});

test('M120: a map opened in a tab nobody is looking at is given its 10 seconds once it’s looked at', async ({
  page,
}) => {
  const seen = watch(page);
  await page.addInitScript(() => {
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as { lookAtTheTab?: () => void }).lookAtTheTab = () => {
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  const releaseConfig = await holdBack(page, GOOGLE_MAP_CONFIG);
  const releaseViewport = await holdBack(page, GOOGLE_VIEWPORT);
  await page.goto(COUNTY);
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'loading');
  // Well past the 10 seconds: still waiting, and nothing counted as failed.
  await page.waitForTimeout(13_000);
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'loading');
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual([]);

  // Looked at: the 10 seconds start now.
  await page.evaluate(() => (window as { lookAtTheTab?: () => void }).lookAtTheTab!());
  await page.waitForTimeout(5000);
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'loading');
  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 15_000 });
  expect(seen.counted.filter((count) => count.startsWith('failed'))).toEqual(['failed:timeout']);
  releaseConfig();
  releaseViewport();
});

test('M120: Google’s development-mode map (no billing) ends in Gaff’s sentence too', async ({
  page,
}) => {
  const seen = watch(page);
  await sendNoKey(page);
  await page.goto(SEARCH);
  await expect(page.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30_000 });
  // Google calls no hook for this: its dialog is what gives it away.
  await expect.poll(() => seen.counted).toEqual(['opened:larger', 'failed:google']);
  await expect(page.getByText('For development purposes only')).toHaveCount(0);
  await expect(page.locator('.dismissButton')).toHaveCount(0);
  expectOnlyTheOriginSent(seen, SEARCHED);
});

test('M38, M120: a lister whose browser can’t reach Google is told the pin can’t be placed, and carries on', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await blockOtherSites(page);
  await signUpOperator(page);
  await page.goto('/lettings/new');
  await page.getByRole('link', { name: 'Fill it in myself' }).click();
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill('40 Highfield Road');
  await page.getByLabel('Town or area').fill('Rathgar, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  // Nothing in the workspace has asked another site for anything.
  expect(seen.elsewhere).toEqual([]);
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Where is it on the map?' })).toBeVisible();
  await expect(
    page.getByText(
      'The map isn’t available right now, so the pin can’t be placed. Choose Next to carry on: the home goes in the list, and you can place the pin from its page later.',
    ),
  ).toBeVisible({ timeout: 30_000 });
  expect(new URL(seen.elsewhere[0]!.url).hostname).toBe('maps.googleapis.com');
  expectOnlyTheOriginSent(seen, ['lettings', 'setup', 'Highfield']);
  await expectAccessible(page);
  await screenshot(page, 'google/failed-picker');
  // Next carries on without a pin.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rent and date' })).toBeVisible();
});

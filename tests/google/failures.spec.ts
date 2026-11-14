import { expect, test, type Page } from '@playwright/test';
import { mapEnv } from '../../playwright.google.config';
import { isMapPage } from '../../src/lib/map-pages';
import {
  createLettingThroughUi,
  expectAccessible,
  getChecked,
  goLiveThroughUi,
  screenshot,
  signUpLandlord,
} from '../e2e/support';
import {
  COUNTY,
  SEARCH,
  blockOtherSites,
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
 * M136, M119, M120: Google's map in a production build, with no key of our own. Nothing leaves
 * for another site until the map is wanted, Google is told only what it needs, and every way the
 * map can fail ends in Gaff's sentence, never Google's error box. The list carries on throughout.
 */

const UNAVAILABLE = 'The map isn’t available right now. Every home is still in the list.';
const SEARCHED = ['to-rent', 'rathmines', 'km=3'];

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
  const search = await headersOf('/to-rent/dublin');
  expect(search.policy, 'Run `pnpm build:map` before `pnpm test:map`').toContain(
    'https://*.googleapis.com',
  );
  // The listing editor, where a letter places a home's pin (M38), has the same policy.
  const editor = await headersOf('/lettings/00000000-0000-4000-8000-000000000000/listing');
  expect(editor.policy).toBe(search.policy);
  // The pages the header rules name are the pages the scripts treat as the map's (M119).
  for (const path of [
    '/to-rent',
    '/to-rent/dublin/rathmines',
    '/lettings/00000000-0000-4000-8000-000000000000/listing',
    '/',
    '/sign-in',
    '/lettings',
    '/lettings/00000000-0000-4000-8000-000000000000/enquiries',
    '/home/no-such-home',
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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('3 homes');
    await page.waitForTimeout(1500);
    // In the list, the map hasn't loaded, been counted, or asked anyone for anything.
    expect(seen.elsewhere).toEqual([]);
    expect(seen.counted).toEqual([]);
    await expect(mapStage(page)).toHaveAttribute('data-stage', 'waiting');

    await page.getByRole('link', { name: 'Map', exact: true }).click();
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expect.poll(() => seen.counted).toEqual(['opened:phone', 'failed:script']);

    // The first thing asked of another site is Google's script, told only what draws a map:
    // the key, the release channel, the language and region, and to check the key against
    // the site's origin alone. No extra libraries, and none of the map library's usage tags.
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
    await page.getByRole('link', { name: 'List', exact: true }).click();
    await expect(page.getByRole('article').first()).toBeVisible();
  });
});

test('M120: when Google’s script never answers, Gaff says so and the list carries on', async ({
  page,
}) => {
  const seen = watch(page);
  const release = await stallGoogleScript(page);
  await page.goto(SEARCH);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('3 homes');
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'loading');
  // The list is whole while the map waits.
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3);
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
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3);
  expectOnlyTheOriginSent(seen, SEARCHED);
  await expectAccessible(page);
  await screenshot(page, 'google/failed-key');
});

/** The page is whole: its heading, every home in the list, and nothing thrown. */
async function expectPageWhole(page: Page, errors: string[]): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('4 homes');
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(4);
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  expect(errors).toEqual([]);
}

test('M120: a key refused while the pins wait to go on the map takes the map away, never the page', async ({
  page,
}) => {
  // Markers handed to a map that's still starting wait for its configuration. When Google then
  // refuses the key it takes its map apart, and the waiting markers throw as Gaff removes them.
  // That once took the whole page with it, list and all.
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
  // A slow connection: the pins have arrived, and the map hasn't. The same waiting markers.
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

test('M38, M120: a letter whose browser can’t reach Google is told the pin can’t be placed, and what to do', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await blockOtherSites(page);
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '40 Highfield Road', '', 'Rathgar, Dublin 6');
  await goLiveThroughUi(page);
  // Nothing in the workspace has asked another site for anything.
  expect(seen.elsewhere).toEqual([]);
  await page.getByRole('link', { name: 'Listing', exact: true }).click();

  const where = page.getByRole('region', { name: 'Where it is' });
  await expect(
    where.getByText(
      'The map isn’t available right now, so the pin can’t be placed. Try again in a few minutes. If your browser blocks Google’s map, allow it for Gaff and reload the page.',
    ),
  ).toBeVisible({ timeout: 30_000 });
  expect(new URL(seen.elsewhere[0]!.url).hostname).toBe('maps.googleapis.com');
  expectOnlyTheOriginSent(seen, ['lettings', 'listing', 'Highfield']);
  // The rest of the listing can still be filled in.
  await expect(page.getByLabel('Describe the home')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'google/failed-picker');
});

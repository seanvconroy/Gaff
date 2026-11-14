import { expect, test, type Page, type Response } from '@playwright/test';
import {
  createLettingThroughUi,
  getChecked,
  goLiveThroughUi,
  signUpLandlord,
} from '../e2e/support';
import { SEARCH, expectPolicyHolds, hasKey, watch } from './support';

/**
 * M119, ADR-0027: Google's script runs only in a document loaded for a page that shows its map,
 * and goes when the page does. A page's content security policy comes with its document, and
 * in-app links swap pages without one: so going between a map page and any other page is a full
 * page load, in both directions. These tests need no key: Google's script loading at all, and
 * being gone afterwards, is what they look at.
 */

/** How the map ends up: drawn with the run's key, or refused by Google without one. */
const SETTLED = hasKey ? ['opened:larger', 'shown:larger'] : ['opened:larger', 'failed:auth'];

const policyOf = (response: Response) => response.headers()['content-security-policy'] ?? '';

/** The next document the page loads for a path that starts like this. */
function nextDocument(page: Page, start: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().resourceType() === 'document' &&
      response.status() === 200 &&
      new URL(response.url()).pathname.startsWith(start),
  );
}

const googleLoaded = (page: Page) =>
  page.evaluate(() => typeof (window as { google?: unknown }).google !== 'undefined');

test('M119: the search is entered, and left, with a new document: Google’s script is never refused, and never left behind', async ({
  page,
}) => {
  const seen = watch(page);
  // A renter arrives on a home's page: from an alert email, say.
  await page.goto(SEARCH);
  const href = await page
    .getByRole('main')
    .getByRole('article')
    .first()
    .getByRole('link')
    .first()
    .getAttribute('href');
  const home = await page.goto(href!);
  expect(policyOf(home!)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1000);
  seen.elsewhere.length = 0;
  seen.counted.length = 0;

  // In: the link to the search loads a new document, with the map's policy.
  const [search] = await Promise.all([
    nextDocument(page, '/to-rent'),
    page
      .getByRole('navigation', { name: 'Gaff' })
      .getByRole('link', { name: 'Homes to rent' })
      .click(),
  ]);
  expect(policyOf(search)).toContain('https://*.googleapis.com');
  await expect.poll(() => seen.counted, { timeout: 30_000 }).toEqual(SETTLED);
  expectPolicyHolds(seen);

  // Out, by a card's title: the home's page is a new document, without Google or its policy.
  const [byTitle] = await Promise.all([
    nextDocument(page, '/home/'),
    page.getByRole('main').getByRole('article').first().getByRole('link').first().click(),
  ]);
  expect(policyOf(byTitle)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await googleLoaded(page)).toBe(false);

  // Back: the search again, in a document of its own, and its map loads as before.
  seen.counted.length = 0;
  await page.goBack();
  await expect(page).toHaveURL(/\/to-rent/);
  await expect.poll(() => seen.counted, { timeout: 30_000 }).toEqual(SETTLED);

  // Out, by a card's photos: the same.
  const [byPhoto] = await Promise.all([
    nextDocument(page, '/home/'),
    page
      .getByRole('main')
      .getByRole('list', { name: /^Photos of / })
      .first()
      .click(),
  ]);
  expect(policyOf(byPhoto)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await googleLoaded(page)).toBe(false);
  // Nothing on the home's page asks another site for anything.
  await page.waitForLoadState('load');
  seen.elsewhere.length = 0;
  await page.waitForTimeout(1500);
  expect(seen.elsewhere).toEqual([]);
  expectPolicyHolds(seen);
});

test('M119: a page swapped in across the boundary by a script loads again, with its own document', async ({
  page,
}) => {
  const seen = watch(page);
  const first = await page.goto('/map-and-place-data');
  expect(policyOf(first!)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Next.js's own router, as a redirect or a button would use it: no link is followed.
  const pushed = nextDocument(page, '/to-rent');
  await page.evaluate((to) => {
    const next = (window as { next?: { router?: { push: (href: string) => void } } }).next;
    if (!next?.router) throw new Error('Next.js’s router isn’t on the page');
    next.router.push(to);
  }, SEARCH);
  expect(policyOf(await pushed)).toContain('https://*.googleapis.com');
  await expect(page).toHaveURL(/\/to-rent\/dublin\/rathmines\?km=3$/);
  // Google was asked for nothing until the page had its own document; then the map loaded once.
  await expect.poll(() => seen.counted, { timeout: 30_000 }).toEqual(SETTLED);
  expectPolicyHolds(seen);
});

test('M38, M119: the listing editor is entered, and left, with a new document', async ({
  page,
}) => {
  test.slow();
  const seen = watch(page);
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '40 Highfield Road', '', 'Rathgar, Dublin 6');
  await goLiveThroughUi(page);
  expect(seen.elsewhere).toEqual([]);

  // In, by the letting's Listing tab.
  const [editor] = await Promise.all([
    nextDocument(page, '/lettings/'),
    page.getByRole('link', { name: 'Listing', exact: true }).click(),
  ]);
  expect(new URL(editor.url()).pathname).toMatch(/\/listing$/);
  expect(policyOf(editor)).toContain('https://*.googleapis.com');
  const where = page.getByRole('region', { name: 'Where it is' });
  // Google's script arrived: the map is there with the run's key, and refused by Google without.
  if (hasKey) {
    await expect(where.getByRole('button', { name: 'The home’s pin' })).toBeVisible({
      timeout: 30_000,
    });
  } else {
    await expect(where.getByText(/^The map isn’t available right now/)).toBeVisible({
      timeout: 30_000,
    });
  }
  expect(await googleLoaded(page)).toBe(true);
  expectPolicyHolds(seen);

  // Saving a section stays on the page, in the same document.
  await page.getByLabel('Deposit').fill('1850');
  await page.getByRole('button', { name: 'Save the price and enquiries' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();

  // Out, to the enquiries, where renters' details are: a new document, without Google.
  const [enquiries] = await Promise.all([
    nextDocument(page, '/lettings/'),
    page.getByRole('link', { name: 'Enquiries', exact: true }).click(),
  ]);
  expect(new URL(enquiries.url()).pathname).toMatch(/\/enquiries$/);
  expect(policyOf(enquiries)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await googleLoaded(page)).toBe(false);
});

import { expect, test, type Page, type Response } from '@playwright/test';
import { signUpOperator } from '../e2e/support';
import { SEARCH, expectPolicyHolds, fits, hasKey, watch } from './support';

/**
 * BA-5, M119 (the live line's ADR-0028, ADR-0022 here): Google's script runs only in a document
 * loaded for a page that shows its map, and goes when the page does. A page's content security
 * policy comes with its document, and in-app links swap pages without one: so going between a
 * map page and any other page is a full page load, in both directions. These tests need no key:
 * Google's script loading at all, and being gone afterwards, is what they look at.
 */

/** How the map ends up: drawn with the run's key, or refused by Google without one. */
const SETTLED = hasKey ? ['opened:larger', 'shown:larger'] : ['opened:larger', 'failed:auth'];

const policyOf = (response: Response) => response.headers()['content-security-policy'] ?? '';

/** The next document the page loads for a path that matches. */
function nextDocument(page: Page, path: RegExp): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().resourceType() === 'document' &&
      response.status() === 200 &&
      path.test(new URL(response.url()).pathname),
  );
}

const googleLoaded = (page: Page) =>
  page.evaluate(() => typeof (window as { google?: unknown }).google !== 'undefined');

test('M119: Search is entered, and left, with a new document: Google’s script is never refused, and never left behind', async ({
  page,
}) => {
  const seen = watch(page);
  // A renter arrives on a home's page: from an alert email, say.
  await page.goto(SEARCH);
  const href = await fits(page).getByRole('link').first().getAttribute('href');
  const home = await page.goto(href!);
  expect(policyOf(home!)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1000);
  seen.elsewhere.length = 0;
  seen.counted.length = 0;

  // In: the link to Search (the wordmark) loads a new document, with the map's policy.
  const [search] = await Promise.all([
    nextDocument(page, /^\/$/),
    page.getByRole('banner').getByRole('link', { name: 'Gaff' }).click(),
  ]);
  expect(policyOf(search)).toContain('https://*.googleapis.com');
  await expect.poll(() => seen.counted, { timeout: 30_000 }).toEqual(SETTLED);
  expectPolicyHolds(seen);

  // Out, by a card: the home's page is a new document, without Google or its policy.
  await page.goto(SEARCH);
  await expect.poll(() => seen.counted.length, { timeout: 30_000 }).toBeGreaterThan(2);
  const [byCard] = await Promise.all([
    nextDocument(page, /^\/homes\//),
    fits(page).getByRole('link').first().click(),
  ]);
  expect(policyOf(byCard)).not.toMatch(/google/);
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
  const pushed = nextDocument(page, /^\/$/);
  await page.evaluate((to) => {
    const next = (window as { next?: { router?: { push: (href: string) => void } } }).next;
    if (!next?.router) throw new Error('Next.js’s router isn’t on the page');
    next.router.push(to);
  }, SEARCH);
  expect(policyOf(await pushed)).toContain('https://*.googleapis.com');
  await expect(page).toHaveURL(/\/\?where=ranelagh$/);
  // Google was asked for nothing until the page had its own document; then the map loaded once.
  await expect.poll(() => seen.counted, { timeout: 30_000 }).toEqual(SETTLED);
  expectPolicyHolds(seen);
});

test('M38, M119: "Where is it on the map?" is entered, and left, with a new document', async ({
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
  expect(seen.elsewhere).toEqual([]);

  // In, by the address step's redirect: the pin's page loads again in a document of its own.
  const [pin] = await Promise.all([
    nextDocument(page, /\/setup\/pin$/),
    page.getByRole('button', { name: 'Next', exact: true }).click(),
  ]);
  expect(policyOf(pin)).toContain('https://*.googleapis.com');
  await expect(page.getByRole('heading', { name: 'Where is it on the map?' })).toBeVisible();
  // Google's script arrived: the map is there with the run's key, and refused by Google without.
  if (hasKey) {
    await expect(page.getByRole('button', { name: 'The home’s pin' })).toBeVisible({
      timeout: 30_000,
    });
  } else {
    await expect(page.getByText(/^The map isn’t available right now/)).toBeVisible({
      timeout: 30_000,
    });
  }
  expect(await googleLoaded(page)).toBe(true);
  expectPolicyHolds(seen);

  // Out, to the next step: a new document, without Google.
  const [rent] = await Promise.all([
    nextDocument(page, /\/setup\/rent$/),
    page.getByRole('button', { name: 'Next', exact: true }).click(),
  ]);
  expect(policyOf(rent)).not.toMatch(/google/);
  await expect(page.getByRole('heading', { name: 'Rent and date' })).toBeVisible();
  expect(await googleLoaded(page)).toBe(false);
});

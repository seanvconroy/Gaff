import { expect, test } from '@playwright/test';
import { openLettingMenu } from './journeys';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  screenshot,
  signUpOperator,
} from './support';

/**
 * BA-1: what the test copy brings from the live line, as far as a journey can see it. These runs
 * are GAFF_ENV=test with the development tools on and every email in the outbox, so the gate on
 * /dev and the absent sign-in stand-in on staging are held by tests/integration/ba1-test-copy.
 */

const widths = [
  [390, 844],
  [1280, 900],
] as const;

test('BA-1: made-up renters enquire about a live letting from its menu, and People shows them', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page, '9 Orchard Row');
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = await openLettingMenu(page, '9 Orchard Row');
  // One quiet action in the menu of rare actions, never a primary button.
  await menu.getByRole('menuitem', { name: 'Add test enquiries' }).click();
  await expect(page).toHaveURL(/\?view=people&added=5$/);
  await expect(
    page.getByText('5 made-up renters have enquired, as if from Daft and MyHome.'),
  ).toBeVisible();

  const people = page.getByRole('region', { name: 'Everyone who enquired' });
  // A header row, then one for each of the five.
  await expect(people.getByRole('row')).toHaveCount(6);
  await expect(people.getByText('Through Daft').first()).toBeVisible();
  await expect(people.getByText('Through MyHome').first()).toBeVisible();
  await expect(people.getByText('Hasn’t answered the questions yet')).toHaveCount(1);
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba1-test-enquiries-${width}`);
  }

  // Again: five more, new people, not the same five.
  await page.goto(lettingUrl);
  const again = await openLettingMenu(page, '9 Orchard Row');
  await again.getByRole('menuitem', { name: 'Add test enquiries' }).click();
  await expect(page).toHaveURL(/\?view=people&added=5$/);
  await expect(people.getByRole('row')).toHaveCount(11);
});

test('BA-1: robots.txt disallows everything where search indexing is off', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  const text = await robots.text();
  expect(text).toContain('User-Agent: *');
  expect(text).toContain('Disallow: /');
  expect(text).not.toContain('Allow:');
});

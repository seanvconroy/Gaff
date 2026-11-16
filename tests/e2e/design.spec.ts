import { expect, test, type Page } from '@playwright/test';
import { loadTokens } from '../../scripts/tokens/lib';
import {
  createLettingThroughUi,
  expectAccessible,
  expectFocusRings,
  expectNoSidewaysScroll,
  screenshot,
  signUpOperator,
} from './support';

const tokens = loadTokens();
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const pageColour = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('UX-DS-1, UX-DS-7: the look: a white page in ink and one blue, one type family, a top bar that becomes a bottom tab bar on a phone, light and dark themes, a focus ring on everything, and no motion when it’s reduced', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);

  // The current page is marked in the navigation, and the dashboard's one accent is the count.
  await page.goto('/today');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Lettings' })).not.toHaveAttribute('aria-current');
  await expect(page.getByText('1 thing', { exact: true })).toHaveCSS(
    'color',
    rgb(tokens.colors['brand-text']!.light),
  );

  // UX-DS-1: the page is white, and so is the navigation: it uses the ordinary tokens.
  expect(await pageColour(page)).toBe('rgb(255, 255, 255)');
  await expect(page.locator('header').filter({ has: nav })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );

  // UX-DS-7: one family. The title is DM Sans, not a serif, and no page loads Fraunces.
  const title = page.getByRole('heading', { level: 1, name: 'Your lettings' });
  await expect(title).toHaveCSS('font-family', /^"DM Sans"/);
  await expect(title).toHaveCSS('font-size', '32px');
  expect(
    await page.evaluate(() => [...document.fonts].map((font) => font.family.replace(/"/g, ''))),
  ).not.toContain('Fraunces');

  // UX-DS-8: no uppercase eyebrow above the title.
  await expect(page.locator('main header').getByText('Halcyon Lettings')).toHaveCount(0);

  // UX-DS-22: the wordmark is a drawing named "Gaff", with its full stop in the brand colour.
  const wordmark = page.getByRole('link', { name: 'Gaff', exact: true });
  await expect(wordmark.getByRole('img', { name: 'Gaff' })).toBeVisible();
  await expect(wordmark.locator('path').last()).toHaveCSS(
    'fill',
    rgb(tokens.colors['brand']!.light),
  );

  // UX-DS-2, UX-DS-13: the one primary button is ink, and 48px high.
  const add = page.getByRole('link', { name: 'Add a letting' });
  await expect(add).toHaveCSS('background-color', rgb(tokens.colors['ink']!.light));
  expect((await add.boundingBox())!.height).toBe(48);

  // Both themes: every interactive element shows a focus ring, including in the navigation.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/today');
    expect(await pageColour(page)).toBe(rgb(tokens.colors['surface-0']![colorScheme]));
    await expectFocusRings(page);
    await expectAccessible(page);
    await screenshot(page, `design-dashboard-${colorScheme}`);
  }

  // data-theme overrides the system setting, either way.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await pageColour(page)).toBe(rgb(tokens.colors['surface-0']!.light));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await pageColour(page)).toBe(rgb(tokens.colors['surface-0']!.dark));

  // Colour changes take motion-fast, and nothing at all under reduced motion.
  await page.goto('/today');
  const button = page.getByRole('link', { name: 'Add a letting' });
  await expect(button).toHaveCSS('transition-duration', '0.12s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/today');
  await expect(button).toHaveCSS('transition-duration', '0s');

  // On a phone the navigation is a bar along the bottom, and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  const bar = await nav.boundingBox();
  expect(bar!.y + bar!.height).toBeCloseTo(844, 0);
  expect(bar!.width).toBeCloseTo(390, 0);
  await expectNoSidewaysScroll(page);
  await expectFocusRings(page);
  await expectAccessible(page);
  await screenshot(page, 'design-dashboard-phone');
});

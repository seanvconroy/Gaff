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

test('ADR-0011: the A4 look: a navy sidebar that becomes a bottom bar on a phone, light and dark themes, a focus ring on everything, and no motion when it’s reduced', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);

  // The current page is marked in the navigation, and the dashboard's one accent is the count.
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Workspace' });
  await expect(nav.getByRole('link', { name: 'Lettings' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Approvals' })).not.toHaveAttribute('aria-current');
  await expect(page.getByText('1 thing', { exact: true })).toHaveCSS(
    'color',
    rgb(tokens.colors['atlantic-text']!.light),
  );

  // Both themes: every interactive element shows a focus ring, including in the sidebar.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
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
  await page.goto('/');
  const button = page.getByRole('link', { name: 'Add a letting' });
  await expect(button).toHaveCSS('transition-duration', '0.12s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(button).toHaveCSS('transition-duration', '0s');

  // On a phone the navigation is a bar along the bottom, and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = await nav.boundingBox();
  expect(bar!.y + bar!.height).toBeCloseTo(844, 0);
  expect(bar!.width).toBeCloseTo(390, 0);
  await expectNoSidewaysScroll(page);
  await expectFocusRings(page);
  await expectAccessible(page);
  await screenshot(page, 'design-dashboard-phone');
});

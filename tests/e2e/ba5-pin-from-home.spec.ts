import { expect, test } from '@playwright/test';
import {
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  homeIdIn,
  screenshot,
  signUpOperator,
} from './support';

/**
 * BA-5, M38, M126: the lister moves a home's pin from Home on its page ("Where it is"), on the
 * stand-in map, at both widths. A pin moved out of the address's area is asked about, and kept.
 */
for (const [width, viewport] of [
  ['390', { width: 390, height: 844 }],
  ['1280', { width: 1280, height: 900 }],
] as const) {
  test(`M38, M126: the pin is moved from Home, and a pin far from the address is asked about (${width})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    await addHomeThroughUi(page, `${width} Ranelagh Road`);
    const id = homeIdIn(page.url());
    await page.goto(`/lettings/${id}?view=home`);
    const where = page.getByRole('region', { name: 'Where it is' });
    await expect(where).toContainText('The pin is placed. Renters see the home there on the map.');
    await where.getByRole('link', { name: /^Move the pin/ }).click();

    await expect(page.getByRole('heading', { name: 'Where is it on the map?' })).toBeVisible();
    // Fifty steps west with Shift: well out of Ranelagh. Gaff asks, and never refuses.
    await page.getByRole('button', { name: 'The home’s pin' }).focus();
    for (let i = 0; i < 50; i++) await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.getByText(/^This pin (is in|isn’t in)/)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba5-pin-from-home-${width}`);
    await page.getByRole('button', { name: 'Save the pin' }).click();
    await expect(page.getByText('Saved. Renters see the home here on the map.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/lettings/${id}\\?view=home&saved=pin$`));
    await context.close();
  });
}

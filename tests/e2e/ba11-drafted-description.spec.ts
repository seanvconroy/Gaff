import { expect, test, type Page } from '@playwright/test';
import {
  confirmThePin,
  expectAccessible,
  expectNoSidewaysScroll,
  homeIdIn,
  isoDateInDays,
  pickDate,
  screenshot,
  signUpOperator,
} from './support';

/**
 * BA-11, the live line's P10 and P11: "Draft a description" beside the description, with the
 * stand-in model. The draft goes into the field to be read and changed; it carries "Drafted by
 * AI" while its words are the draft's, on the lister's side only, and the pill goes when the
 * lister changes a word and saves. At 390px and 1280px, the same steps and words.
 */
const widths = [
  [390, { width: 390, height: 844 }],
  [1280, { width: 1280, height: 900 }],
] as const;

const field = (page: Page) => page.getByLabel('About this home');
const draftButton = (page: Page) =>
  page.getByRole('button', { name: /^Draft (a|a new) description$/ });
const pill = (page: Page) => page.getByText('Drafted by AI', { exact: true });

test('P10, P11: a lister drafts a description from the facts, changes a word, saves, and the pill goes', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);

    // The first steps of adding a letting, filled in by hand.
    await page.goto('/lettings/new');
    await page.getByRole('link', { name: 'Fill it in myself' }).click();
    await page.getByRole('button', { name: 'Enter it myself' }).click();
    await page.getByLabel('Address', { exact: true }).fill(`${width} Harbour View`);
    await page.getByLabel('Town or area').fill('Ranelagh, Dublin 6');
    await page.getByLabel('County').selectOption('Dublin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await confirmThePin(page);
    await page.getByLabel('Rent a month').fill('1850');
    await pickDate(page, 'Available from', isoDateInDays(30));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The home', exact: true })).toBeVisible();
    const id = homeIdIn(page.url());

    // The facts on the screen are used before they are saved.
    await page
      .getByRole('group', { name: 'Type of home' })
      .getByRole('radio', { name: 'Apartment' })
      .check();
    await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
    await page.getByLabel('Anything else renters often ask?').fill('Gas central heating');

    // P10: a quiet action beside the field, never the screen's primary button.
    await expect(draftButton(page)).toHaveText('Draft a description');
    await expect(draftButton(page)).toHaveAttribute('data-button', 'quiet');
    await expect(pill(page)).toHaveCount(0);
    await draftButton(page).click();
    await expect(field(page)).toHaveValue(/Gas central heating/);
    await expect(field(page)).toHaveValue(/Type: Apartment\. .*Bedrooms: 2\./);
    // Never the rent, the street or the criteria.
    await expect(field(page)).not.toHaveValue(/1,?850|€|Harbour View/);
    await expect(pill(page)).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Drafted by AI from the facts' }),
    ).toBeVisible();
    await expect(draftButton(page)).toHaveText('Draft a new description');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba11-drafted-${width}`);

    // Saved as it was drafted: the letting's Home says so, to the lister.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
    await page.goto(`/lettings/${id}?view=home`);
    const part = page.getByRole('region', { name: 'Description' });
    await expect(part.getByText('Gas central heating')).toBeVisible();
    await expect(part.getByText('Drafted by AI', { exact: true })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ba11-home-drafted-${width}`);

    // Change a word: the words are the lister's now, and the pill goes.
    await part.getByRole('link', { name: /Change/ }).click();
    await expect(field(page)).toHaveValue(/Gas central heating/);
    await expect(pill(page)).toBeVisible();
    const drafted = await field(page).inputValue();
    await field(page).fill(drafted.replace('described', 'set out'));
    await expect(pill(page)).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ba11-changed-${width}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/lettings/${id}\\?view=home`));
    const saved = page.getByRole('region', { name: 'Description' });
    await expect(saved.getByText(/set out from the facts/)).toBeVisible();
    await expect(saved.getByText('Drafted by AI', { exact: true })).toHaveCount(0);
    await context.close();
  }
});

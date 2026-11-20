import { expect, test, type Page } from '@playwright/test';
import {
  expectAccessible,
  expectControlSizes,
  expectNoSidewaysScroll,
  screenshot,
  signUpLandlord,
  signUpOperator,
} from './support';

/** Each settings page is checked and kept at a phone's width and a laptop's. */
async function atBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await expectControlSizes(page);
    await screenshot(page, `${name}-${width}`);
  }
}

const rows = (page: Page) => page.getByRole('main').getByRole('listitem');

/** One primary (ink) button on the page: the page's one save (UX-ST-1, UX-DS-2). */
async function expectOneSave(page: Page) {
  await expect(page.getByRole('main').locator('[data-button="primary"]')).toHaveCount(1);
}

test('UX-ST-1 to UX-ST-3, UX-AI-14: Settings is a list of rows, each a page with one subject and one save', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // UX-TN-2: where tenants pay isn't a row until the first tenancy asks for it.
  // UX-ST-3: "Your usual times" isn't here at all.
  await expect(rows(page)).toHaveText([
    /^Enquiries/,
    /^The assistant\s*Checking Gaff’s answers before they go/,
    /^Income rule\s*2\.5 times the rent/,
    /^The agency\s*Halcyon Lettings/,
    // UX-AG-8: Team is the last row, for an agency.
    /^Team/,
  ]);
  await expect(page.getByRole('main').getByText(/usual|approve before send/i)).toHaveCount(0);
  await atBothWidths(page, 'ux-st-1-settings');

  // UX-ST-2, UX-AI-14: the assistant's one switch, on for every new account.
  await page.getByRole('link', { name: /^The assistant/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The assistant' })).toBeVisible();
  const check = page.getByRole('group', { name: 'Check Gaff’s answers before they go' });
  await expect(check.getByRole('radio', { name: /^On/ })).toBeChecked();
  await expect(page.getByText(/Fixed messages, like first replies/)).toBeVisible();
  await expectOneSave(page);
  await atBothWidths(page, 'ux-st-2-assistant');
  await check.getByRole('radio', { name: /^Off/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(check.getByRole('radio', { name: /^Off/ })).toBeChecked();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(rows(page).nth(1)).toHaveText(/Answers go straight out/);

  await page.getByRole('link', { name: /^Income rule/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income rule' })).toBeVisible();
  await expectOneSave(page);
  await atBothWidths(page, 'ux-st-1-income');
  await page.getByRole('radio', { name: '3 times the rent' }).check();
  await page.getByRole('button', { name: 'Save income rule' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/settings/agency');
  await expect(page.getByRole('heading', { level: 1, name: 'The agency' })).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await expectOneSave(page);
  await page.getByLabel(/Number renters can ring/).fill('not a number');
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(page.getByText(/Enter a phone number, like 01 234 5678/)).toBeVisible();
  await page.getByLabel(/Number renters can ring/).fill('01 234 5678');
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await atBothWidths(page, 'ux-st-1-agency');

  await page.goto('/settings/enquiries');
  await expect(page.getByRole('heading', { name: 'Your Gaff address' })).toBeVisible();
  await expectOneSave(page);
  await atBothWidths(page, 'ux-st-1-enquiries');

  await page.goto('/settings');
  await expect(rows(page).nth(2)).toHaveText(/3 times the rent/);
});

test('UX-ST-1: a private landlord’s settings have no agency row', async ({ page }) => {
  await signUpLandlord(page);
  await page.goto('/settings');
  await expect(rows(page)).toHaveText([/^Enquiries/, /^The assistant/, /^Income rule/]);
  await expectAccessible(page);
});

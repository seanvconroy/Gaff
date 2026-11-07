import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  createLettingThroughUi,
  expectAccessible,
  goLiveThroughUi,
  latestSmsCode,
  makeStaff,
  screenshot,
  signIn,
  signUpLandlord,
  uniqueEmail,
} from './support';

/** Synthetic photos: a coarse random grid each, so no two look copied (M29). */
async function photoFiles(count: number): Promise<string[]> {
  mkdirSync('test-results/photos', { recursive: true });
  const files: string[] = [];
  for (let n = 0; n < count; n++) {
    const grid = Buffer.alloc(12 * 9 * 3);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.floor(Math.random() * 256);
    const path = `test-results/photos/home-${Date.now()}-${n}.jpg`;
    await sharp(grid, { raw: { width: 12, height: 9, channels: 3 } })
      .resize(1200, 900, { kernel: 'nearest' })
      .jpeg()
      .toFile(path);
    files.push(path);
  }
  return files;
}

/** M3, M22, M24: confirms the landlord's mobile and identity through the real screens. */
async function getChecked(page: Page): Promise<void> {
  await page.goto('/settings/checks');
  const mobile = `087${String(Date.now()).slice(-7)}`;
  await page.getByLabel('Your mobile number').fill(mobile);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByText(/We’ve texted a 6-digit code/)).toBeVisible();
  await page
    .getByLabel('The code from the text')
    .fill(await latestSmsCode(`+353${mobile.slice(1)}`));
  await page.getByRole('button', { name: 'Confirm my number' }).click();
  await page.getByRole('button', { name: 'Check my identity' }).click();
  await page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(page.getByText('You’re checked')).toBeVisible();
}

/** Fills in everything a listing needs, through the listing editor. */
async function completeListing(page: Page, description: string): Promise<void> {
  await page.getByRole('link', { name: 'Listing', exact: true }).click();
  await expect(page.getByText('Draft: renters can’t see it yet')).toBeVisible();
  await page.getByLabel('Only the street and area').check();
  await page.getByLabel('Heating').selectOption('gas');
  await page.getByLabel('Outdoor space').selectOption('balcony');
  await page.getByLabel('Floor area in square metres').fill('68');
  await page.getByRole('button', { name: 'Save the home’s details' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();

  await page.getByLabel('Deposit').fill('1850');
  await page.getByRole('button', { name: 'Save the price and enquiries' }).click();

  await page.getByLabel('Describe the home').fill(description);
  await page.getByRole('button', { name: 'Save the description' }).click();

  await page.getByLabel('Add photos').setInputFiles(await photoFiles(3));
  await expect(page.getByText(/3 added/)).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('img', { name: 'Photo of the home' })).toHaveCount(3);
  }).toPass({ timeout: 30_000 });
}

const DESCRIPTION =
  'A bright two-bedroom apartment on a quiet road, a short walk from the Luas and Ranelagh village. Gas central heating, a south-facing balcony and a fitted kitchen.';

test('M37 to M48: a checked landlord lists a home, and it goes live', async ({ page }) => {
  test.slow();
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);

  await page.getByRole('link', { name: 'Listing', exact: true }).click();
  await expectAccessible(page);
  // M46: protected-ground wording is caught as it's typed.
  await page.getByLabel('Describe the home').fill('Lovely flat, would suit professionals.');
  await expect(page.getByText(/touches on housing assistance/)).toBeVisible();

  await completeListing(page, DESCRIPTION);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByText('Taking enquiries')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'm3-listing-live');

  await page.goto('/listings');
  await expect(
    page.getByRole('link', { name: '2 bed apartment in Ranelagh, Dublin 6' }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Taking enquiries' })).toBeVisible();
  await expectAccessible(page);
});

test('M29, M97: a listing that asks for money before a viewing waits for Gaff staff', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '7 Mount Pleasant Avenue');
  await goLiveThroughUi(page);
  await completeListing(
    page,
    `${DESCRIPTION} I am working abroad, so please send the deposit before the viewing.`,
  );
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByText('A person at Gaff is checking it')).toBeVisible();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffEmail = uniqueEmail('reviewer');
  await signIn(staff, staffEmail);
  await makeStaff(staffEmail);
  await staff.goto('/staff/listings');
  const card = staff
    .getByRole('region')
    .filter({ hasText: 'asks for money or contact before a viewing' })
    .first();
  await expect(card).toBeVisible();
  await expectAccessible(staff);
  await screenshot(staff, 'm3-staff-listings');
  await card.getByRole('button', { name: 'Let it go live' }).click();
  await expect(staff.getByText('Decided.')).toBeVisible();
  await staffContext.close();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();
});

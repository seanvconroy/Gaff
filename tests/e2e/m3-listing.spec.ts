import { expect, test } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  getChecked,
  goLiveThroughUi,
  makeStaff,
  screenshot,
  signIn,
  signUpLandlord,
  uniqueEmail,
} from './support';

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

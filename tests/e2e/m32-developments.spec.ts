import { expect, test } from '@playwright/test';
import {
  AVAILABLE_IN_DAYS,
  completeListing,
  expectAccessible,
  getChecked,
  goLiveThroughUi,
  inDays,
  photoFiles,
  screenshot,
  signUpLandlord,
} from './support';

const DEVELOPMENT = 'The Liffey Yards';
const DESCRIPTION =
  'A new build-to-rent development by Grand Canal Dock, with a residents’ lounge, a gym and bike storage, five minutes from the DART.';

test('M32 to M35, M75: a development, a home in it, two more copied from it, and its public page', async ({
  page,
}) => {
  test.slow();
  await signUpLandlord(page);
  await getChecked(page);

  // M32: the development, with its own description, amenities and photos.
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Developments' })
    .click();
  await page.getByRole('link', { name: 'Add a development' }).click();
  await page.getByLabel('Name').fill(DEVELOPMENT);
  await page.getByLabel('Street address').fill('Barrow Street');
  await page.getByLabel('Area').fill('Grand Canal Dock, Dublin 2');
  await page.getByLabel('Describe the development').fill(DESCRIPTION);
  await page.getByLabel('Gym').check();
  await page.getByLabel('Bike storage').check();
  await page.getByRole('button', { name: 'Save the development' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DEVELOPMENT })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Add photos of the development').setInputFiles(await photoFiles(3));
  await expect(page.getByText(/3 added/)).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('img', { name: 'Photo of the development' })).toHaveCount(3);
  }).toPass({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Publish the development’s page' }).click();
  await expect(page.getByText('The development’s page is live')).toBeVisible();
  const developmentUrl = page.url().replace(/\?.*$/, '');

  // M33: the first home in it: its own unit, rent and date.
  await page.getByRole('link', { name: `Add a home in ${DEVELOPMENT}` }).click();
  await expect(page.getByLabel('Area')).toHaveValue('Grand Canal Dock, Dublin 2');
  await page.getByLabel('Address', { exact: true }).fill('Apartment 1, Barrow Street');
  await page.getByLabel('Rent a month').fill('2650');
  await page.getByLabel('Available from').fill(inDays(AVAILABLE_IN_DAYS));
  await page.getByLabel('Type of home').selectOption('apartment');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('2');
  await page.getByLabel('Furnishing').selectOption('furnished');
  await page.getByLabel('BER rating').selectOption('A2');
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();
  await expect(page.getByText('Apartment 1, Barrow Street is saved')).toBeVisible();
  await page.getByLabel('Date').fill(inDays(7));
  await page.getByLabel('From').fill('18:00');
  await page.getByLabel('Until').fill('19:00');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByText('Viewing time added')).toBeVisible();
  await goLiveThroughUi(page);
  await completeListing(page, `${DESCRIPTION} Apartment 1 is on the first floor.`);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();

  // M35: two more, pasted from a spreadsheet, then published together.
  await page.goto(developmentUrl);
  await page
    .getByLabel('The homes to add, one per line')
    .fill(
      [`Apartment 12\t3\t2700\t${inDays(40)}\t74`, `Apartment 14\t4\t2750\t${inDays(45)}\t`].join(
        '\n',
      ),
    );
  await page.getByRole('button', { name: 'Add these homes' }).click();
  await expect(page.getByText(/2 homes added/)).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page);
  await screenshot(page, 'm32-development-workspace');
  await page.getByLabel(/I own these homes or I’m authorised to let them/).check();
  await page.getByRole('button', { name: 'Publish the homes that are ready' }).click();
  await expect(page.getByText('2 published')).toBeVisible({ timeout: 30_000 });

  // M34, M75: the development's public page, with its homes by type.
  await page.getByRole('link', { name: 'See its page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DEVELOPMENT })).toBeVisible();
  await expect(page.getByText('3 homes taking enquiries')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '2 bed apartment · 3 available · from €2,650 a month' }),
  ).toBeVisible();
  await expect(page.getByText('Bike storage', { exact: true })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'm32-development-page');

  // Each home says what's its own: floor, size and rent. M33: each links back to the development.
  await page.getByRole('link', { name: 'Floor 3, 74 m², €2,700 a month' }).click();
  await expect(page.getByRole('link', { name: DEVELOPMENT })).toBeVisible();
});

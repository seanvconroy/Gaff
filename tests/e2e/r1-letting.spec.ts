import { expect, test } from '@playwright/test';
import { daysFromToday } from '../fixtures/lettings';
import { expectAccessible, screenshot, signUpOperator } from './support';

test('R1: an operator creates a letting with viewing times', async ({ page }) => {
  await signUpOperator(page);
  await page.getByRole('link', { name: 'Add a letting' }).click();
  await expect(page.getByRole('heading', { name: 'Add a letting' })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Address', { exact: true }).fill('12 Ranelagh Road');
  await page.getByLabel('Area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('Eircode').fill('d06 f2x3');
  await page.getByLabel('Rent a month').fill('1,850');
  await page.getByLabel('Available from').fill(daysFromToday(30));
  await page.getByLabel('Type of home').selectOption('apartment');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Furnishing').selectOption('furnished');
  await page
    .getByLabel('Anything else renters often ask?')
    .fill('Gas central heating\nBins collected on Tuesdays\nNo HAP');
  await page.getByLabel('Daft advert').fill('https://www.daft.ie/for-rent/12-ranelagh-road/123456');
  await page.getByLabel('Landlord’s name').fill('Mary Byrne');
  await page.getByLabel('Landlord’s email').fill('mary.byrne@example.ie');
  await screenshot(page, '05-new-letting');
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();

  // Forgot the BER rating, and wrote "No HAP": both explained in plain words.
  await expect(page.getByText('Some details need another look')).toBeVisible();
  await expect(page.getByText('Choose the BER rating')).toBeVisible();
  await expect(page.getByText('touches on housing assistance')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '06-new-letting-errors');

  await page.getByLabel('BER rating').selectOption('C1');
  await page
    .getByLabel('Anything else renters often ask?')
    .fill('Gas central heating\nBins collected on Tuesdays');
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();

  await expect(page.getByText('12 Ranelagh Road is saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No viewing times yet' })).toBeVisible();
  await page.getByLabel('Date').fill(daysFromToday(7));
  await page.getByLabel('From').fill('18:00');
  await page.getByLabel('Until').fill('19:00');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByText('Viewing time added')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 viewing time, 4 places' })).toBeVisible();

  await page.getByLabel('Date').fill(daysFromToday(9));
  await page.getByLabel('From').fill('11:00');
  await page.getByLabel('Until').fill('11:30');
  await page.getByLabel('Group viewing').check();
  await page.getByLabel('How many can come').fill('10');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByRole('heading', { name: '2 viewing times, 14 places' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '07-viewing-times');

  await page.getByRole('link', { name: 'Back to setting up' }).click();
  await expect(page.getByRole('heading', { name: '12 Ranelagh Road', level: 1 })).toBeVisible();
  await expect(page.getByText('Step 1 of 9 · Set up')).toBeVisible();
  await expect(page.getByText('€1,850 a month')).toBeVisible();
  await expect(page.getByText('14 places to book.')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '08-letting-overview');

  await page.getByRole('link', { name: 'Lettings' }).click();
  await expect(page.getByRole('link', { name: '12 Ranelagh Road' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '09-dashboard-with-letting');
});

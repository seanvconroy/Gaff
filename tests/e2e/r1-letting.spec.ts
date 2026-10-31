import { expect, test } from '@playwright/test';
import { daysFromToday } from '../fixtures/lettings';
import { createLettingThroughUi, expectAccessible, screenshot, signUpOperator } from './support';

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

test('R2: an operator sets criteria from the fixed list', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await page.goto(page.url().replace(/\/viewings.*$/, ''));
  await page.getByRole('link', { name: 'Set your criteria' }).click();
  await expect(page.getByRole('heading', { name: 'Who can view', level: 1 })).toBeVisible();
  await expect(page.getByText('Why only these four?')).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByLabel('Plans to stay at least').selectOption('12');
  await page.getByLabel('No pets').check();
  await screenshot(page, '10-criteria');
  await page.getByRole('button', { name: 'Save criteria' }).click();

  await expect(page.getByText('Criteria saved.')).toBeVisible();
  await expect(page.getByText('Up to 3 people')).toBeVisible();
  await expect(page.getByText('Plans to stay at least a year')).toBeVisible();
  await expect(page.getByText('No pets (assistance dogs are always welcome)')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '11-overview-with-criteria');
});

test('R3: an operator checks the rent, and Gaff catches a rent over the cap', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await page.goto(page.url().replace(/\/viewings.*$/, '/rent-check'));
  await expect(page.getByRole('heading', { name: 'Rent check', level: 1 })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Yes, and the last tenancy began before 1 March 2026').check();
  await page.getByLabel('The tenant chose to leave').check();
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await page.getByLabel('Last rent a month').fill('1,700');
  await page.getByLabel('Date that rent was set').fill('2025-10-31');
  await screenshot(page, '12-rent-check');
  await page.getByRole('button', { name: 'Check the rent' }).click();

  await expect(page.getByText('The rent cap applies')).toBeVisible();
  await expect(page.getByText('The rent is more than the cap allows')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '13-rent-over-cap');

  await page.getByRole('link', { name: 'Check again' }).click();
  await page.getByLabel('Rent you’re asking a month').fill('1,720');
  await page.getByRole('button', { name: 'Check the rent' }).click();
  await expect(page.getByText('Rent check saved.')).toBeVisible();
  await expect(page.getByText('The rent is more than the cap allows')).toHaveCount(0);
  await expect(page.getByText('€1,720 a month').first()).toBeVisible();
});

test('R4: an operator records three comparable rents', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await page.goto(page.url().replace(/\/viewings.*$/, '/comparables'));
  await expect(page.getByRole('heading', { name: 'Comparable rents', level: 1 })).toBeVisible();
  for (const [n, rent, type] of [
    [1, '1,800', 'apartment'],
    [2, '1,950', 'apartment'],
    [3, '2,100', 'house'],
  ] as const) {
    const section = page.getByRole('region', { name: `Comparable ${n}` });
    await section.getByLabel('Area').fill('Dublin 6');
    await section.getByLabel('Type of home').selectOption(type);
    await section.getByLabel('Bedrooms').fill('2');
    await section.getByLabel('Rent a month').fill(rent);
  }
  await expectAccessible(page);
  await screenshot(page, '14-comparables');
  await page.getByRole('button', { name: 'Save comparables' }).click();
  await expect(page.getByText('Comparables saved for the rent-setting pack.')).toBeVisible();
  await expect(page.getByText('The middle rent is €1,950 a month.')).toBeVisible();
  await expect(page.getByText('Comparable 3 is a different type of home (house).')).toBeVisible();
  await expectAccessible(page);
});

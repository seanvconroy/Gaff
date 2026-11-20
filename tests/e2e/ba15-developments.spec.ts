import { expect, test, type Page } from '@playwright/test';
import { aPng } from '../fixtures/photos';
import {
  addATime,
  confirmThePin,
  expectAccessible,
  expectNoSidewaysScroll,
  homeIdIn,
  isoDateInDays,
  linkInEmail,
  pickDate,
  screenshot,
  signUpOperator,
  uniqueEmail,
} from './support';

/**
 * BA-15 (the live line's M32 to M35, M75): an agency adds a development with one type of four
 * homes and puts them live together; a renter finds "4 homes like this", opens the development's
 * page and asks to view one; the lister sees the person on that letting. Every screen has an
 * accessibility check and a screenshot at 390px and 1280px: screenshots/ba15-<screen>-<width>.png.
 */

async function atBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba15-${name}-${width}`);
  }
}

const photo = (name: string, colour: [number, number, number]) => ({
  name,
  mimeType: 'image/png',
  buffer: aPng(colour),
});

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();

test('M32 to M35, M75: an agency lists a scheme in minutes, and a renter sees it as one thing', async ({
  browser,
  page,
}) => {
  test.slow();
  test.setTimeout(360_000);
  await signUpOperator(page, 'Waterside Lettings');

  // "Several alike in one development", from Add a letting.
  await page.goto('/lettings/new');
  await page.getByRole('link', { name: 'Several alike in one development' }).click();
  await expect(
    page.getByRole('heading', { name: 'What is the development called?' }),
  ).toBeVisible();
  await atBothWidths(page, 'name');
  await page.getByLabel('Name', { exact: true }).fill('The Waterside');
  await next(page);

  await expect(page.getByRole('heading', { name: 'Where is it?' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill('Waterside Road');
  await page.getByLabel('Town or area').fill('Sandyford, Dublin 18');
  await page.getByLabel('County').selectOption('Dublin');
  await atBothWidths(page, 'address');
  await next(page);
  await confirmThePin(page);

  await expect(page.getByRole('heading', { name: 'What do the homes share?' })).toBeVisible();
  await page
    .getByRole('group', { name: /^Parking/ })
    .getByRole('radio', { name: 'A parking space' })
    .check();
  await page
    .getByLabel(/^About the development/)
    .fill('A new scheme beside the Luas, with a roof terrace, bike storage and a lift.');
  await atBothWidths(page, 'facts');
  await next(page);

  await expect(page.getByRole('heading', { name: 'Photos of the development' })).toBeVisible();
  await page.getByLabel('Choose photos').setInputFiles([photo('front.png', [36, 99, 168])]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  await atBothWidths(page, 'photos');
  await next(page);

  // One type of home, four of them.
  await expect(page.getByRole('heading', { name: 'What kind of home is this?' })).toBeVisible();
  await page.getByLabel(/^Name of the type/).fill('Type B');
  await page
    .getByRole('group', { name: 'Type of home' })
    .getByRole('radio', { name: 'Apartment' })
    .check();
  await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
  await page
    .getByRole('group', { name: /^Bathrooms/ })
    .getByRole('radio', { name: '2' })
    .check();
  await page.getByLabel(/^BER rating/).selectOption('A2');
  await page.getByLabel(/^Floor area/).fill('68');
  await atBothWidths(page, 'type');
  await next(page);

  await expect(page.getByRole('heading', { name: 'Rent, and how many' })).toBeVisible();
  await page.getByLabel('Rent for each home, a month').fill('2650');
  await page.getByLabel(/^How many homes of this type/).fill('4');
  await atBothWidths(page, 'rent');
  await next(page);

  await expect(page.getByRole('heading', { name: 'Photos of this type' })).toBeVisible();
  await page
    .getByLabel('Choose photos')
    .setInputFiles([photo('living.png', [201, 140, 60]), photo('bedroom.png', [90, 140, 90])]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(2);
  await next(page);

  await expect(page.getByRole('heading', { name: 'Which homes are they?' })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByLabel(new RegExp(`^Home ${i + 1}: number or door`)).fill(`Apartment ${11 + i}`);
    await page.getByLabel(new RegExp(`^Home ${i + 1}: floor`)).fill(String(1 + i));
    await pickDate(page, `Home ${i + 1}: free from`, isoDateInDays(20 + i));
  }
  await atBothWidths(page, 'homes');
  await page.getByRole('button', { name: 'Add 4 homes' }).click();

  // The letting details and the rent check, once for all four.
  await expect(page.getByRole('heading', { name: 'Letting details' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Most people' }).check();
  await page.getByLabel('Most people who can live there').selectOption('3');
  await next(page);
  await expect(page.getByRole('heading', { name: 'Has this home been let before?' })).toBeVisible();
  await page.getByLabel('No, this is its first letting').check();
  await next(page);

  await expect(page.getByRole('heading', { name: 'Check the homes' })).toBeVisible();
  await expect(page.getByText('Apartment 14, The Waterside')).toBeVisible();
  await atBothWidths(page, 'review');
  await page.getByRole('button', { name: 'Put 4 homes live' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'The Waterside' })).toBeVisible();
  await expect(page.getByText('4 homes are live')).toBeVisible();
  await atBothWidths(page, 'development');

  // Lettings groups them under the development, with how many are live, let and free.
  await page.goto('/lettings');
  await expect(page.getByRole('heading', { name: 'The Waterside', exact: true })).toBeVisible();
  await expect(page.getByText('4 homes · 4 live · 0 let · 4 free')).toBeVisible();
  await atBothWidths(page, 'lettings');

  // One viewing time for every home of the type: each home keeps its own people.
  await page.goto('/calendar');
  await addATime(page, isoDateInDays(7), async (sheet) => {
    await sheet.getByLabel('Home').selectOption({ label: 'All 4 homes of Type B, The Waterside' });
  });
  await expect(
    page.getByRole('status').filter({ hasText: 'Viewing time added to 4 homes' }),
  ).toBeVisible();

  // A renter on their phone finds the scheme as one card, opens it, and asks to view a home.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const renter = await context.newPage();
  await renter.goto('/');
  const card = renter
    .getByRole('listitem')
    .filter({ hasText: '4 homes like this' })
    .getByRole('link', { name: 'From €2,650 a month' });
  await expect(card).toHaveCount(1);
  await atBothWidths(renter, 'search');
  await renter.setViewportSize({ width: 390, height: 844 });
  await card.click();
  await expect(renter.getByRole('heading', { level: 1, name: 'The Waterside' })).toBeVisible();
  await expect(renter.getByText('4 free · from €2,650 a month')).toBeVisible();
  await atBothWidths(renter, 'public-page');
  await renter.setViewportSize({ width: 390, height: 844 });
  await renter.getByRole('link', { name: /^Apartment 12 · floor 2/ }).click();
  await expect(
    renter.getByRole('heading', {
      level: 1,
      name: 'Apartment 12, The Waterside, Sandyford, Dublin 18',
    }),
  ).toBeVisible();
  await expect(renter.getByRole('link', { name: 'Part of The Waterside' })).toBeVisible();
  await renter
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await expect(
    renter.getByRole('heading', { level: 1, name: 'Who should we reply to?' }),
  ).toBeVisible();
  const name = 'Niamh Kelly';
  await renter.getByLabel('Your name').fill(name);
  const email = uniqueEmail('niamh');
  await renter.getByLabel('Your email').fill(email);
  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();
  await renter.getByRole('radio', { name: '2', exact: true }).check();
  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.getByRole('heading', { name: 'Anything to ask about the home?' }),
  ).toBeVisible();
  await renter.getByRole('button', { name: 'Skip' }).click();
  await expect(renter.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
  // They confirm from the first email, which says it's from an AI assistant (rule 6).
  let first = '';
  await expect(async () => {
    first = await linkInEmail(email, 'Your enquiry about Apartment 12, The Waterside');
  }).toPass({ timeout: 30_000 });
  await renter.goto(first);
  await expect(renter.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
  await context.close();

  // The lister sees the person on that letting, and Today names the development's home.
  await page.goto('/lettings');
  await page.getByRole('link', { name: /^Apartment 12, The Waterside/ }).click();
  await page.waitForURL(/\/lettings\/[0-9a-f-]{36}/);
  const lettingUrl = `/lettings/${homeIdIn(page.url())}`;
  await expect(async () => {
    await page.goto(`${lettingUrl}/who-views`);
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await page.goto('/today');
  await expect(page.getByText(/Apartment 12, The Waterside/).first()).toBeVisible();
});

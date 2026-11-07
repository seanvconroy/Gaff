import { devices, expect, test } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  getChecked,
  goLiveThroughUi,
  screenshot,
  signUpLandlord,
} from './support';

const TITLE = '2 bed apartment in Rathgar, Dublin 6';
const DESCRIPTION =
  'A quiet two-bedroom apartment off Rathgar village, with gas central heating, a balcony facing the garden and a bus stop at the door.';

test('M56 to M72: a renter on a phone finds a home by place and filters, and reads its page', async ({
  browser,
  page,
}) => {
  test.slow();
  // A checked landlord lists a home in Rathgar.
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '22 Highfield Road', '', 'Rathgar, Dublin 6');
  await goLiveThroughUi(page);
  await completeListing(page, DESCRIPTION);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();

  // A renter on a phone, not signed in, starts at Gaff's front door.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto('/');
  await expect(renter).toHaveURL(/\/to-rent$/);
  await expect(renter.getByRole('heading', { name: 'Homes to rent in Ireland' })).toBeVisible();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-search-ireland');

  // M56: suggestions as they type.
  await renter.getByLabel('Where do you want to live?').fill('Rathg');
  await renter.getByRole('option', { name: /Rathgar/ }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar$/);
  await expect(renter.getByRole('heading', { name: 'Homes to rent in Rathgar' })).toBeVisible();
  await expect(renter.getByText('1 home taking enquiries')).toBeVisible();
  // M60: what renters filter on is on the card.
  const card = renter.getByRole('article', { name: TITLE });
  await expect(card.getByText('€1,850 a month')).toBeVisible();
  await expect(card.getByText('2 bedrooms · 1 bathroom · Apartment')).toBeVisible();
  await expect(card.getByText('No pets')).toBeVisible();
  // M62: an area page links to the places around it.
  await expect(renter.getByRole('navigation', { name: 'Nearby' })).toBeVisible();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-search-rathgar');

  // M58: filters live in the web address. M61: when nothing matches, Gaff offers wider searches.
  await renter.getByText('Filters', { exact: true }).click();
  await renter.getByLabel('Bedrooms').selectOption('3');
  await renter.getByRole('button', { name: 'Show homes' }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar\?beds=3$/);
  await expect(renter.getByRole('heading', { name: 'Nothing matches yet' })).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'm4-search-nothing');
  await renter.getByRole('link', { name: '2 or more bedrooms' }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar\?beds=2$/);

  // M66 to M72: the listing page.
  await card.getByRole('link', { name: TITLE }).click();
  await expect(renter.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(
    renter.getByText(
      '€3,700 to move in: first month’s rent of €1,850 and a deposit of €1,850. No other fees.',
    ),
  ).toBeVisible();
  await expect(renter.getByText('Up to 3 people')).toBeVisible();
  await expect(renter.getByText('No pets (assistance dogs are always welcome)')).toBeVisible();
  await expect(renter.getByText(/Assistance dogs are always welcome\./)).toBeVisible();
  await expect(renter.getByText(/Identity checked by Gaff/)).toBeVisible();
  await expect(renter.getByText(/^Listed .* · Confirmed available /)).toBeVisible();
  await expect(renter.getByText('Everyone who enquires hears back, either way.')).toBeVisible();
  await expect(renter.getByRole('heading', { name: 'Viewings' })).toBeVisible();
  // No exact address: only the street and area, as the letter chose.
  await expect(renter.getByText('Highfield Road, Rathgar, Dublin 6')).toBeVisible();
  await expect(renter.getByText('22 Highfield Road')).toHaveCount(0);
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-listing');

  // M66: the gallery, with buttons and the keyboard, and full screen.
  await renter.getByRole('button', { name: 'Next photo' }).click();
  await expect(renter.getByText('Photo 2 of 3')).toBeVisible();
  await renter.getByRole('button', { name: 'See full screen' }).click();
  const dialog = renter.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await renter.keyboard.press('ArrowRight');
  await expect(dialog.getByText('Photo 3 of 3')).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'm4-gallery');
  await dialog.getByRole('button', { name: 'Close full screen' }).click();
  await expect(dialog).toBeHidden();
  await phone.close();
});

test('M59, M62, M111: search engines read the public pages, and nothing private', async ({
  page,
  request,
}) => {
  await page.goto('/how-results-are-ordered');
  await expect(page.getByRole('heading', { name: 'How we order results' })).toBeVisible();
  await expectAccessible(page);

  // M62: one address for each place.
  await page.goto('/to-rent/rathgar');
  await expect(page).toHaveURL(/\/to-rent\/dublin\/rathgar$/);
  await page.goto('/to-rent/d6');
  await expect(page).toHaveURL(/\/to-rent\/dublin\/dublin-6$/);
  await expect(page.getByRole('heading', { name: 'Homes to rent in Dublin 6' })).toBeVisible();

  // M111: area pages and listings are indexed; filtered searches and private pages aren't.
  const area = await request.get('/to-rent/dublin/rathgar');
  expect(area.headers()['x-robots-tag']).toBeUndefined();
  expect((await request.get('/sign-in')).headers()['x-robots-tag']).toBe('noindex, nofollow');
  await page.goto('/to-rent/dublin/rathgar?beds=2');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/to-rent/dublin/rathgar</loc>');
  const listing = /\/home\/(2-bed-apartment-in-rathgar-dublin-6-[a-f0-9]{8})/.exec(sitemap)?.[1];
  expect(listing).toBeTruthy();
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Allow: /to-rent');
  expect(robots).toContain('Disallow: /');

  await page.goto(`/home/${listing}`);
  const data = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(data).toMatchObject({
    '@type': 'Apartment',
    offers: { price: 1850, priceCurrency: 'EUR' },
    address: { streetAddress: 'Highfield Road, Rathgar, Dublin 6' },
  });
  // Only what the page shows: never the house number, an Eircode or the landlord's name.
  expect(JSON.stringify(data)).not.toMatch(/22 Highfield|[A-Z]\d{2} [A-Z0-9]{4}|Mary|Walsh/);
});

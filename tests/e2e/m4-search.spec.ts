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
  await expect(
    renter.getByRole('heading', { level: 1, name: /^\d+ homes? in Ireland$/ }),
  ).toBeVisible();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-search-ireland');

  // M56: the search pill opens the Where box, with suggestions as they type.
  await renter.getByRole('button', { name: /Where do you want to live\?/ }).click();
  const where = renter.getByRole('combobox', { name: 'Where do you want to live?' });
  await expect(where).toBeFocused();
  await where.fill('Rathg');
  await expect(renter.getByRole('option', { name: /^Rathgar/ })).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'm4-search-where');
  await renter.getByRole('option', { name: /^Rathgar/ }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar$/);
  await expect(renter).toHaveTitle('Homes to rent in Rathgar · Gaff');
  await expect(renter.getByRole('heading', { level: 1, name: '1 home in Rathgar' })).toBeVisible();
  // M60: what renters filter on is on the card.
  const card = renter.getByRole('article', { name: TITLE });
  await expect(card.getByText('€1,850 a month')).toBeVisible();
  await expect(card.getByText(/^2 beds · 1 bath · /)).toBeVisible();
  await expect(card.getByText(/No pets$/)).toBeVisible();
  // M62: an area page links to the places around it.
  await expect(renter.getByRole('navigation', { name: 'Nearby' })).toBeVisible();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-search-rathgar');

  // M58, M116: the Filters sheet counts homes as the renter chooses, and applies when they're done.
  await renter.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = renter.getByRole('dialog', { name: 'Filters' });
  const bedrooms = sheet.getByRole('group', { name: 'Bedrooms' });
  await bedrooms.getByRole('radio', { name: '3+' }).check();
  await expect(sheet.getByRole('button', { name: 'No homes match these filters' })).toBeDisabled();
  await bedrooms.getByRole('radio', { name: '2+' }).check();
  await expect(sheet.getByRole('button', { name: 'Show 1 home' })).toBeEnabled();
  await expectAccessible(renter);
  await screenshot(renter, 'm4-search-filters');
  await sheet.getByRole('button', { name: 'Show 1 home' }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar\?beds=2$/);
  // M115: the filter that's on shows as a chip, which removes it.
  await expect(renter.getByRole('link', { name: '2+ beds: remove this filter' })).toBeVisible();

  // M61: when nothing matches, Gaff offers wider searches, with their counts, and an alert.
  await renter.goto('/to-rent/dublin/rathgar?beds=3');
  await expect(
    renter.getByRole('heading', { name: 'No homes match yet in Rathgar.' }),
  ).toBeVisible();
  await expect(renter.getByRole('button', { name: 'Get alerts for this search' })).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'm4-search-nothing');
  await renter.getByRole('link', { name: /^2 or more bedrooms: 1 home$/ }).click();
  await expect(renter).toHaveURL(/\/to-rent\/dublin\/rathgar\?beds=2$/);

  // M57, M117: the Map button shows the homes on a map, with their cards to swipe along its foot;
  // a pin brings its card forward; List goes back.
  await renter.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(renter).toHaveURL(/\?beds=2&view=map$/);
  const row = renter.getByRole('list', { name: 'Homes on the map' });
  await expect(row.getByRole('link', { name: TITLE })).toBeVisible();
  const pin = renter.getByRole('button', { name: `€1,850 a month, ${TITLE}` });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('listitem').filter({ hasText: TITLE })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm4-search-map');
  await renter.getByRole('link', { name: 'List', exact: true }).click();
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

test('M56, M113, M115 to M117: on a computer, a renter searches near a street, filters at once and uses the map', async ({
  page,
}) => {
  // The home listed in the journey above: 22 Highfield Road, Rathgar.
  await page.goto('/to-rent');
  const where = page.getByRole('combobox', { name: 'Where do you want to live?' });
  await where.fill('Highfield r');
  await expect(page.getByRole('group', { name: 'Streets' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'm4-search-suggestions');

  // M113: a street opens a search near it, within a kilometre in a city.
  await page.getByRole('option', { name: /^Highfield Road.*Rathgar, Dublin 6/ }).click();
  await expect(page).toHaveURL(/\/to-rent\/near\/highfield-road-rathgar-dublin-6$/);
  await expect(page).toHaveTitle('Homes to rent near Highfield Road, Rathgar · Gaff');
  await expect(
    page.getByRole('heading', { level: 1, name: '1 home near Highfield Road, Rathgar' }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Distance' })).toHaveValue('1');
  await expect(where).toHaveValue('Highfield Road');

  // M116: quick filters apply as soon as they change, and say their value.
  await page.getByRole('button', { name: 'Rent', exact: true }).click();
  const rent = page.getByRole('dialog', { name: 'Rent a month' });
  await expect(rent.getByLabel('Lowest')).toBeFocused();
  await rent.getByLabel('Highest').fill('2000');
  await rent.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/to-rent\/near\/highfield-road-rathgar-dublin-6\?max=2000$/);
  await expect(page.getByRole('button', { name: 'Up to €2,000', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Beds', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Bedrooms and bathrooms' })
    .getByRole('group', { name: 'Bedrooms' })
    .getByRole('radio', { name: '3+' })
    .check();
  await expect(page).toHaveURL(/\?max=2000&beds=3$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'No homes near Highfield Road, Rathgar' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // M115: each filter that's on is a chip that removes it.
  await page.getByRole('link', { name: '3+ beds: remove this filter' }).click();
  await expect(page).toHaveURL(/\?max=2000$/);
  const card = page.getByRole('article', { name: TITLE });
  await expect(card).toBeVisible();

  // M57, M117: the map beside the list, a pin that lights up with its card, and a mini card.
  const map = page.getByRole('complementary', { name: 'Map' });
  const pin = map.getByRole('button', { name: `€1,850 a month, ${TITLE}` });
  await expect(pin).toBeVisible();
  await card.hover();
  await expect(pin).toHaveAttribute('data-on', 'true');
  await pin.click();
  await expect(map.getByRole('article', { name: `Chosen home: ${TITLE}` })).toBeVisible();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await screenshot(page, 'm4-search-desktop');
});

test('M59, M62, M111: search engines read the public pages, and nothing private', async ({
  page,
  request,
}) => {
  await page.goto('/how-results-are-ordered');
  await expect(page.getByRole('heading', { name: 'How we order results' })).toBeVisible();
  await expectAccessible(page);

  // ADR-0027: the credits for the place index and the map, linked from every public page.
  await page.getByRole('contentinfo').getByRole('link', { name: 'Map and place data' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Map and place data' })).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: /© OpenStreetMap contributors, under the Open Database Licence/,
    }),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expectAccessible(page);

  // M62: one address for each place.
  await page.goto('/to-rent/rathgar');
  await expect(page).toHaveURL(/\/to-rent\/dublin\/rathgar$/);
  await page.goto('/to-rent/d6');
  await expect(page).toHaveURL(/\/to-rent\/dublin\/dublin-6$/);
  await expect(page.getByRole('heading', { level: 1, name: / in Dublin 6$/ })).toBeVisible();
  await expect(page).toHaveTitle(/Homes to rent in Dublin 6/);

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
  expect(robots).toContain('Allow: /map-and-place-data');
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

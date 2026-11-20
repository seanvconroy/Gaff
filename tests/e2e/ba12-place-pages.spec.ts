import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { aPng } from '../fixtures/photos';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  expectAccessible,
  expectNoSidewaysScroll,
  isoDateInDays,
  screenshot,
  settled,
} from './support';

/**
 * BA-12 (M62, M58, M59, M73, M74, M111): places' pages, what search engines are told, "How
 * results are ordered", and similar homes on a home's page, live and let. The homes are made-up
 * homes put straight into the database, in Tramore, which no other journey uses. This run's copy
 * of Gaff has SEARCH_INDEXING off, as every copy but production does.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

interface Home {
  address: string;
  rent: number;
  beds: number;
  type: string;
  status: 'live' | 'let';
}

const homes: Home[] = [
  { address: '2 Strand Street', rent: 1600, beds: 2, type: 'apartment', status: 'live' },
  { address: '4 Strand Street', rent: 1650, beds: 2, type: 'apartment', status: 'live' },
  { address: '6 Strand Street', rent: 1700, beds: 3, type: 'house', status: 'live' },
  { address: '8 Strand Street', rent: 1600, beds: 2, type: 'apartment', status: 'let' },
];

/** Made-up homes in Tramore, let by a made-up confirmed agency. Their public references. */
async function homesInTramore(): Promise<Map<string, string>> {
  const refs = async () =>
    new Map(
      (
        await asSystem<{ address: string; ref: string }>(
          `select address_line1 as address, public_ref as ref from lettings
           where area = 'Tramore' and county = 'Waterford'`,
        )
      ).map((row) => [row.address, row.ref]),
    );
  const made = await refs();
  if (made.size > 0) return made;
  const userId = randomUUID();
  const [org] = await asSystem<{ id: string }>(
    `insert into organisations (name, kind, confirmed_at, psra_licence_number, inbound_slug)
     values ('Strand Lettings', 'agency', now(), '7770012', $1) returning id`,
    [`strand-${userId.slice(0, 8)}`],
  );
  await asSystem('insert into users (id, name, email) values ($1, $2, $3)', [
    userId,
    'Aoife Test',
    `aoife.${userId.slice(0, 8)}@strand.test`,
  ]);
  const photo = aPng([36, 99, 168]);
  for (const [i, home] of homes.entries()) {
    const [letting] = await asSystem<{ id: string }>(
      `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
         available_from, property_type, bedrooms, furnished, parking, criteria, stage, status,
         created_by, lead_user_id, live_at, let_at, ber_rating, eircode)
       values ($1, $2, 'Tramore', 'Waterford', $3, $4, $5, $6, 'furnished', 'street', $7,
         'enquiries', $8, $9, $9, now() - make_interval(hours => $10),
         $11, 'C1', 'X91 T2RA') returning id`,
      [
        org!.id,
        home.address,
        home.rent * 100,
        isoDateInDays(5),
        home.type,
        home.beds,
        JSON.stringify({ maxOccupants: 3, noPets: true }),
        home.status,
        userId,
        i + 1,
        home.status === 'let' ? new Date() : null,
      ],
    );
    const key = `homes/${org!.id}/${randomUUID()}.png`;
    await asSystem(
      'insert into dev_photo_store (key, content_type, bytes, size) values ($1, $2, $3, $4)',
      [key, 'image/png', photo, photo.length],
    );
    await asSystem(
      `insert into letting_photos (organisation_id, letting_id, position, storage_key,
         content_type, bytes, created_by)
       values ($1, $2, 0, $3, 'image/png', $4, $5)`,
      [org!.id, letting!.id, key, photo.length, userId],
    );
  }
  return refs();
}

let refs = new Map<string, string>();
test.beforeAll(async () => {
  refs = await homesInTramore();
});

const TRAMORE = '/to-rent/waterford/tramore';

for (const [width, viewport] of widths) {
  test(`M62: a place’s page is search, answered for that place (${width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto(TRAMORE);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Homes to rent in Tramore' }),
    ).toBeVisible();
    // The box is the redesign's search box, named by the heading.
    await expect(page.getByRole('textbox', { name: 'Homes to rent in Tramore' })).toBeVisible();
    await expect(
      page.getByText('3 homes free to rent in Tramore, Co. Waterford on Gaff.'),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'What Gaff understood' }).getByText('Tramore, Co. Waterford'),
    ).toBeVisible();
    const fits = page.getByRole('list', { name: '3 homes fit what you asked' });
    await expect(fits.getByRole('listitem')).toHaveCount(3);
    // UX-LS-10: the let home has left search at once.
    await expect(fits.getByText('Free from').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tell me about new ones' })).toBeVisible();
    // The places around it, and its county.
    const near = page.getByRole('list', { name: 'Places near Tramore' });
    await expect(
      near.getByRole('link', { name: /^All homes in County Waterford/ }),
    ).toHaveAttribute('href', '/to-rent/waterford');
    // M59: how the results are ordered, under them.
    await expect(page.getByRole('link', { name: 'How results are ordered' })).toHaveAttribute(
      'href',
      '/how-results-are-ordered',
    );
    // M111, UX-LS-11: this copy of Gaff is never indexed, whatever the page.
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${TRAMORE}$`),
    );
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba12-place-${width}`);
    await expectAccessible(page);
  });
}

test('M62, M58: other spellings go to the one address, and a filter makes the search', async ({
  page,
}) => {
  await page.setViewportSize(phone);
  await page.goto('/to-rent/tramore');
  await expect(page).toHaveURL(new RegExp(`${TRAMORE}$`));
  await page.goto('/to-rent/Waterford/Tramore');
  await expect(page).toHaveURL(new RegExp(`${TRAMORE}$`));
  // The live line's page for all homes is the first screen.
  await page.goto('/to-rent');
  await expect(
    page.getByRole('heading', { level: 1, name: 'What are you looking for?' }),
  ).toBeVisible();
  // A place's page with a filter is that search, at the first screen's address.
  await page.goto(`${TRAMORE}?beds=3`);
  await expect(page).toHaveURL(/\/\?where=tramore&beds=3$/);
  await expect(page.getByRole('list', { name: '1 home fits what you asked' })).toBeVisible();
  // M58: the search for the place alone has its page as its canonical address.
  await page.goto('/?where=tramore');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`${TRAMORE}$`),
  );
  // A place Gaff doesn't know.
  const missing = await page.goto('/to-rent/waterford/nowhere-at-all');
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Gaff doesn’t know that place yet' }),
  ).toBeVisible();
  await expectAccessible(page);
});

for (const [width, viewport] of widths) {
  test(`M62: a place with no homes still has its page, offering wider places with homes (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto('/to-rent/leitrim');
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Homes to rent in County Leitrim' }),
    ).toBeVisible();
    await expect(page.getByText('No homes free in Co. Leitrim on Gaff just now.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No homes match yet.' })).toBeVisible();
    // UX-SR-9: the one primary action saves the search.
    await expect(page.locator('[data-button="primary"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Tell me when one comes up' })).toBeVisible();
    const wider = page.getByRole('list', { name: 'Places nearby with homes' });
    await expect(wider.getByRole('link').first()).toHaveAttribute('href', /^\/to-rent\//);
    await expect(wider.getByRole('link', { name: /· \d+ homes?$/ }).first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba12-place-no-homes-${width}`);
    await expectAccessible(page);
  });
}

for (const [width, viewport] of widths) {
  test(`M74, UX-LS-10: a let home’s page says so, and offers its place and similar homes (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/homes/${refs.get('8 Strand Street')}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'This home has been let' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'See other homes in Tramore' })).toHaveAttribute(
      'href',
      TRAMORE,
    );
    const similar = page.getByRole('list', { name: 'Similar homes nearby' });
    await expect(similar.getByRole('listitem')).toHaveCount(2);
    await expect(similar.getByRole('link', { name: '€1,600 a month' })).toHaveAttribute(
      'href',
      `/homes/${refs.get('2 Strand Street')}`,
    );
    await expect(page.getByRole('link', { name: 'Ask to view' })).toHaveCount(0);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba12-let-home-${width}`);
    await expectAccessible(page);
  });
}

test('M73, M111: a live home’s page has similar homes and structured data from its own facts', async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await page.goto(`/homes/${refs.get('2 Strand Street')}`);
  const similar = page.getByRole('list', { name: 'Similar homes nearby' });
  await expect(similar.getByRole('listitem')).toHaveCount(1);
  await expect(similar.getByRole('link', { name: '€1,650 a month' })).toBeVisible();
  const json = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(json ?? '{}') as Record<string, unknown>;
  expect(data).toMatchObject({
    '@type': 'Apartment',
    numberOfBedrooms: 2,
    address: { streetAddress: '2 Strand Street', addressLocality: 'Tramore' },
    offers: { price: 1600, priceCurrency: 'EUR' },
  });
  // Nothing the page doesn't show: no Eircode, no lister, no person.
  expect(json).not.toMatch(/X91|Strand Lettings|Aoife|7770012/);
  await settled(page);
  await screenshot(page, 'ba12-live-home-similar-1280');
  await expectAccessible(page);
});

test('M111: with SEARCH_INDEXING off there is no sitemap entry, and robots.txt names none', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).not.toContain('<url>');
  expect(xml).not.toContain('/homes/');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
  expect(robots).not.toMatch(/Sitemap:/i);
  expect(robots).not.toMatch(/Allow:/);
});

for (const [width, viewport] of widths) {
  test(`M59: “How results are ordered”, from under the results (${width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(TRAMORE);
    await page.getByRole('link', { name: 'How results are ordered' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'How results are ordered' }),
    ).toBeVisible();
    await expect(
      page.getByText('Homes that fit everything you asked come first, newest first.'),
    ).toBeVisible();
    await expect(page.getByText(/^Nobody can pay to be higher/)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Gaff never recommends a person' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba12-results-order-${width}`);
    await expectAccessible(page);
  });
}

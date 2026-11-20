import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { aPng } from '../fixtures/photos';
import { needsYouBlock } from './journeys';
import {
  addHomeThroughUi,
  expectAccessible,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  screenshot,
  settled,
  signUpOperator,
  signUpRenter,
} from './support';

/**
 * BA-13: keeping listings fresh (M49), a home's numbers (M92), and what a renter sees change on
 * Saved (M85, M86). The clock is moved in the database: the sweep's own rules are held by the
 * integration tests. Screenshots are screenshots/ba13-<screen>-<width>.png.
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

async function atBothWidths(page: Page, name: string): Promise<void> {
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await settled(page);
    await expectAccessible(page);
    await screenshot(page, `ba13-${name}-${width}`);
  }
  await page.setViewportSize(phone);
}

/** The sweep asked about this home now, as it does after 14 days with no change. */
async function theSweepAsks(lettingId: string, organisationId: string): Promise<void> {
  const askedAt = new Date().toISOString();
  await asSystem('update lettings set freshness_asked_at = $2 where id = $1', [lettingId, askedAt]);
  await asSystem(`select graphile_worker.add_job('send_account_email', $1::json)`, [
    JSON.stringify({ kind: 'still_available', organisationId, lettingId, askedAt }),
  ]);
}

async function stillAvailableEmail(to: string) {
  await expect
    .poll(
      async () =>
        (
          await asSystem<{ subject: string }>(
            'select subject from dev_outbox where to_address = $1',
            [to],
          )
        ).map((row) => row.subject),
      { timeout: 30_000 },
    )
    .toContainEqual(expect.stringMatching(/still available\?$/));
  const [mail] = await asSystem<{ html: string; text: string }>(
    `select html, text from dev_outbox where to_address = $1 and subject like 'Is %still available?'
     order by created_at desc limit 1`,
    [to],
  );
  return mail!;
}

async function emailAsPage(browser: Browser, html: string, name: string): Promise<void> {
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport });
    const mail = await context.newPage();
    await mail.setContent(html);
    await expect(mail.getByRole('link', { name: 'Still available' })).toHaveCount(1);
    await expectAccessible(mail);
    await screenshot(mail, `ba13-${name}-${width}`);
    await context.close();
  }
}

test('M49, M92: a stale home asks its lister on Today, steps back unanswered, and comes back from the email', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const email = await signUpOperator(page, 'Freshwater Lettings');
  await addHomeThroughUi(page, '12 Ranelagh Road');
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  const lettingId = homeIdIn(page.url());
  await goLiveThroughUi(page);
  const [row] = await asSystem<{ ref: string; organisationId: string }>(
    'select public_ref as ref, organisation_id as "organisationId" from lettings where id = $1',
    [lettingId],
  );
  const homePath = `/homes/${row!.ref}`;

  // M92: the home's numbers on its Home view, counts only.
  await page.goto(`/lettings/${lettingId}?view=home`);
  const numbers = page.getByRole('region', { name: 'Renters on Gaff' });
  await expect(numbers.getByRole('term').filter({ hasText: 'Page opened' })).toBeVisible();
  await expect(numbers.getByRole('term').filter({ hasText: 'Asked to view' })).toBeVisible();
  await atBothWidths(page, 'home-numbers');

  // Two weeks with no change: Today asks, in one row that opens the task.
  await theSweepAsks(lettingId, row!.organisationId);
  await page.goto('/today');
  const task = page.getByRole('link', { name: /Say if it’s still available · 12 Ranelagh Road/ });
  await expect(task).toBeVisible();
  await expect(task).toContainText(/Comes off gaff\.ie on \w+day \d+ \w+ unless you do/);
  await atBothWidths(page, 'today-freshness');
  await task.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Is it still available?' }),
  ).toBeVisible();
  await expect(
    page.getByText('It’s been two weeks with no change.', { exact: false }),
  ).toBeVisible();
  await atBothWidths(page, 'still-available');
  await page.getByRole('button', { name: 'Still available' }).click();
  await expect(page).toHaveURL(new RegExp(`/lettings/${lettingId}\\?saved=still-available`));
  await expect(
    page.getByText('It stays on gaff.ie. We’ll ask again in two weeks if nothing changes.'),
  ).toBeVisible();
  await page.goto('/today');
  await expect(page.getByRole('link', { name: /Say if it’s still available/ })).toHaveCount(0);

  // Asked again, unanswered for three days: it steps back, and the letting says why.
  await theSweepAsks(lettingId, row!.organisationId);
  await asSystem('update lettings set stale_at = now() where id = $1', [lettingId]);
  const visitor = await browser.newContext({ viewport: phone, locale: 'en-IE' });
  const renter = await visitor.newPage();
  const gone = await renter.goto(homePath);
  expect(gone?.status()).toBe(404);
  await page.goto(`/lettings/${lettingId}`);
  await expect(needsYouBlock(page)).toContainText(
    'Off gaff.ie until you say it’s still available. Its enquiries are waiting',
  );
  await atBothWidths(page, 'letting-stepped-back');

  // The email's link, with no sign-in: it asks first, then puts the home back.
  const mail = await stillAvailableEmail(email);
  await emailAsPage(browser, mail.html, 'email-still-available');
  const link = /https?:\/\/\S+\/still-available\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{43}/.exec(
    mail.text,
  )![0];
  await renter.goto(new URL(link).pathname);
  await expect(
    renter.getByRole('heading', { level: 1, name: 'Is it still available?' }),
  ).toBeVisible();
  await expect(
    renter.getByText('It came off gaff.ie and search on', { exact: false }),
  ).toBeVisible();
  for (const [width, viewport] of widths) {
    await renter.setViewportSize(viewport);
    await settled(renter);
    await expectAccessible(renter);
    await screenshot(renter, `ba13-email-link-${width}`);
  }
  await renter.setViewportSize(phone);
  await renter.getByRole('button', { name: 'Still available' }).click();
  await expect(renter.getByRole('heading', { level: 1, name: 'Thanks' })).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'ba13-email-link-done-390');
  const back = await renter.goto(homePath);
  expect(back?.status()).toBe(200);
  // Used once, the link has done its job.
  await renter.goto(new URL(link).pathname);
  await expect(
    renter.getByRole('heading', { level: 1, name: 'This link has already been used' }),
  ).toBeVisible();
  await visitor.close();
});

/** A made-up confirmed agency's home, put live in the database in a town no other journey uses. */
async function aHomeGoesLive(rent: number): Promise<string> {
  const userId = randomUUID();
  await asSystem('insert into users (id, name, email) values ($1, $2, $3)', [
    userId,
    'Nuala Test',
    `nuala.${userId.slice(0, 8)}@kilrush.test`,
  ]);
  const [org] = await asSystem<{ id: string }>(
    `insert into organisations (name, kind, confirmed_at, psra_licence_number, inbound_slug)
     values ('Kilrush Lettings', 'agency', now(), '7770013', $1) returning id`,
    [`kilrush-${userId.slice(0, 8)}`],
  );
  const [letting] = await asSystem<{ id: string; public_ref: string }>(
    `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
       available_from, property_type, bedrooms, furnished, parking, criteria, stage, status,
       created_by, lead_user_id, live_at, ber_rating)
     values ($1, '2 Henry Street', 'Kilrush', 'Clare', $2, $3, 'apartment', 2, 'furnished',
       'street', $4, 'enquiries', 'live', $5, $5, now(), 'B2') returning id, public_ref`,
    [
      org!.id,
      rent * 100,
      isoDateInDays(10),
      JSON.stringify({ maxOccupants: 3, noPets: true }),
      userId,
    ],
  );
  const photo = aPng([36, 99, 168]);
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
  return letting!.id;
}

test('M85, M86: Saved shows a saved home’s lower rent, and each search’s choice of emails', async ({
  page,
}) => {
  const lettingId = await aHomeGoesLive(1650);
  await page.setViewportSize(phone);
  await signUpRenter(page);
  await page.goto('/?where=kilrush');
  await page.getByRole('button', { name: 'Save 2-bed apartment · Kilrush, Co. Clare' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Tell me about new ones' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved. We’ll email you when a new home fits.' }),
  ).toBeVisible();

  // The lister lowers the rent.
  await asSystem('update lettings set monthly_rent_cents = 155000 where id = $1', [lettingId]);
  await page.goto('/saved');
  const homes = page.getByRole('list', { name: 'Homes' });
  await expect(homes.getByText('Rent down to €1,550 a month, from €1,650 a month')).toBeVisible();
  await expect(page.getByText('As soon as one is listed')).toBeVisible();
  await atBothWidths(page, 'saved-changes');

  // M86: once a day instead, in one tap.
  await page.getByRole('button', { name: /^Once a day instead/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'You’ll hear once a day, at 8am' }),
  ).toBeVisible();
  await expect(page.getByText('Once a day, at 8am', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^As soon as listed instead/ })).toBeVisible();
});

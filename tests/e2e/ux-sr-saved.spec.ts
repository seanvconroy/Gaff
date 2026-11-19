import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { aPng } from '../fixtures/photos';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  expectAccessible,
  isoDateInDays,
  latestCodeFor,
  screenshot,
  settled,
  signUpRenter,
  uniqueEmail,
} from './support';

/**
 * Work package WP-23: saved homes and alerts (UX-SR-10, UX-MT-13 to UX-MT-16, Saved in the
 * renter's home, Profile's "What you're looking for"). Made-up homes are put live straight into
 * the database, in towns no other journey uses, by a made-up confirmed agency. Screenshots are
 * screenshots/wp23-<screen>-<width>.png.
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

let agency: { id: string; userId: string } | null = null;

/** The made-up agency that lists these journeys' homes. */
async function theAgency(): Promise<{ id: string; userId: string }> {
  if (agency) return agency;
  const [found] = await asSystem<{ id: string; user_id: string }>(
    `select o.id, l.created_by as user_id from organisations o
     left join lettings l on l.organisation_id = o.id
     where o.name = 'Atlantic Lettings' limit 1`,
  );
  if (found?.user_id) return (agency = { id: found.id, userId: found.user_id });
  const userId = randomUUID();
  await asSystem('insert into users (id, name, email) values ($1, $2, $3)', [
    userId,
    'Nuala Test',
    `nuala.${userId.slice(0, 8)}@atlantic.test`,
  ]);
  const [org] = found
    ? [{ id: found.id }]
    : await asSystem<{ id: string }>(
        `insert into organisations (name, kind, confirmed_at, psra_licence_number, inbound_slug)
         values ('Atlantic Lettings', 'agency', now(), '7770002', $1) returning id`,
        [`atlantic-${userId.slice(0, 8)}`],
      );
  return (agency = { id: org!.id, userId });
}

/** A made-up home put live on Gaff now: with a BER and a photo, let by a confirmed agency. */
async function aHomeGoesLive(home: {
  address: string;
  area: string;
  county: string;
  rent: number;
  beds: number;
}): Promise<string> {
  const { id, userId } = await theAgency();
  const [letting] = await asSystem<{ id: string; public_ref: string }>(
    `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
       available_from, property_type, bedrooms, furnished, parking, criteria, stage, status,
       created_by, lead_user_id, live_at, ber_rating)
     values ($1, $2, $3, $4, $5, $6, 'apartment', $7, 'furnished', 'street', $8, 'enquiries',
       'live', $9, $9, now(), 'B2') returning id, public_ref`,
    [
      id,
      home.address,
      home.area,
      home.county,
      home.rent * 100,
      isoDateInDays(10),
      home.beds,
      JSON.stringify({ maxOccupants: 3, noPets: true }),
      userId,
    ],
  );
  const photo = aPng([36, 99, 168]);
  const key = `homes/${id}/${randomUUID()}.png`;
  await asSystem(
    'insert into dev_photo_store (key, content_type, bytes, size) values ($1, $2, $3, $4)',
    [key, 'image/png', photo, photo.length],
  );
  await asSystem(
    `insert into letting_photos (organisation_id, letting_id, position, storage_key,
       content_type, bytes, created_by)
     values ($1, $2, 0, $3, 'image/png', $4, $5)`,
    [id, letting!.id, key, photo.length, userId],
  );
  return letting!.public_ref;
}

/** Runs the alert job, as the morning's schedule does, and waits until it has run. */
async function runTheAlertJob(): Promise<void> {
  await asSystem(
    "select graphile_worker.add_job('saved_search_alerts', '{}'::json, job_key => 'saved_search_alerts')",
  );
  await expect(async () => {
    const [left] = await asSystem<{ n: number }>(
      `select count(*)::int as n from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
       where t.identifier in ('saved_search_alerts', 'send_saved_search_email')`,
    );
    expect(left!.n).toBe(0);
  }).toPass({ timeout: 30_000 });
}

async function mailTo(address: string) {
  return asSystem<{ subject: string; text: string; html: string }>(
    'select subject, text, html from dev_outbox where to_address = $1 order by created_at',
    [address],
  );
}

async function emailAsPage(browser: Browser, html: string, name: string): Promise<void> {
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport });
    const mail = await context.newPage();
    await mail.setContent(html);
    await expectAccessible(mail);
    await screenshot(mail, `wp23-${name}-${width}`);
    await context.close();
  }
}

async function atBothWidths(page: Page, name: string): Promise<void> {
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await settled(page);
    await expectAccessible(page);
    await screenshot(page, `wp23-${name}-${width}`);
  }
  await page.setViewportSize(phone);
}

test('WP-23: a renter saves a home with the heart and sees it in Saved', async ({ page }) => {
  await aHomeGoesLive({
    address: '7 Market Street',
    area: 'Clifden',
    county: 'Galway',
    rent: 1600,
    beds: 2,
  });
  await page.setViewportSize(phone);
  await signUpRenter(page);
  await page.goto('/?where=clifden');
  const heart = page.getByRole('button', { name: 'Save 2-bed apartment · Clifden, Co. Galway' });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Saved', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
  const homes = page.getByRole('list', { name: 'Homes' });
  await expect(homes.getByRole('link', { name: '€1,600 a month' })).toHaveAttribute(
    'href',
    /^\/homes\/[0-9a-f]{12}$/,
  );
  await atBothWidths(page, 'saved');

  // Taken off with the heart, it goes from Saved.
  await homes.getByRole('button', { name: 'Save 2-bed apartment · Clifden, Co. Galway' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Removed from Saved' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Homes you save appear here. Tap the heart on any home.' }),
  ).toBeVisible();
});

test('WP-23: signed out, the heart on a home’s page asks for a sign-in, then saves it', async ({
  browser,
}) => {
  const ref = await aHomeGoesLive({
    address: '9 Market Street',
    area: 'Clifden',
    county: 'Galway',
    rent: 1650,
    beds: 1,
  });
  const context = await browser.newContext({ viewport: phone, locale: 'en-IE' });
  const page = await context.newPage();
  await page.goto(`/homes/${ref}`);
  await page.getByRole('button', { name: 'Save this home' }).click();
  await expect(page.getByRole('heading', { name: /Sign in/ }).first()).toBeVisible();
  const email = uniqueEmail('aoife');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  // Back on the home's page, with it saved.
  await expect(page).toHaveURL(new RegExp(`/homes/${ref}$`));
  await expect(page.getByRole('button', { name: 'Save this home' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await atBothWidths(page, 'home-saved');
  await page.goto('/saved');
  await expect(page.getByRole('list', { name: 'Homes' }).getByRole('listitem')).toHaveCount(1);
  await context.close();
});

test('UX-SR-10, UX-MT-13, UX-MT-16: a search saved with just an email; a matching home goes live; the alert arrives once; "Stop these" stops them', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: phone, locale: 'en-IE' });
  const page = await context.newPage();
  // Nothing in Westport yet: the empty state.
  await page.goto('/?where=westport&beds=2&max=1800');
  await expect(page.getByRole('heading', { name: 'No homes match yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tell me when one comes up' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tell me when one comes up' });
  // An email address, and nothing more.
  await expect(sheet.getByRole('textbox')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Save this search' }).click();
  await expect(sheet.getByText('Enter your email address, like name@example.ie.')).toBeVisible();
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await expectAccessible(page);
    await screenshot(page, `wp23-email-sheet-${width}`);
  }
  await page.setViewportSize(phone);
  const email = uniqueEmail('ciara');
  await sheet.getByLabel('Your email').fill(email);
  await sheet.getByRole('button', { name: 'Save this search' }).click();
  const check = page.getByRole('dialog', { name: 'Check your email' });
  await expect(check.getByText(`We’ve sent a link to ${email}.`, { exact: false })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'wp23-check-email-390');
  await check.getByRole('button', { name: 'Done' }).click();

  // UX-MT-13: what is kept is the chips' values, and an address: no sentence, no account.
  const [kept] = await asSystem<{ filters: unknown; user_id: string | null; confirmed: boolean }>(
    'select filters, user_id, confirmed_at is not null as confirmed from saved_searches where email = $1',
    [email],
  );
  expect(kept).toEqual({
    filters: { where: 'westport', beds: 2, maxRent: 1800 },
    user_id: null,
    confirmed: false,
  });

  // One email, and its link confirms the search.
  await expect(async () => expect(await mailTo(email)).toHaveLength(1)).toPass({
    timeout: 30_000,
  });
  const [confirm] = await mailTo(email);
  expect(confirm!.subject).toBe('Confirm your search on Gaff');
  await emailAsPage(browser, confirm!.html, 'email-confirm');
  const confirmUrl = /https?:\/\/\S+\/alerts\/[A-Za-z0-9_-]{43}(?=\s)/.exec(confirm!.text)![0];
  await page.goto(new URL(confirmUrl).pathname);
  await expect(
    page.getByRole('heading', { level: 1, name: 'You’ll hear when one comes up' }),
  ).toBeVisible();
  await expect(
    page.getByText('Westport, Co. Mayo · 2 bedrooms · Up to €1,800 a month'),
  ).toBeVisible();
  await atBothWidths(page, 'confirmed');

  // A home that fits goes live, and one that is only close. The job runs twice: one email.
  const ref = await aHomeGoesLive({
    address: '14 James Street',
    area: 'Westport',
    county: 'Mayo',
    rent: 1700,
    beds: 2,
  });
  await aHomeGoesLive({
    address: '16 James Street',
    area: 'Westport',
    county: 'Mayo',
    rent: 2100,
    beds: 2,
  });
  await runTheAlertJob();
  await runTheAlertJob();
  const alerts = (await mailTo(email)).filter((mail) => mail.subject !== confirm!.subject);
  expect(alerts.map((mail) => mail.subject)).toEqual([
    'A new home fits your search: 14 James Street, Westport, Co. Mayo',
  ]);
  const alert = alerts[0]!;
  expect(alert.text).toContain(`/homes/${ref}`);
  expect(alert.text).not.toContain('16 James Street');
  expect(alert.text).toMatch(/Stop these: \S+\/alerts\/[A-Za-z0-9_-]{43}\/stop/);
  await emailAsPage(browser, alert.html, 'email-alert');

  // The alert's home opens on Gaff.
  await page.goto(`/homes/${ref}`);
  await expect(page.getByRole('heading', { level: 1, name: /14 James Street/ })).toBeVisible();

  // "Stop these": one tap, no sign-in. The search held by an email alone is deleted at once.
  const stopUrl = /https?:\/\/\S+\/alerts\/[A-Za-z0-9_-]{43}\/stop/.exec(alert.text)![0];
  await page.goto(new URL(stopUrl).pathname);
  await expect(
    page.getByRole('heading', { level: 1, name: 'These emails have stopped' }),
  ).toBeVisible();
  await atBothWidths(page, 'stopped');
  expect(await asSystem('select 1 from saved_searches where email = $1', [email])).toHaveLength(0);
  await context.close();
});

test('UX-SR-10: a renter saves a search, sees it on Profile and Saved, switches emails off and removes it', async ({
  page,
}) => {
  await aHomeGoesLive({
    address: '3 Strand Street',
    area: 'Dingle',
    county: 'Kerry',
    rent: 1500,
    beds: 1,
  });
  await page.setViewportSize(phone);
  await signUpRenter(page);
  // Homes fit: "Tell me about new ones" saves the search for the homes still to come. The
  // address uses the first place list's ID for Dingle: it still opens Dingle (M56).
  await page.goto('/?where=dingle&beds=1');
  await page.getByRole('button', { name: 'Tell me about new ones' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved. We’ll email you when a new home fits.' }),
  ).toBeVisible();
  await expect(page.getByText('You’ll hear when one comes up')).toBeVisible();

  await page.goto('/saved');
  await expect(page.getByRole('link', { name: 'Dingle, Co. Kerry · 1 bedroom' })).toBeVisible();

  await page.goto('/profile');
  const looking = page.getByRole('region', { name: 'What you’re looking for' });
  const search = looking.getByRole('link', { name: 'Dingle, Co. Kerry · 1 bedroom' });
  await expect(search).toHaveAttribute('href', '/?where=dingle-daingean-ui-chuis&beds=1');
  await atBothWidths(page, 'profile-looking');

  await looking.getByRole('checkbox', { name: 'Email me when a new home fits' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Emails about new homes are off' }),
  ).toBeVisible();

  await looking.getByRole('button', { name: 'Remove Dingle, Co. Kerry · 1 bedroom' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Search removed' })).toBeVisible();
  await expect(looking.getByText('Nothing yet.', { exact: false })).toBeVisible();
});

import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { E2E_DATABASE_URL } from '../../playwright.config';

/** WCAG 2.2 AA (PRD non-functional requirements; design system). */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
}

/** WCAG 1.4.10 reflow: nothing makes the page scroll sideways at this width. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
}

/** Saves a full-page screenshot to screenshots/ for review. */
export async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/**
 * The sending address of the organisation the current test signed up. Tests send to the same
 * made-up renters, so mail lookups only look at this organisation's mail: never an earlier
 * test's, which may still be newer when a job hasn't sent this test's yet.
 */
let currentSender: string | null = null;
const fromCurrentSender = "($3::text is null or from_address like '%<' || $3 || '@%')";

/** The newest link in mail the development outbox "sent" to this address. */
export async function latestLinkFor(email: string): Promise<string> {
  const rows = await query<{ text: string }>(
    'select text from dev_outbox where to_address = $1 order by created_at desc limit 1',
    [email],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No link has been sent to ${email}`);
  return link;
}

/** M76: the 6-digit code last emailed to this address (from the development outbox). */
export async function latestCodeFor(email: string): Promise<string> {
  const rows = await query<{ subject: string }>(
    'select subject from dev_outbox where to_address = $1 order by created_at desc limit 1',
    [email],
  );
  const code = rows[0]?.subject.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code has been sent to ${email}`);
  return code;
}

/** Signs in through the real email-link flow. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(await latestLinkFor(email));
}

/** M1: one account for renting and letting; a new account says which it's for first. */
export async function chooseLetting(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('link', { name: 'Set up a letting workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
}

let counter = 0;
export function uniqueEmail(prefix = 'ann'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@halcyon.test`;
}

/** Signs up a new operator and sets up their workspace; returns their email. */
export async function signUpOperator(
  page: Page,
  organisation = 'Halcyon Lettings',
): Promise<string> {
  const email = uniqueEmail();
  await signIn(page, email);
  await chooseLetting(page);
  await page.getByLabel('Your name').fill('Ann Power');
  await page.getByLabel('Other people: we are a letting agency').check();
  await page.getByLabel('Name of your agency or business').fill(organisation);
  await page.getByLabel('PSRA licence number').fill('001234');
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your lettings' })).toBeVisible();
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<{ slug: string }>(
      `select o.inbound_slug as slug from organisations o
       join memberships m on m.organisation_id = o.id join users u on u.id = m.user_id
       where u.email = $1`,
      [email],
    );
    await client.query('commit');
    currentSender = rows[0]?.slug ?? null;
  } finally {
    await client.end();
  }
  return email;
}

/** A date this many days from now, as YYYY-MM-DD. */
export function inDays(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** The letting's available date, which becomes the tenancy's start date. */
export const AVAILABLE_IN_DAYS = 30;

/** Creates a letting with one evening of viewing slots, through the real screens. */
export async function createLettingThroughUi(
  page: Page,
  address = '12 Ranelagh Road',
  daftUrl = '',
  area = 'Ranelagh, Dublin 6',
): Promise<void> {
  await page.goto('/lettings/new');
  await page.getByLabel('Address', { exact: true }).fill(address);
  await page.getByLabel('Area').fill(area);
  await page.getByLabel('Rent a month').fill('1850');
  await page.getByLabel('Available from').fill(inDays(AVAILABLE_IN_DAYS));
  await page.getByLabel('Type of home').selectOption('apartment');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Furnishing').selectOption('furnished');
  await page.getByLabel('BER rating').selectOption('C1');
  if (daftUrl) await page.getByLabel('Daft advert').fill(daftUrl);
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();
  await expect(page.getByText(`${address} is saved`)).toBeVisible();
  await page.getByLabel('Date').fill(inDays(7));
  await page.getByLabel('From').fill('18:00');
  await page.getByLabel('Until').fill('19:00');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByText('Viewing time added')).toBeVisible();
}

/** From a letting's overview: sets criteria, checks the rent and starts taking enquiries. */
export async function goLiveThroughUi(page: Page): Promise<void> {
  const overview = page
    .url()
    .replace(/\/(viewings|criteria|rent-check|comparables).*$/, '')
    .replace(/\?.*$/, '');
  await page.goto(`${overview}/criteria`);
  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByLabel('No pets').check();
  await page.getByRole('button', { name: 'Save criteria' }).click();
  await page.getByRole('link', { name: 'Check the rent' }).click();
  await page.getByLabel('No, this is its first letting').check();
  await page.getByRole('button', { name: 'Check the rent' }).click();
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
}

/** The signed-in operator's Gaff address, from the settings page. */
export async function gaffAddress(page: Page): Promise<string> {
  await page.goto('/settings');
  return (await page.locator('code').first().innerText()).trim();
}

/** Sends an email to a Gaff address through the development inbox (as Mailgun would). */
export async function sendTestEmail(
  page: Page,
  email: { to: string; from: string; replyTo?: string; subject: string; text: string },
): Promise<void> {
  await page.goto('/dev/inbound');
  await page.getByLabel('To (a Gaff address)').fill(email.to);
  await page.getByLabel('From', { exact: true }).fill(email.from);
  await page.getByLabel('Reply-To').fill(email.replyTo ?? '');
  await page.getByLabel('Subject').fill(email.subject);
  await page.getByLabel('Body').fill(email.text);
  await page.getByRole('button', { name: 'Send to Gaff' }).click();
  await expect(page.getByText('Result: stored')).toBeVisible();
}

/** The first link in the newest development-outbox email to an address with a subject. */
export async function linkInEmail(to: string, subject: string): Promise<string> {
  const rows = await query<{ text: string }>(
    `select text from dev_outbox where to_address = $1 and subject = $2 and ${fromCurrentSender}
     order by created_at desc limit 1`,
    [to, subject, currentSender],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No email "${subject}" has been sent to ${to}`);
  return link;
}

/** Subjects of every development-outbox email to an address, newest first. */
export async function subjectsSentTo(to: string): Promise<string[]> {
  const rows = await query<{ subject: string }>(
    `select subject from dev_outbox where to_address = $1 and ($2::text is null or from_address like '%<' || $2 || '@%')
     order by created_at desc`,
    [to, currentSender],
  );
  return rows.map((row) => row.subject);
}

/** The first link in the newest development-outbox email whose subject starts with this. */
export async function linkInEmailStarting(to: string, subjectStart: string): Promise<string> {
  const rows = await query<{ text: string }>(
    `select text from dev_outbox where to_address = $1 and subject like $2 || '%' and ${fromCurrentSender}
     order by created_at desc limit 1`,
    [to, subjectStart, currentSender],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No email "${subjectStart}…" has been sent to ${to}`);
  return link;
}

/**
 * Test-only time travel: moves every viewing slot of the letting at this address so the first
 * started five minutes ago. The web app has no way to do this, on purpose.
 */
export async function startViewingsNow(addressLine1: string, operatorEmail: string): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    await client.query(
      `with letting as (
         select l.id from lettings l
         join memberships m on m.organisation_id = l.organisation_id
         join users u on u.id = m.user_id
         where l.address_line1 = $1 and u.email = $2
       ), first_slot as (
         select min(starts_at) as starts_at from viewing_slots where letting_id in (select id from letting)
       )
       update viewing_slots
         set starts_at = now() - interval '5 minutes' + (viewing_slots.starts_at - first_slot.starts_at),
             ends_at = now() + interval '10 minutes' + (viewing_slots.starts_at - first_slot.starts_at)
         from first_slot
         where letting_id in (select id from letting)`,
      [addressLine1, operatorEmail],
    );
    await client.query('commit');
  } finally {
    await client.end();
  }
}

/** M3: the newest SMS code texted to a number (the fake SMS sender uses the outbox). */
export async function latestSmsCode(phone: string): Promise<string> {
  const rows = await query<{ text: string }>(
    `select text from dev_outbox where to_address = $1 and subject = 'SMS'
     order by created_at desc limit 1`,
    [phone],
  );
  const code = rows[0]?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code has been texted to ${phone}`);
  return code;
}

/** Makes an existing account a Gaff staff member. The app has no way to do this, on purpose. */
export async function makeStaff(email: string): Promise<void> {
  await query(
    `insert into staff_members (user_id, role) select id, 'reviewer' from users where email = $1
     on conflict do nothing`,
    [email],
  );
}

/** Signs up a private landlord letting their own homes; returns their email. */
export async function signUpLandlord(page: Page, name = 'Mary Walsh'): Promise<string> {
  const email = uniqueEmail('mary');
  await signIn(page, email);
  await chooseLetting(page);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Ourselves: we are landlords letting our own homes').check();
  await page.getByLabel('Name of your agency or business').fill(name);
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your lettings' })).toBeVisible();
  return email;
}

/** Synthetic photos: a coarse random grid each, so no two look copied (M29). */
export async function photoFiles(count: number): Promise<string[]> {
  mkdirSync('test-results/photos', { recursive: true });
  const files: string[] = [];
  for (let n = 0; n < count; n++) {
    const grid = Buffer.alloc(12 * 9 * 3);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.floor(Math.random() * 256);
    const path = `test-results/photos/home-${Date.now()}-${n}.jpg`;
    await sharp(grid, { raw: { width: 12, height: 9, channels: 3 } })
      .resize(1200, 900, { kernel: 'nearest' })
      .jpeg()
      .toFile(path);
    files.push(path);
  }
  return files;
}

/** M3, M22, M24: confirms the landlord's mobile and identity through the real screens. */
export async function getChecked(page: Page): Promise<void> {
  await page.goto('/settings/checks');
  const mobile = `087${String(Date.now()).slice(-7)}`;
  await page.getByLabel('Your mobile number').fill(mobile);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByText(/We’ve texted a 6-digit code/)).toBeVisible();
  await page
    .getByLabel('The code from the text')
    .fill(await latestSmsCode(`+353${mobile.slice(1)}`));
  await page.getByRole('button', { name: 'Confirm my number' }).click();
  await page.getByRole('button', { name: 'Check my identity' }).click();
  await page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(page.getByText('You’re checked')).toBeVisible();
}

/** Fills in everything a listing needs, through the listing editor. */
export async function completeListing(page: Page, description: string): Promise<void> {
  await page.getByRole('link', { name: 'Listing', exact: true }).click();
  await expect(page.getByText('Draft: renters can’t see it yet')).toBeVisible();
  await page.getByLabel('Only the street and area').check();
  await page.getByLabel('Heating').selectOption('gas');
  await page.getByLabel('Outdoor space').selectOption('balcony');
  await page.getByLabel('Floor area in square metres').fill('68');
  await page.getByRole('button', { name: 'Save the home’s details' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();

  await page.getByLabel('Deposit').fill('1850');
  await page.getByRole('button', { name: 'Save the price and enquiries' }).click();

  await page.getByLabel('Describe the home').fill(description);
  await page.getByRole('button', { name: 'Save the description' }).click();

  await page.getByLabel('Add photos').setInputFiles(await photoFiles(3));
  await expect(page.getByText(/3 added/)).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('img', { name: 'Photo of the home' })).toHaveCount(3);
  }).toPass({ timeout: 30_000 });
}

import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
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

/** Signs in through the real email-link flow. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(await latestLinkFor(email));
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
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel('Your name').fill('Ann Power');
  await page.getByLabel('Other people: we are a letting agency').check();
  await page.getByLabel('Name of your agency or business').fill(organisation);
  await page.getByLabel('PSRA licence number').fill('001234');
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your lettings' })).toBeVisible();
  return email;
}

/** Creates a letting with one evening of viewing slots, through the real screens. */
export async function createLettingThroughUi(
  page: Page,
  address = '12 Ranelagh Road',
): Promise<void> {
  const inDays = (days: number) => {
    const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  };
  await page.goto('/lettings/new');
  await page.getByLabel('Address', { exact: true }).fill(address);
  await page.getByLabel('Area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('Rent a month').fill('1850');
  await page.getByLabel('Available from').fill(inDays(30));
  await page.getByLabel('Type of home').selectOption('apartment');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Furnishing').selectOption('furnished');
  await page.getByLabel('BER rating').selectOption('C1');
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();
  await expect(page.getByText(`${address} is saved`)).toBeVisible();
  await page.getByLabel('Date').fill(inDays(7));
  await page.getByLabel('From').fill('18:00');
  await page.getByLabel('Until').fill('19:00');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByText('Viewing time added')).toBeVisible();
}

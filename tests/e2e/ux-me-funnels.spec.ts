import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, E2E_STAFF_EMAIL } from '../../playwright.config';
import {
  expectAccessible,
  expectNoSidewaysScroll,
  screenshot,
  signIn,
  signOut,
  signUpOperator,
} from './support';

/** How many subjects have reached a funnel step, read as the system (as the internal page does). */
async function reachedInDatabase(step: string): Promise<number> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from funnel_events where step = $1',
      [step],
    );
    await client.query('commit');
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

/** The "Reached" number for a step, in a funnel's table on the internal page. */
async function reachedOnPage(page: Page, funnel: string, step: string): Promise<number> {
  const row = page
    .getByRole('region', { name: `${funnel}: steps` })
    .locator('tbody tr')
    .filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${step}$`) }) });
  await expect(row).toHaveCount(1);
  const text = (await row.locator('td').nth(1).innerText()).trim();
  expect(text, `${funnel}, ${step}`).toMatch(/^\d+$/);
  return Number(text);
}

test('UX-ME-1: opening the sign-in screen is counted once, not again on a refresh', async ({
  page,
}) => {
  const before = await reachedInDatabase('sign_in.screen_opened');
  await page.goto('/sign-in');
  await expect.poll(() => reachedInDatabase('sign_in.screen_opened')).toBe(before + 1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(await reachedInDatabase('sign_in.screen_opened')).toBe(before + 1);
});

test('UX-ME-2: Gaff’s own team sees every funnel on the internal page, and nobody else can open it', async ({
  page,
}) => {
  test.slow();
  // Signed out: there's no such page.
  let response = await page.goto('/internal/funnels');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Funnels' })).toHaveCount(0);

  // A signed-in operator, an admin of their own agency, who isn't staff: no such page either.
  await signUpOperator(page);
  response = await page.goto('/internal/funnels');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Funnels' })).toHaveCount(0);
  await page.goto('/today');
  await signOut(page);

  // One of Gaff's team (STAFF_EMAILS) signs in the usual way and opens it.
  await signIn(page, E2E_STAFF_EMAIL);
  await expect(page).toHaveURL(/\/welcome$/);

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    response = await page.goto('/internal/funnels');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Funnels', level: 1 })).toBeVisible();

    // Every funnel is listed, built or not.
    for (const funnel of ['Sign-in', 'First run', 'Adding a letting', 'Search', 'Owner']) {
      await expect(
        page.getByRole('heading', { name: funnel, exact: true, level: 2 }),
      ).toBeVisible();
    }

    // The flows used in this journey show numbers: two people signed in, and one set up.
    expect(await reachedOnPage(page, 'Sign-in', 'Screen opened')).toBeGreaterThanOrEqual(2);
    expect(await reachedOnPage(page, 'Sign-in', 'Method chosen')).toBeGreaterThanOrEqual(2);
    expect(await reachedOnPage(page, 'Sign-in', 'Signed in')).toBeGreaterThanOrEqual(2);
    expect(await reachedOnPage(page, 'First run', 'Signed in')).toBeGreaterThanOrEqual(2);
    expect(await reachedOnPage(page, 'First run', 'Set-up finished')).toBeGreaterThanOrEqual(1);
    await expect(
      page.getByRole('region', { name: 'Sign-in: by method' }).getByText('Email code'),
    ).toBeVisible();

    // A flow that isn't built yet has its steps, and dashes for numbers.
    const search = page.getByRole('region', { name: 'Search: steps' });
    await expect(search.getByRole('cell', { name: 'Search made', exact: true })).toBeVisible();
    await expect(search.getByText('Nothing yet').first()).toBeAttached();

    // Totals only: no operator, organisation or renter is named.
    const main = page.getByRole('main');
    for (const name of ['Ann Power', 'Halcyon', '@']) {
      await expect(main.getByText(name)).toHaveCount(0);
    }

    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `internal-funnels-${width}`);
  }
});

import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, E2E_STAFF_EMAIL } from '../../playwright.config';
import { aDetailedPng } from '../fixtures/photos';
import { needsYouBlock } from './journeys';
import {
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  homeIdIn,
  screenshot,
  signIn,
  signUpOperator,
  toGoLiveThroughUi,
  watchTheTestEnquiry,
} from './support';

/**
 * BA-10 (the live line's M29, M48, M97, M98): every home is checked as it goes public on gaff.ie.
 * A lister goes live with a photo another lister already uses: the home is live, but not on
 * gaff.ie, and they're told a person will look and by when. A person on Gaff's team sees the
 * signal on the internal page, with the home's public content and nothing about any renter, and
 * releases it. Then it's public.
 */

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
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

async function homePathOf(lettingId: string): Promise<string> {
  const [row] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  return `/homes/${row!.ref}`;
}

/** A home added through the real screens, with this photo, up to its go-live step. */
async function aHomeWithPhoto(page: Page, address: string, photo: Buffer): Promise<string> {
  await addHomeThroughUi(page, address);
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: photo }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  return homeIdIn(page.url());
}

async function signedOut(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  return { context, page: await context.newPage() };
}

test('M29, M48, M97, M98: a home with a photo another lister uses waits for a person, who releases it', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const stamp = String(Date.now()).slice(-5);
  // A picture with detail, made for this run alone, so only these two homes share it.
  const photo = aDetailedPng(Number(stamp));

  // The first lister's home, with the photo, goes on gaff.ie as usual.
  const firstContext = await browser.newContext({ locale: 'en-IE' });
  const firstPage = await firstContext.newPage();
  await signUpOperator(firstPage, `Corrib Homes ${stamp}`);
  const firstId = await aHomeWithPhoto(firstPage, `3 Sallow Court ${stamp}`, photo);
  await goLiveThroughUi(firstPage);
  const firstHome = await homePathOf(firstId);
  await firstContext.close();

  // A second lister goes live with the same photo.
  await signUpOperator(page, `Halcyon Lettings ${stamp}`);
  const address = `9 Alder Row ${stamp}`;
  const title = `${address}, Ranelagh, Dublin 6`;
  const lettingId = await aHomeWithPhoto(page, address, photo);
  await toGoLiveThroughUi(page);
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  // The person's decision stands: the home is live, taking enquiries from Daft and MyHome.
  await expect(page.getByRole('heading', { name: / is live$/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(/\/lettings\/[0-9a-f-]+(\/test-enquiry\?live=1|\?saved=live)$/);
  if (page.url().includes('/test-enquiry')) await watchTheTestEnquiry(page);
  await expect(
    page.getByText(
      'It’s live. Before it goes on gaff.ie, a person on Gaff’s team is checking it. Gaff answers its enquiries once they have.',
    ),
  ).toBeVisible();

  // The lister sees it is being looked at, and by when: nothing is asked of them.
  const homePath = await homePathOf(lettingId);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(`/lettings/${lettingId}`);
    await expect(needsYouBlock(page)).toContainText(
      /Gaff checks every home before it goes on gaff\.ie, and a person on Gaff’s team is looking at this one\. They’ll email you by \w+day \d+ \w+, /,
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba10-letting-checking-${width}`);
    await page.goto(`/lettings/${lettingId}?view=home`);
    await expect(
      page.getByText('Not shown on gaff.ie yet: a person on Gaff’s team is checking it.'),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ba10-home-checking-${width}`);
  }
  // Not public: no page, not in search.
  {
    const { context, page: visitor } = await signedOut(browser, phone);
    const response = await visitor.goto(homePath);
    expect(response?.status()).toBe(404);
    await visitor.goto('/?where=Ranelagh');
    await expect(visitor.locator(`a[href="${homePath}"]`)).toHaveCount(0);
    await expect(visitor.locator(`a[href="${firstHome}"]`)).toHaveCount(1);
    await context.close();
  }
  // Told at once, in fixed words.
  const [email] = await asSystem<{ text: string }>(
    `select text from dev_outbox where subject = $1 order by created_at desc limit 1`,
    [`${address} is waiting for a check before it goes on gaff.ie`],
  );
  expect(email?.text).toContain('A person on Gaff’s team will look at it by ');

  // A person on Gaff's team sees the hold: the signal as words, the public content, no renter.
  const staffContext = await browser.newContext({ locale: 'en-IE' });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);
  for (const [width, viewport] of widths) {
    await staffPage.setViewportSize(viewport);
    await staffPage.goto('/internal');
    const card = staffPage
      .getByRole('region', { name: title })
      .filter({ has: staffPage.getByText(/Decide by /) });
    await expect(card.getByText('Held by Gaff’s checks', { exact: true })).toBeVisible();
    await expect(card.getByText('A photo matches one on a different lister’s home')).toBeVisible();
    await expect(
      card.getByRole('list', { name: `Photos of ${title}` }).getByRole('img'),
    ).toHaveCount(1);
    await expect(
      card.getByRole('button', { name: `Release it to gaff.ie ${title}` }),
    ).toBeVisible();
    await expectNoSidewaysScroll(staffPage);
    await expectAccessible(staffPage);
    await screenshot(staffPage, `ba10-internal-hold-${width}`);
  }
  const card = staffPage
    .getByRole('region', { name: title })
    .filter({ has: staffPage.getByText(/Decide by /) });
  await card.getByRole('button', { name: `Release it to gaff.ie ${title}` }).click();
  await expect(staffPage.getByText(/^Released\. It’s on gaff\.ie/)).toBeVisible();
  await staffContext.close();

  // Now it's public, with its page and its place in search.
  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    const response = await visitor.goto(homePath);
    expect(response?.status()).toBe(200);
    await expect(visitor.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, `ba10-home-released-${width}`);
    await visitor.goto('/?where=Ranelagh');
    await expect(visitor.locator(`a[href="${homePath}"]`).first()).toBeVisible();
    await context.close();
  }
  await page.goto(`/lettings/${lettingId}`);
  await expect(needsYouBlock(page)).not.toContainText('a person on Gaff’s team is looking');
});

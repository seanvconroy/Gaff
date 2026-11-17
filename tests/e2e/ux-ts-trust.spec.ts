import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, E2E_STAFF_EMAIL } from '../../playwright.config';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import { needsYouBlock } from './journeys';
import {
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  screenshot,
  sendTestEmail,
  settled,
  signIn,
  signUpOperator,
} from './support';

/** Work package WP-26: trust and Gaff's internal page (UX-TS-3 to UX-TS-6, UX-AG-4). */

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

/** A live home with a photo, put live through the real screens. */
async function aLiveHomeOnGaff(page: Page, address: string) {
  await addHomeThroughUi(page, address);
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  const lettingId = homeIdIn(page.url());
  await goLiveThroughUi(page);
  const [row] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  return { lettingId, homePath: `/homes/${row!.ref}`, lettingPath: `/lettings/${lettingId}` };
}

async function signedOut(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  return { context, page: await context.newPage() };
}

/** Whether search lists this home: a card linking to its page. */
async function inSearch(page: Page, homePath: string): Promise<number> {
  await page.goto('/?where=Ranelagh');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return page.locator(`a[href="${homePath}"]`).count();
}

/** The development outbox's newest email to this address with this subject, as a page. */
async function emailAsPage(browser: Browser, to: string, subject: string, name: string) {
  await expect
    .poll(async () =>
      (
        await asSystem<{ subject: string }>(
          'select subject from dev_outbox where to_address = $1',
          [to],
        )
      ).map((row) => row.subject),
    )
    .toContain(subject);
  const [mail] = await asSystem<{ html: string; text: string }>(
    'select html, text from dev_outbox where to_address = $1 and subject = $2 order by created_at desc limit 1',
    [to, subject],
  );
  const context = await browser.newContext({ locale: 'en-IE' });
  const letter = await context.newPage();
  await letter.setContent(mail!.html);
  await expect(letter.getByRole('link', { name: 'Open the letting' })).toHaveCount(1);
  await expect(letter.getByRole('img', { name: 'Gaff' })).toBeVisible();
  await expectAccessible(letter);
  await letter.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  await context.close();
  return mail!.text;
}

test('UX-TS-3 to UX-TS-5: a visitor reports a listing, Gaff’s team hides it, its enquiries wait, the lister is told and asks again, and it comes back', async ({
  browser,
  page,
}) => {
  test.slow();
  // An address no other journey uses, so its card is the only one by that name.
  const address = '5 Willow Terrace';
  const operatorEmail = await signUpOperator(
    page,
    `Halcyon Lettings ${String(Date.now()).slice(-5)}`,
  );
  const home = await aLiveHomeOnGaff(page, address);
  const title = `${address}, Ranelagh, Dublin 6`;

  // UX-TS-3: a visitor with no account reports it, at each width.
  const reasons = { '390': 'The details are wrong', '1280': 'It looks like a scam' } as const;
  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    expect(await inSearch(visitor, home.homePath)).toBe(1);
    await visitor.goto(home.homePath);
    await visitor.getByRole('link', { name: 'Report this listing' }).click();
    await visitor.getByRole('radio', { name: reasons[width] }).check();
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'Thanks for telling us' }),
    ).toBeVisible();
    await context.close();
  }
  const reports = await asSystem<{ reason: string; note: string | null }>(
    `select r.reason, r.note from listing_reports r where r.letting_id = $1 order by received_at`,
    [home.lettingId],
  );
  expect(reports).toEqual([
    { reason: 'wrong_details', note: null },
    { reason: 'scam', note: null },
  ]);

  // UX-TS-5: it is on Gaff's internal page, for Gaff's own team.
  const staffContext = await browser.newContext({ locale: 'en-IE' });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);
  for (const [width, viewport] of widths) {
    await staffPage.setViewportSize(viewport);
    const response = await staffPage.goto('/internal');
    expect(response?.status()).toBe(200);
    await expect(staffPage.getByRole('heading', { level: 1, name: 'Gaff internal' })).toBeVisible();
    // The three lists, and nothing more.
    await expect(staffPage.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Agencies waiting to be confirmed',
      'Reported listings',
      'Funnels',
    ]);
    const reported = staffPage.getByRole('region', { name: title }).first();
    await expect(reported.getByText('2 reports')).toBeVisible();
    await expect(reported.getByText('The details are wrong', { exact: true })).toBeVisible();
    await expect(reported.getByText(/Answer by /)).toBeVisible();
    await expect(staffPage.getByRole('region', { name: 'Funnels' })).toBeVisible();
    await expectNoSidewaysScroll(staffPage);
    await expectAccessible(staffPage);
    await screenshot(staffPage, `ux-ts-internal-reported-${width}`);
  }
  // Nothing about any renter or message is on it.
  expect(await staffPage.locator('body').innerText()).not.toMatch(/Aoife|@example\.ie/);

  // UX-TS-4: staff hide it, for the reason most reports gave.
  const card = staffPage
    .getByRole('region', { name: title })
    .filter({ has: staffPage.getByText('2 reports') });
  await card.getByLabel('Why it’s hidden').selectOption('wrong_details');
  await card.getByRole('button', { name: `Hide this listing ${title}` }).click();
  await expect(staffPage.getByText(/^Hidden\. It’s out of search/)).toBeVisible();
  await expect(staffPage).toHaveTitle(/Gaff internal/);
  await expectAccessible(staffPage);
  await screenshot(staffPage, 'ux-ts-internal-hidden-1280');

  // It's gone from search and its page says it isn't available, at once.
  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    const response = await visitor.goto(home.homePath);
    expect(response?.status()).toBe(404);
    await expect(visitor.getByRole('heading', { name: 'This home isn’t on Gaff' })).toBeVisible();
    await expect(visitor.getByText(address)).toHaveCount(0);
    expect(await inSearch(visitor, home.homePath)).toBe(0);
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ts-hidden-home-page-${width}`);
    await context.close();
  }

  // A new enquiry to it waits: it is placed, and nobody is answered while it's hidden.
  await sendTestEmail(page, {
    to: await gaffAddress(page),
    from: daftEnquiry.from,
    replyTo: daftEnquiry.replyTo,
    subject: daftEnquiry.subject.replace('12 Ranelagh Road', address),
    text: daftEnquiry.text.replace(/12 Ranelagh Road/g, address),
  });
  await expect
    .poll(
      async () =>
        (
          await asSystem<{ n: number }>(
            'select count(*)::int as n from applications where letting_id = $1',
            [home.lettingId],
          )
        )[0]!.n,
    )
    .toBe(1);
  const firstReplies = async () =>
    (
      await asSystem<{ n: number }>(
        `select count(*)::int as n from messages where letting_id = $1 and kind = 'first_reply'`,
        [home.lettingId],
      )
    )[0]!.n;
  expect(await firstReplies()).toBe(0);

  // The lister is emailed, with the reason, in the Gaff layout.
  const told = await emailAsPage(
    browser,
    operatorEmail,
    `${address} is off gaff.ie for now`,
    'ux-ts-email-hidden',
  );
  expect(told).toContain(
    `Gaff’s team has taken ${address} off gaff.ie after a report: some of its details look wrong.`,
  );

  // The lister sees it on the letting, as its Needs you task, and asks Gaff to look again.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(home.lettingPath);
    const needs = needsYouBlock(page);
    await expect(needs).toContainText(
      'Gaff’s team took this home off gaff.ie after a report: some of its details look wrong. Its enquiries wait until it’s back.',
    );
    await expect(needs.getByRole('link', { name: 'Ask Gaff to look again' })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ts-letting-hidden-${width}`);

    await needs.getByRole('link', { name: 'Ask Gaff to look again' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'This home is off gaff.ie for now' }),
    ).toBeVisible();
    await expect(page.getByText(/after a report: some of its details look wrong\.$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Change the home’s details' })).toBeVisible();
    await expect(page.locator('[data-button="primary"]')).toHaveCount(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ts-look-again-${width}`);
  }
  await page.getByRole('button', { name: 'Ask Gaff to look again' }).click();
  await expect(page).toHaveURL(new RegExp(`${home.lettingPath}$`));
  await expect(needsYouBlock(page)).toContainText(
    'Gaff’s team is looking at this home again, and will email you within one working day.',
  );

  // Staff see that the lister asked, and put it back.
  await staffPage.goto('/internal');
  const hidden = staffPage.getByRole('region', { name: title }).filter({
    has: staffPage.getByText('Asked to look again'),
  });
  await expect(hidden).toBeVisible();
  await settled(staffPage);
  await screenshot(staffPage, 'ux-ts-internal-asked-again-1280');
  await hidden.getByRole('button', { name: `Put it back on gaff.ie ${title}` }).click();
  await expect(staffPage.getByText(/^It’s back on gaff\.ie\./)).toBeVisible();
  await expectAccessible(staffPage);

  // It returns: its page, its place in search, and the enquiry that waited is answered.
  {
    const { context, page: visitor } = await signedOut(browser, phone);
    const response = await visitor.goto(home.homePath);
    expect(response?.status()).toBe(200);
    expect(await inSearch(visitor, home.homePath)).toBe(1);
    await context.close();
  }
  await expect.poll(firstReplies).toBe(1);
  await emailAsPage(browser, operatorEmail, `${address} is back on gaff.ie`, 'ux-ts-email-back');
  await page.goto(home.lettingPath);
  await expect(needsYouBlock(page)).not.toContainText('off gaff.ie');

  // Every staff action is recorded as Gaff's, and the lister's record says what happened.
  const record = await asSystem<{ type: string; actor_type: string }>(
    `select type, actor_type from events where letting_id = $1 and type like 'listing.%' order by id`,
    [home.lettingId],
  );
  expect(record).toEqual([
    { type: 'listing.reported', actor_type: 'system' },
    { type: 'listing.reported', actor_type: 'system' },
    { type: 'listing.hidden', actor_type: 'staff' },
    { type: 'listing.look_again_asked', actor_type: 'person' },
    { type: 'listing.unhidden', actor_type: 'staff' },
  ]);
  await staffContext.close();
});

test('UX-TS-5, Q13: nobody but Gaff’s own team can open any internal page', async ({ page }) => {
  for (const path of ['/internal', '/internal/agencies', '/internal/funnels']) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
  await signUpOperator(page);
  for (const path of ['/internal', '/internal/agencies', '/internal/funnels']) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { name: 'Gaff internal' })).toHaveCount(0);
  }
});

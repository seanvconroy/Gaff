import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, E2E_SECOND_STAFF_EMAIL, E2E_STAFF_EMAIL } from '../../playwright.config';
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

/**
 * Work package WP-26 and BA-9: trust and Gaff's internal page (UX-TS-3 to UX-TS-6, UX-AG-4), with
 * every report handled as a case a person decides (M96 to M98, M106).
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
async function emailAsPage(
  browser: Browser,
  to: string,
  subject: string,
  name: string,
  button = 'Open the letting',
) {
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
  await expect(letter.getByRole('link', { name: button })).toHaveCount(1);
  await expect(letter.getByRole('img', { name: 'Gaff' })).toBeVisible();
  await expectAccessible(letter);
  await letter.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  await context.close();
  return mail!.text;
}

/** The open case card for this home on Gaff's internal page. */
function caseCard(staffPage: Page, title: string) {
  return staffPage
    .getByRole('region', { name: title })
    .filter({ has: staffPage.getByText(/Decide by /) });
}

/**
 * M98: on Gaff's internal page, a person decides the case to hide it (or keep it off), for this
 * reason, relying on the reports and the photos.
 */
async function hideThroughInternal(staffPage: Page, title: string, reason: string) {
  await staffPage.goto('/internal');
  const card = caseCard(staffPage, title);
  await card.getByLabel('Why it’s hidden').selectOption(reason);
  await expect(card.getByRole('checkbox', { name: 'The reports we received' })).toBeChecked();
  await card.getByRole('checkbox', { name: 'The home’s photos' }).check();
  await card.getByRole('button', { name: /^(Hide this listing|Keep it off gaff\.ie) / }).click();
  await expect(
    staffPage.getByText(/^(Hidden\. It’s out of search|Decided: it stays off gaff\.ie)/),
  ).toBeVisible();
}

/** UX-TS-3, M96: a visitor with no account reports it, for this reason, maybe with an email. */
async function reportThroughUi(visitor: Page, homePath: string, reason: string, email?: string) {
  await visitor.goto(homePath);
  await visitor.getByRole('link', { name: 'Report this listing' }).click();
  await visitor.getByRole('radio', { name: reason }).check();
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await expect(
    visitor.getByRole('heading', { level: 1, name: 'Would you like to hear what we decide?' }),
  ).toBeVisible();
  if (email) await visitor.getByLabel('Your email').fill(email);
  await visitor.getByRole('button', { name: 'Send report' }).click();
  await expect(
    visitor.getByRole('heading', { level: 1, name: 'Thanks for telling us' }),
  ).toBeVisible();
  await expect(visitor.getByText(/^A person on Gaff’s team will look at it by /)).toBeVisible();
}

/** The development outbox's subjects to this address. */
async function subjectsTo(to: string): Promise<string[]> {
  return (
    await asSystem<{ subject: string }>('select subject from dev_outbox where to_address = $1', [
      to,
    ])
  ).map((row) => row.subject);
}

/** How many first replies Gaff has sent for this letting. */
async function firstRepliesTo(lettingId: string): Promise<number> {
  const [row] = await asSystem<{ n: number }>(
    `select count(*)::int as n from messages where letting_id = $1 and kind = 'first_reply'`,
    [lettingId],
  );
  return row!.n;
}

/** A Daft enquiry to the hidden home: it is placed on the letting, and nobody is answered. */
async function anEnquiryWhileHidden(page: Page, address: string, lettingId: string) {
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
            [lettingId],
          )
        )[0]!.n,
    )
    .toBe(1);
  expect(await firstRepliesTo(lettingId)).toBe(0);
}

test('UX-TS-3 to UX-TS-5, M96 to M98: two scam reports take a listing off at once, the lister is told it was automatic, and a person decides with reasons', async ({
  browser,
  page,
}) => {
  // Four people's screens, at two widths, with three emails. The appeal is the next journey.
  test.setTimeout(240_000);
  // An address no other journey uses, so its cards are the only ones by that name.
  const address = '5 Willow Terrace';
  const operatorEmail = await signUpOperator(
    page,
    `Halcyon Lettings ${String(Date.now()).slice(-5)}`,
  );
  const home = await aLiveHomeOnGaff(page, address);
  const title = `${address}, Ranelagh, Dublin 6`;
  const visitorEmail = `visitor.${String(Date.now()).slice(-6)}@example.ie`;

  // UX-TS-3, M96: a visitor with no account reports it as a scam, and asks to hear the outcome.
  // One scam report takes nothing off.
  {
    const { context, page: visitor } = await signedOut(browser, phone);
    expect(await inSearch(visitor, home.homePath)).toBe(1);
    await reportThroughUi(visitor, home.homePath, 'It looks like a scam', visitorEmail);
    await expect(visitor.getByText(/We’ll email you what we decide\.$/)).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, 'ux-ts-report-sent-390');
    expect(await inSearch(visitor, home.homePath)).toBe(1);
    await context.close();
  }
  // M97: a second scam report takes it off at once, by the rules, until a person looks.
  {
    const { context, page: visitor } = await signedOut(browser, desktop);
    await reportThroughUi(visitor, home.homePath, 'It looks like a scam');
    await expect(visitor.getByText(/You don’t need to do anything else\.$/)).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, 'ux-ts-report-sent-1280');
    await context.close();
  }
  const reports = await asSystem<{ reason: string; asked: boolean }>(
    `select reason, outcome_email is not null as asked from listing_reports where letting_id = $1 order by received_at`,
    [home.lettingId],
  );
  expect(reports).toEqual([
    { reason: 'scam', asked: true },
    { reason: 'scam', asked: false },
  ]);
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

  // The lister is told it was automatic, and that a person will look; nothing asks them to act.
  const held = await emailAsPage(
    browser,
    operatorEmail,
    `${address} is off gaff.ie while we check a report`,
    'ux-ts-email-held',
  );
  expect(held).toContain('Nobody has decided anything about it yet.');
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(home.lettingPath);
    await expect(needsYouBlock(page)).toContainText(
      'Gaff’s rules took this home off gaff.ie automatically after reports that it may be a scam.',
    );
    await expect(
      needsYouBlock(page).getByRole('link', { name: 'Ask Gaff to look again' }),
    ).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ts-letting-held-${width}`);
  }

  // UX-TS-5, M106: the case is on Gaff's internal page, for Gaff's own team.
  const staffContext = await browser.newContext({ locale: 'en-IE' });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);
  for (const [width, viewport] of widths) {
    await staffPage.setViewportSize(viewport);
    const response = await staffPage.goto('/internal');
    expect(response?.status()).toBe(200);
    await expect(staffPage.getByRole('heading', { level: 1, name: 'Gaff internal' })).toBeVisible();
    // The three lists and the search map's counts (BA-5, M133: numbers only), and nothing more.
    await expect(staffPage.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Agencies waiting to be confirmed',
      'Reported listings',
      'Funnels',
      'The search map',
    ]);
    const card = caseCard(staffPage, title);
    await expect(card.getByText('2 reports')).toBeVisible();
    await expect(card.getByText('Off gaff.ie automatically')).toBeVisible();
    await expect(card.getByText('It looks like a scam', { exact: true })).toHaveCount(2);
    await expect(
      card.getByRole('button', { name: `Put it back on gaff.ie ${title}` }),
    ).toBeVisible();
    await card.getByText(/^History \(/).click();
    await expect(card.getByText('Taken off automatically: strong signs of a scam')).toBeVisible();
    await expect(staffPage.getByRole('region', { name: 'Funnels' })).toBeVisible();
    await expectNoSidewaysScroll(staffPage);
    await expectAccessible(staffPage);
    await screenshot(staffPage, `ux-ts-internal-case-${width}`);
  }
  // Nothing about any renter or message is in the reports. (The agencies list above it names
  // each agency's own admin, who asked to be confirmed: that's a lister, never a renter.)
  const reportsList = staffPage.locator('section', {
    has: staffPage.getByRole('heading', { level: 2, name: 'Reported listings' }),
  });
  expect(await reportsList.innerText()).not.toMatch(/Aoife|@example\.ie/);

  // M98: a person keeps it off, with a reason and what it relies on.
  await hideThroughInternal(staffPage, title, 'scam');
  await expect(staffPage).toHaveTitle(/Gaff internal/);
  await expectAccessible(staffPage);
  await screenshot(staffPage, 'ux-ts-internal-decided-1280');

  // The lister receives the statement of reasons, in the Gaff layout.
  const told = await emailAsPage(
    browser,
    operatorEmail,
    `${address} is off gaff.ie for now`,
    'ux-ts-email-hidden',
  );
  expect(told).toContain(
    `Gaff’s team has taken ${address} off gaff.ie after a report: it may not be a genuine listing.`,
  );
  expect(told).toContain('What we relied on: the reports we received and the home’s photos.');
  expect(told).toContain('A person on Gaff’s team decided this on');
  // M96: the visitor who asked hears the outcome, and their address is gone.
  const outcome = await emailAsPage(
    browser,
    visitorEmail,
    'What we decided about the listing you reported',
    'ux-ts-email-report-outcome',
    'Search homes on Gaff',
  );
  expect(outcome).toContain(`the listing for ${address} that you reported, and took it off`);
  await expect
    .poll(
      async () =>
        (
          await asSystem<{ n: number }>(
            'select count(*)::int as n from listing_reports where letting_id = $1 and outcome_email is not null',
            [home.lettingId],
          )
        )[0]!.n,
    )
    .toBe(0);
  await staffContext.close();
});

test('UX-TS-4, M98: the lister of a hidden home reads why, asks Gaff to look again, someone else puts it back, and the enquiry that waited is answered', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  // Another address no other journey uses. Reported once and hidden by a person.
  const address = '7 Willow Terrace';
  const operatorEmail = await signUpOperator(
    page,
    `Halcyon Lettings ${String(Date.now()).slice(-5)}`,
  );
  const home = await aLiveHomeOnGaff(page, address);
  const title = `${address}, Ranelagh, Dublin 6`;
  {
    const { context, page: visitor } = await signedOut(browser, phone);
    await reportThroughUi(visitor, home.homePath, 'The details are wrong');
    await context.close();
  }
  const staffContext = await browser.newContext({ locale: 'en-IE', viewport: desktop });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);
  await hideThroughInternal(staffPage, title, 'wrong_details');
  await anEnquiryWhileHidden(page, address, home.lettingId);
  const firstReplies = () => firstRepliesTo(home.lettingId);
  await expect.poll(() => subjectsTo(operatorEmail)).toContain(`${address} is off gaff.ie for now`);

  // The lister sees it on the letting, as its Needs you task, reads why, and asks once.
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
    await expect(
      page.getByText('What we relied on: the reports we received and the home’s photos.'),
    ).toBeVisible();
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

  // M98: the person who decided can't decide the appeal.
  await staffPage.goto('/internal');
  const asFounder = caseCard(staffPage, title).filter({
    has: staffPage.getByText('Asked to look again'),
  });
  await expect(asFounder).toBeVisible();
  await expect(
    asFounder.getByText(
      'You made the first decision, so someone else on Gaff’s team must decide this.',
    ),
  ).toBeVisible();
  await expect(asFounder.getByRole('button')).toHaveCount(0);
  await settled(staffPage);
  await screenshot(staffPage, 'ux-ts-internal-appeal-first-decider-1280');
  await staffContext.close();

  // Someone else on Gaff's team decides it, at each width, and puts it back.
  const otherContext = await browser.newContext({ locale: 'en-IE' });
  const other = await otherContext.newPage();
  await signIn(other, E2E_SECOND_STAFF_EMAIL);
  for (const [width, viewport] of widths) {
    await other.setViewportSize(viewport);
    await other.goto('/internal');
    const appeal = caseCard(other, title).filter({ has: other.getByText('Asked to look again') });
    await expect(appeal.getByText('Relied on', { exact: true })).toBeVisible();
    await expect(appeal.getByText('The details are wrong').first()).toBeVisible();
    await expectNoSidewaysScroll(other);
    await expectAccessible(other);
    await screenshot(other, `ux-ts-internal-appeal-${width}`);
  }
  await caseCard(other, title)
    .getByRole('button', { name: `Put it back on gaff.ie ${title}` })
    .click();
  await expect(other.getByText(/^It’s back on gaff\.ie\./)).toBeVisible();
  await expectAccessible(other);

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

  // Every decision is recorded as Gaff's team's, and the lister's record says what happened.
  const record = await asSystem<{ type: string; actor_type: string }>(
    `select type, actor_type from events where letting_id = $1 and type like 'listing.%' order by id`,
    [home.lettingId],
  );
  expect(record).toEqual([
    { type: 'listing.reported', actor_type: 'system' },
    { type: 'listing.hidden', actor_type: 'staff' },
    { type: 'listing.look_again_asked', actor_type: 'person' },
    { type: 'listing.appeal_decided', actor_type: 'staff' },
    { type: 'listing.unhidden', actor_type: 'staff' },
  ]);
  await otherContext.close();
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

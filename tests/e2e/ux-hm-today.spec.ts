import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadTokens } from '../../scripts/tokens/lib';
import { daftEnquiry, gmailForwardingConfirmation } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signIn,
  signUpOperator,
  startViewingsNow,
} from './support';
import { aColleagueOf, aHomeLedBy, lastActive, viewingsWereYesterday } from './today';

/**
 * Work package WP-7: Today and Lettings (section 3 of the redesign). Each journey runs at 390px
 * and 1280px: one design, the same words and steps at both.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

const tokens = loadTokens();
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const ink = rgb(tokens.colors['ink']!.light);

const main = (page: Page) => page.getByRole('main');
const needsYou = (page: Page) => page.getByRole('region', { name: 'Needs you' });
/**
 * The fill of every link and button in the page. An ink one is the screen's primary button
 * (UX-DS-2); a quiet button and a row are white or see-through.
 */
const buttonFills = (page: Page) =>
  main(page)
    .locator('a, button')
    .evaluateAll((controls) => controls.map((c) => getComputedStyle(c).backgroundColor));
/** How many columns a list of home cards is laid out in. */
const columns = async (list: Locator) =>
  new Set(
    await list
      .getByRole('listitem')
      .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().left))),
  ).size;

test('UX-HM-1 to UX-HM-6, UX-HM-8 to UX-HM-10: Today lists what needs a person, most urgent first, then today’s viewings and what Gaff did', async ({
  page,
}) => {
  test.slow();
  const operator = await signUpOperator(page);

  // UX-HM-1, first visit: Today, a greeting by first name, and the one way to start. No primary
  // button: that belongs to the setup checklist (UX-HM-6), which a later package builds.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(main(page).getByText('Hello, Ann.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add your first letting' })).toBeVisible();
    await expect(main(page).getByRole('link')).toHaveText(['Add a letting']);
    expect(await buttonFills(page)).not.toContain(ink);
    await expect(needsYou(page)).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `today-first-visit-${width}`);
  }

  // A home being set up: one row, saying what and which home, then why now (UX-HM-3).
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  const lettingUrl = page.url().replace(/\/viewings.*$/, '');
  await page.goto('/today');
  await expect(needsYou(page).getByRole('listitem')).toHaveText([
    /^Finish setting up · 12 Ranelagh Road\s*2 steps left$/,
  ]);
  await expect(main(page).getByText('1 thing', { exact: true })).toBeVisible();

  // Live, with an enquiry that asks one thing Gaff can answer and one it can't, and an email
  // Gaff can't place.
  await page.goto(lettingUrl);
  await goLiveThroughUi(page);
  const to = await gaffAddress(page);
  await sendTestEmail(page, {
    to,
    ...daftEnquiry,
    text: daftEnquiry.text.replace(
      'Hi, is the apartment still available? Is there parking?\nThanks, Aoife',
      'Hi, is it furnished? Is there a garden?\nThanks, Aoife',
    ),
  });
  await sendTestEmail(page, { to, ...gmailForwardingConfirmation });
  // They were last here two days ago: what Gaff does from now on happened while they were away.
  await lastActive(operator, 48);

  // UX-HM-4: a decision first, then a renter waiting on a reply, then a question only a person
  // can answer, then email Gaff couldn't place. UX-HM-5: one row per kind per home.
  const rows = needsYou(page).getByRole('listitem');
  await expect(async () => {
    await page.goto('/today');
    await expect(rows).toHaveText(
      [
        /^Choose who views · 12 Ranelagh Road/,
        /^Approve 1 answer · 12 Ranelagh Road/,
        /^Aoife asked a question · 12 Ranelagh Road/,
        /^1 email Gaff couldn’t place/,
      ],
      { timeout: 1000 },
    );
    await expect(page.getByRole('region', { name: 'While you were away' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 30_000 });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    // UX-HM-3: the second line says why now: who is waiting, or for how long.
    await expect(rows.nth(0)).toContainText('1 person is waiting to hear. 4 places');
    await expect(rows.nth(1)).toContainText(/Waiting (since just now|\d+ (minute|minutes))/);
    // The whole row is one target, and it is the only link in it.
    await expect(rows.nth(0).getByRole('link')).toHaveCount(1);
    const row = (await rows.nth(0).boundingBox())!;
    const link = (await rows.nth(0).getByRole('link').boundingBox())!;
    expect(link.width).toBeCloseTo(row.width, 0);
    expect(link.height).toBeGreaterThanOrEqual(64);

    // The count is the screen's one accent, and matches the badge in the navigation (UX-NV-5).
    await expect(main(page).getByText('4 things', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Today 4 things need you' }),
    ).toBeVisible();

    // UX-HM-10: no contact details and no message text; a first name only.
    const words = await main(page).innerText();
    for (const secret of ['aoife.byrne', '@', '087', 'Byrne', 'garden', 'furnished']) {
      expect(words).not.toContain(secret);
    }
    // UX-HM-9: nothing about counting time; UX-NV-11: no step numbers or stage meter.
    expect(words).not.toMatch(/time in Gaff|usual time|counts a minute|Step \d of 9/i);
    await expect(page.getByRole('link', { name: /usual times/i })).toHaveCount(0);
    // UX-HM-6: no primary button; the rows are the actions. No list of lettings competes.
    expect(await buttonFills(page)).not.toContain(ink);
    await expect(
      main(page).getByRole('link', { name: '12 Ranelagh Road', exact: true }),
    ).toHaveCount(0);

    // UX-HM-8: one sentence, from counts only, linking to nothing.
    const away = page.getByRole('region', { name: 'While you were away' });
    await expect(away.getByRole('paragraph')).toHaveText(
      /^Gaff answered 1 enquiry since (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\.$/,
    );
    await expect(away.getByRole('link')).toHaveCount(0);

    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `today-needs-you-${width}`);
  }

  // "Viewings today": the time, the address and how many are booked.
  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto('/today');
  const viewings = page.getByRole('region', { name: 'Viewings today' });
  await expect(viewings.getByRole('listitem')).toHaveText([
    /^\d{1,2}(:\d{2})?(am|pm) to \d{1,2}(:\d{2})?(am|pm) · 12 Ranelagh Road\s*0 of 4 booked$/,
  ]);
  // The blocks keep their order: Needs you, Viewings today, While you were away.
  await expect(main(page).getByRole('heading', { level: 2 })).toHaveText([
    'Needs you',
    'Viewings today',
    'While you were away',
  ]);
  await expectAccessible(page);
  await screenshot(page, 'today-viewings-today-1280');

  // Each row opens where its task is done.
  await rows.nth(1).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible();
  await page.goto('/today');
  await rows.nth(0).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Decide who views' })).toBeVisible();
});

test('UX-HM-7: when nothing needs the person, Today says so in one line and offers at most one action', async ({
  page,
}) => {
  test.slow();
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);

  // A live home with viewing times, and nobody waiting: all caught up, and nothing to suggest.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
    await expect(needsYou(page)).toHaveCount(0);
    await expect(main(page).getByRole('link')).toHaveCount(0);
    await expect(main(page).getByRole('button')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }),
    ).toHaveText(/^Today$/);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `today-caught-up-${width}`);
  }

  // Its viewings are over and there are none to come: the one next thing worth doing.
  await viewingsWereYesterday('12 Ranelagh Road', operator);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
    await expect(main(page).getByRole('link')).toHaveText([
      'Add viewing times for 12 Ranelagh Road',
    ]);
    // UX-HM-6: a quiet button, never the primary one.
    expect(await buttonFills(page)).not.toContain(ink);
    await expectAccessible(page);
    await screenshot(page, `today-caught-up-suggestion-${width}`);
  }
  await main(page).getByRole('link', { name: 'Add viewing times for 12 Ranelagh Road' }).click();
  await expect(page).toHaveURL(/\/viewings$/);
});

test('UX-HM-11: an admin switches Today and Lettings between "Mine" and "Everyone"; an agent sees what they lead', async ({
  page,
  browser,
}) => {
  test.slow();
  const admin = await signUpOperator(page);
  await createLettingThroughUi(page, '4 Harbour View');
  const whose = page.getByRole('navigation', { name: 'Whose tasks' });
  const whoseHomes = page.getByRole('navigation', { name: 'Whose homes' });
  const rows = needsYou(page).getByRole('listitem');

  // On her own, there is nobody else's to see: no switch on either.
  await page.goto('/today');
  await expect(rows).toHaveCount(1);
  await expect(whose).toHaveCount(0);
  await page.goto('/lettings');
  await expect(whoseHomes).toHaveCount(0);

  // A colleague joins and leads two homes: one waiting five days, one added today.
  const niamh = await aColleagueOf(admin, 'Niamh Kelly');
  await aHomeLedBy(niamh, { address: '9 Canal View', status: 'draft', addedDaysAgo: 5 });
  await aHomeLedBy(niamh, { address: '2 Fresh Lane', status: 'draft' });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);

    // "Mine" by default: only what she leads.
    await page.goto('/today');
    await expect(whose.getByRole('link')).toHaveText(['Mine', 'Everyone']);
    await expect(whose.getByRole('link', { name: 'Mine' })).toHaveAttribute('aria-current', 'true');
    await expect(rows).toHaveText([/^Finish setting up · 4 Harbour View/]);
    await expectAccessible(page);
    await screenshot(page, `today-mine-${width}`);

    // "Everyone": hers, plus what has waited more than one working day on anyone else, each
    // with its lead's name. What her colleague added today isn't there yet.
    await whose.getByRole('link', { name: 'Everyone' }).click();
    await expect(page).toHaveURL(/\/today\?view=everyone$/);
    await expect(whose.getByRole('link', { name: 'Everyone' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // Some of these wait on a colleague, so the block is "Waiting", not "Needs you".
    const waiting = page.getByRole('region', { name: 'Waiting' }).getByRole('listitem');
    await expect(waiting).toHaveText([
      /^Finish setting up · 9 Canal View.*Lead: Niamh Kelly$/s,
      /^Finish setting up · 4 Harbour View.*Lead: You$/s,
    ]);
    await expect(main(page).getByText('2 Fresh Lane')).toHaveCount(0);
    await expect(main(page).getByText('2 things are waiting.')).toBeVisible();
    // The badge in the navigation stays her own count.
    await expect(
      page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Today 1 thing needs you' }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `today-everyone-${width}`);

    // Read first, and she can open and do any of them.
    await waiting.nth(0).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: '9 Canal View' })).toBeVisible();

    // Lettings: her homes, then every home the agency runs.
    await page.goto('/lettings');
    await expect(whoseHomes.getByRole('link')).toHaveText(['Mine', 'Everyone']);
    await expect(main(page).getByRole('heading', { level: 3 })).toHaveText(['4 Harbour View']);
    await whoseHomes.getByRole('link', { name: 'Everyone' }).click();
    await expect(page).toHaveURL(/\/lettings\?view=everyone$/);
    await expect(main(page).getByRole('heading', { level: 3 })).toHaveCount(3);
    await expect(main(page).getByRole('link', { name: '9 Canal View', exact: true })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `lettings-everyone-${width}`);
  }

  // The agent: Today is what she leads, with no switch. On Lettings she can see every home.
  const context = await browser.newContext({ locale: 'en-IE', timezoneId: 'Europe/Dublin' });
  const agent = await context.newPage();
  await signIn(agent, niamh);
  await agent.goto('/today');
  await expect(agent.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(agent.getByRole('navigation', { name: 'Whose tasks' })).toHaveCount(0);
  await expect(needsYou(agent).getByRole('listitem')).toHaveText([
    /^Finish setting up · 9 Canal View/,
    /^Finish setting up · 2 Fresh Lane/,
  ]);
  // Asking for "Everyone" in the address changes nothing for someone who doesn't have it.
  await agent.goto('/today?view=everyone');
  await expect(needsYou(agent).getByRole('listitem')).toHaveCount(2);
  await expect(needsYou(agent).getByText('4 Harbour View')).toHaveCount(0);
  await agent.goto('/lettings');
  await expect(agent.getByRole('main').getByRole('heading', { level: 3 })).toHaveCount(2);
  await agent
    .getByRole('navigation', { name: 'Whose homes' })
    .getByRole('link', { name: 'Everyone' })
    .click();
  await expect(agent.getByRole('main').getByRole('heading', { level: 3 })).toHaveCount(3);
  await expectAccessible(agent);
  await context.close();
});

test('UX-NV-9 to UX-NV-12: Lettings is a photo-led list under Live, Setting up and Let, three across on a desktop and one column on a phone', async ({
  page,
}) => {
  test.slow();
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page, '12 Ranelagh Road');
  await goLiveThroughUi(page);
  await createLettingThroughUi(page, '9 Canal View');
  await aHomeLedBy(operator, { address: '4 Harbour View', status: 'live', addedDaysAgo: 2 });
  await aHomeLedBy(operator, { address: '6 Mill Lane', status: 'live', addedDaysAgo: 3 });
  await aHomeLedBy(operator, { address: '1 Abbey Court', status: 'let', closedDaysAgo: 30 });
  await aHomeLedBy(operator, { address: '3 Old Quay', status: 'let', closedDaysAgo: 400 });
  await aHomeLedBy(operator, { address: '5 Hill Road', status: 'withdrawn', closedDaysAgo: 10 });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/lettings');
    await expect(page.getByRole('heading', { level: 1, name: 'Lettings' })).toBeVisible();

    // UX-NV-10: three headings, in order, each with its homes.
    await expect(main(page).getByRole('heading', { level: 2 })).toHaveText([
      'Live',
      'Setting up',
      'Let',
    ]);
    const live = page.getByRole('list', { name: 'Live' });
    const settingUp = page.getByRole('list', { name: 'Setting up' });
    const let_ = page.getByRole('list', { name: 'Let', exact: true });
    await expect(live.getByRole('heading', { level: 3 })).toHaveText([
      '12 Ranelagh Road',
      '4 Harbour View',
      '6 Mill Lane',
    ]);
    await expect(settingUp.getByRole('heading', { level: 3 })).toHaveText(['9 Canal View']);
    await expect(let_.getByRole('heading', { level: 3 })).toHaveText(['1 Abbey Court']);

    // UX-NV-9: a house icon where there's no photo yet, the address, one status line, and a
    // "needs you" dot only where something on Today belongs to the home. Nothing else.
    await expect(live.getByRole('listitem').first()).toHaveText(
      /^12 Ranelagh Road\s*Enquiries · none yet$/,
    );
    await expect(settingUp.getByRole('listitem')).toHaveText([
      /^9 Canal View\s*2 steps left\s*Needs you$/,
    ]);
    await expect(let_.getByRole('listitem')).toHaveText([/^1 Abbey Court\s*Let$/]);
    await expect(live.getByText('Needs you')).toHaveCount(0);
    await expect(live.locator('svg')).toHaveCount(3);
    await expect(main(page).locator('img')).toHaveCount(0);
    // One link a home, named by its address.
    await expect(live.getByRole('link')).toHaveText([
      '12 Ranelagh Road',
      '4 Harbour View',
      '6 Mill Lane',
    ]);

    // UX-NV-11: no "Step 2 of 9", no stage meter, no time in Gaff, no usual time.
    const words = await main(page).innerText();
    expect(words).not.toMatch(/Step \d of 9|time in Gaff|usual|Not live yet|Available from/i);
    await expect(page.getByRole('navigation', { name: 'Letting stages' })).toHaveCount(0);
    // Nothing else in a card: the photo, then the address and the status line.
    const parts = await live
      .getByRole('listitem')
      .evaluateAll((cards) =>
        cards.map((card) => [card.children.length, card.lastElementChild!.children.length]),
      );
    expect(parts).toEqual(Array(3).fill([2, 2]));

    // UX-NV-12: three across on a desktop, one column on a phone.
    expect(await columns(live)).toBe(viewport.width > 900 ? 3 : 1);

    // Homes taken off the market, and homes let over 12 months ago, wait behind a link.
    const older = page.getByText('Withdrawn and older homes (2)');
    await expect(main(page).getByRole('link', { name: '3 Old Quay' })).toBeHidden();
    await older.click();
    const olderHomes = page.getByRole('list', { name: 'Withdrawn and older homes' });
    await expect(olderHomes.getByRole('listitem')).toHaveText([
      /^(3 Old Quay\s*Let|5 Hill Road\s*Withdrawn)$/,
      /^(3 Old Quay\s*Let|5 Hill Road\s*Withdrawn)$/,
    ]);

    // UX-HM-6: "Add a letting" is a quiet button in the header; nothing here is primary.
    await expect(main(page).getByRole('link', { name: 'Add a letting' })).toBeVisible();
    expect(await buttonFills(page)).not.toContain(ink);

    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await screenshot(page, `lettings-${width}`);
  }

  // The whole card is the link to the home.
  await page.goto('/lettings');
  await page
    .getByRole('list', { name: 'Live' })
    .getByRole('listitem')
    .first()
    .click({ position: { x: 40, y: 40 } });
  await expect(page.getByRole('heading', { level: 1, name: '12 Ranelagh Road' })).toBeVisible();
});

test('UX-NV-10, UX-HM-6: with no homes, Lettings has no headings and one primary button, "Add a letting"', async ({
  page,
}) => {
  await signUpOperator(page);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/lettings');
    await expect(page.getByRole('heading', { level: 1, name: 'Lettings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No lettings yet' })).toBeVisible();
    await expect(main(page).getByRole('heading', { name: /^(Live|Setting up|Let)$/ })).toHaveCount(
      0,
    );
    // The primary button, and the only one.
    await expect(main(page).getByRole('link')).toHaveText(['Add a letting']);
    expect((await buttonFills(page)).filter((fill) => fill === ink)).toHaveLength(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `lettings-empty-${width}`);
  }
  await main(page).getByRole('link', { name: 'Add a letting' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a letting' })).toBeVisible();
});

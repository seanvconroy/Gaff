import { devices, expect, type Browser, type Page } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import { applyThroughUi, bookFirstTime } from './renter';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  startViewingsNow,
} from './support';

/** Shared journeys through the real screens, for the Slice 2 and Slice 3 tests. */
export const AOIFE = 'aoife.byrne@example.ie';
export const CIARAN = 'ciaran.os@example.ie';

export async function onPhone(browser: Browser, link: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const page = await context.newPage();
  await page.goto(link);
  return { context, page };
}

/**
 * Stages 1 to 4 through the real screens: two renters enquire, both are invited, both book,
 * the viewings start, and the operator marks both as having come.
 */
export async function twoPeopleWhoCame(browser: Browser, page: Page) {
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });
  await sendTestEmail(page, { to, ...myhomeEnquiry, replyTo: '' });
  await chooseWhoViews(page, lettingUrl, {
    waitFor: 'Ciarán Ó Súilleabháin',
    tick: ['Aoife Byrne', 'Ciarán Ó Súilleabháin'],
  });
  await expect(page.getByText('2 invited to book a viewing')).toBeVisible();

  const links: Record<string, string> = {};
  for (const email of [AOIFE, CIARAN]) {
    await expect(async () => {
      links[email] = await linkInEmail(email, 'Book a viewing: 12 Ranelagh Road');
    }).toPass({ timeout: 20_000 });
    const renter = await onPhone(browser, links[email]!);
    await bookFirstTime(renter.page);
    await renter.context.close();
  }

  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto(`${lettingUrl}/attendance`);
  for (const name of ['Aoife Byrne', 'Ciarán Ó Súilleabháin']) {
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  return { operator, lettingUrl, links };
}

export async function applyOnPhone(browser: Browser, link: string, income: string) {
  const renter = await onPhone(browser, link);
  await applyThroughUi(renter.page, { earning: 'From a job', income });
  await renter.context.close();
}

/** Both apply; the operator chooses Aoife as preferred and Ciarán as backup. */
export async function twoChosen(browser: Browser, page: Page) {
  const setup = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, setup.links[AOIFE]!, '5,200');
  await applyOnPhone(browser, setup.links[CIARAN]!, '4,800');
  await chooseApplicant(page, setup.lettingUrl, {
    preferred: 'Aoife Byrne',
    backup: 'Ciarán Ó Súilleabháin',
  });
  return setup;
}

/**
 * Through stage 7: the operator records that the owner has already approved (no owner email,
 * Q22, UX-DC-15), adds the three comparable rents, and offers Aoife the home without waiting
 * for the checks (UX-DC-19). Aoife accepts on her phone.
 */
export async function anAcceptedOffer(browser: Browser, page: Page) {
  const setup = await twoChosen(browser, page);
  await recordComparablesThroughUi(page, setup.lettingUrl);
  await page.goto(`${setup.lettingUrl}/approval`);
  await page.getByRole('button', { name: 'The owner has already approved' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recorded: the owner has approved' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Continue to the offer' }).click();
  await sendTheOffer(page, { withoutChecks: true });
  let offerLink = '';
  await expect(async () => {
    offerLink = await linkInEmail(AOIFE, 'An offer: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, offerLink);
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    aoife.page.getByText('You’ve accepted the offer. Your tenancy starts on'),
  ).toBeVisible();
  await aoife.context.close();
  return { ...setup, offerLink };
}

/**
 * UX-DC-1 to UX-DC-6: "Choose who views", through the flow. Waits for `waitFor` to have
 * enquired, changes the ticks, then Next and "Send invitations".
 */
export async function chooseWhoViews(
  page: Page,
  lettingUrl: string,
  options: { waitFor: string; tick?: string[]; untick?: string[] },
) {
  const row = (name: string) => page.getByRole('checkbox', { name, exact: true });
  await expect(async () => {
    await page.goto(`${lettingUrl}/who-views`);
    await expect(row(options.waitFor)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  for (const name of options.tick ?? []) await row(name).check();
  for (const name of options.untick ?? []) await row(name).uncheck();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByRole('heading', { name: 'Invitations sent' })).toBeVisible();
}

/** UX-DC-7 to UX-DC-9: "Choose an applicant", a backup (or none), then "Start the checks". */
export async function chooseApplicant(
  page: Page,
  lettingUrl: string,
  options: { preferred: string; backup: string | null },
) {
  await page.goto(`${lettingUrl}/choose`);
  await page.getByRole('radio', { name: `Choose ${options.preferred}` }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: options.backup ?? 'No backup', exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the checks' }).click();
  await expect(page.getByRole('heading', { name: 'Checks started' })).toBeVisible();
}

/**
 * UX-DC-19, UX-LP-14 (R4): the three comparable rents the offer waits for, made up, one home
 * per screen. They end on Home on the letting's page.
 */
export async function recordComparablesThroughUi(page: Page, lettingUrl: string) {
  await page.goto(`${lettingUrl}/comparables`);
  for (const [n, rent] of [
    [1, '1,800'],
    [2, '1,850'],
    [3, '1,950'],
  ] as const) {
    await expect(
      page.getByRole('heading', { level: 1, name: `Comparable rent ${n} of 3` }),
    ).toBeVisible();
    await page.getByLabel('Area').fill('Dublin 6');
    await page.getByLabel('Type of home').selectOption('apartment');
    await page.getByLabel('Bedrooms').fill('2');
    await page.getByLabel('Rent a month').fill(rent);
    await page
      .getByRole('button', { name: n < 3 ? 'Next' : 'Save comparables', exact: true })
      .click();
  }
  await expect(page.getByText('Comparables saved for the rent-setting pack.')).toBeVisible();
}

/** UX-DC-17: on the offer's first screen, Next, then "Send the offer to Aoife". */
export async function sendTheOffer(page: Page, options: { withoutChecks?: boolean } = {}) {
  await expect(page.getByRole('heading', { name: 'The offer', exact: true })).toBeVisible();
  if (options.withoutChecks) {
    await page.getByRole('checkbox', { name: 'Go ahead without waiting for them' }).check();
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(page.getByRole('heading', { name: 'Offer sent' })).toBeVisible();
}

/**
 * A screen of a decision flow (WP-17) at both widths, phone first: an axe check with the control
 * sizes, nothing wider than the screen, and a screenshot of each. It ends at 1280px.
 */
export async function flowAtBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, `wp17-${name}-${width}`);
  }
}

/** UX-LP-1: a letting's Overview, block by block. */
export const needsYouBlock = (page: Page) =>
  page.getByRole('region', { name: /^(Needs you|Nothing needs you)$/ });
export const happeningBlock = (page: Page) =>
  page.getByRole('region', { name: 'What’s happening' });
export const nextBlock = (page: Page) => page.getByRole('region', { name: 'What’s next' });

/**
 * UX-LP-1, UX-LP-2: the letting's Overview as it should be: its three blocks and no more, the
 * same three views, and either the one task (a primary button) or "Nothing needs you".
 */
export async function expectOverview(
  page: Page,
  expected: {
    /** The page's one button, in Needs you. Left out: nothing needs you. */
    task?: string;
    /** Words in Needs you: the task's lead, or what Gaff is doing. */
    says?: string | RegExp;
    /** The figures' names under What's happening, in order. */
    figures?: string[];
    next?: string | RegExp;
  },
) {
  const needs = needsYouBlock(page);
  await expect(needs).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    expected.task ? 'Needs you' : 'Nothing needs you',
    'What’s happening',
    'What’s next',
  ]);
  await expect(page.getByRole('navigation', { name: 'This letting' }).getByRole('link')).toHaveText(
    ['Overview', 'People', 'Home'],
  );
  if (expected.task) {
    await expect(needs.getByRole('link', { name: expected.task, exact: true })).toBeVisible();
  } else {
    await expect(needs.getByRole('link')).toHaveCount(0);
  }
  if (expected.says) await expect(needs).toContainText(expected.says);
  if (expected.figures) {
    await expect(happeningBlock(page).getByRole('term')).toHaveText(expected.figures);
  }
  if (expected.next) await expect(nextBlock(page)).toContainText(expected.next);
  await expect(page.getByText(/Step \d of 9/)).toHaveCount(0);
}

/** The letting's menu, opened: "More for 12 Ranelagh Road". */
export async function openLettingMenu(page: Page, address = '12 Ranelagh Road') {
  await page.getByRole('button', { name: `More for ${address}` }).click();
  const menu = page.getByRole('menu', { name: `More for ${address}` });
  await expect(menu).toBeVisible();
  return menu;
}

/** R26, UX-LP-5: "Close this letting", from the menu, answered and closed. */
export async function closeLettingThroughUi(
  page: Page,
  address: string,
  outcome: 'It’s let' | 'We’re not letting it now',
) {
  const menu = await openLettingMenu(page, address);
  await menu.getByRole('menuitem', { name: 'Close this letting' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'How did it end?' })).toBeVisible();
  await page.getByLabel(outcome).check();
  await page.getByRole('button', { name: 'Close the letting' }).click();
  await expect(page.getByText('Closed. Everyone who enquired has been told')).toBeVisible();
}

/** UX-LP-6: History, from the letting's menu. */
export async function openHistory(page: Page, address = '12 Ranelagh Road') {
  const menu = await openLettingMenu(page, address);
  await menu.getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
}

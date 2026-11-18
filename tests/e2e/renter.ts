import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { expectAccessible, expectNoSidewaysScroll, expectOnePrimary, screenshot } from './support';

/**
 * The rules every one of a renter's pages is held to (work package WP-12; UX-PP-1, UX-PP-4,
 * UX-PP-6): one primary button at most, nothing to read under 16px, and no line of caution
 * beyond the four the redesign allows. Used on the made-up pages (`/dev/ui/renter`) and on the
 * real ones inside the journeys.
 */

/** The four notices on a renter's whole path (UX-PP-6, Q46), as the pages mark them. */
export type RenterNotice = 'check' | 'fees' | 'ring' | 'deletion';
export const RENTER_NOTICES: readonly RenterNotice[] = ['check', 'fees', 'ring', 'deletion'];

/** The two widths every screen is checked at (rules for every package, 3). */
export const WIDTHS = [390, 1280] as const;

/** UX-PP-1, UX-DS-2: at most one primary button in view (every page's check, in support). */
export { expectOnePrimary };

/**
 * UX-PP-4: nothing a renter must read or act on is smaller than 16px. Every piece of text that
 * is drawn on the page is measured, wherever it is: the frame, the task, a sheet.
 */
export async function expectReadable(page: Page): Promise<void> {
  const small = await page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = (walker.currentNode.textContent ?? '').trim();
      const el = walker.currentNode.parentElement;
      if (!text || !el) continue;
      // Next's own development overlay isn't the page's.
      if (el.closest('script, style, noscript, nextjs-portal, .visually-hidden')) continue;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (box.width <= 1 || box.height <= 1) continue;
      if (parseFloat(style.fontSize) < 16) {
        found.push(`“${text.slice(0, 40)}” is ${style.fontSize}`);
      }
    }
    return found;
  });
  expect(small, 'text under 16px').toEqual([]);
}

/** Words that only hedge, reassure or protect Gaff. None belongs on a renter's page (Q46). */
const HEDGES =
  /please note|disclaimer|nothing is paid (to|through) gaff|we’ll never email|at your own risk|terms and conditions|gaff (is not|isn’t) (liable|responsible)|can(’t|not) guarantee|for your (security|protection)|rest assured|don’t worry/i;

/**
 * UX-PP-6 (Q46): a page shows only the notices it should, out of the four there are, and nothing
 * else that reads as a line of caution. A boxed notice is otherwise only ever something that
 * just went wrong (an alert), or the plain reason a check didn't work.
 */
export async function expectNotices(page: Page, expected: readonly RenterNotice[]): Promise<void> {
  const found = await page.evaluate(() => ({
    marked: [...document.querySelectorAll<HTMLElement>('[data-notice]')].map(
      (el) => el.dataset.notice ?? '',
    ),
    boxes: [...document.querySelectorAll<HTMLElement>('[data-box="notice"]')]
      .filter((el) => !el.closest('[data-notice]') && el.getAttribute('role') !== 'alert')
      .map((el) => (el.textContent ?? '').trim().slice(0, 60)),
    text: document.body.innerText,
  }));
  expect([...new Set(found.marked)].sort(), 'the notices on this page').toEqual(
    [...expected].sort(),
  );
  expect(
    found.boxes.filter((text) => !text.startsWith('That didn’t work this time')),
    'boxed notices that aren’t one of the four',
  ).toEqual([]);
  expect(found.text.match(HEDGES)?.[0] ?? null, 'a line that only hedges').toBeNull();
}

/**
 * One of a renter's pages, as it stands: in the renter's frame, accessible (which also measures
 * every control's height and target), with one primary button at most, nothing under 16px, only
 * its own notices, and no sideways scroll. `shots` saves a screenshot.
 */
export async function expectRenterPage(
  page: Page,
  expected: { notices?: readonly RenterNotice[]; shots?: string } = {},
): Promise<void> {
  await expect(page.locator('[data-frame="renter"]')).toBeVisible();
  await expectAccessible(page);
  await expectOnePrimary(page);
  await expectReadable(page);
  await expectNotices(page, expected.notices ?? []);
  await expectNoSidewaysScroll(page);
  // Every page ends with what happens next (UX-PP-2), said once.
  expect(
    await page.getByText('What happens next', { exact: true }).count(),
    '“What happens next”, once at most',
  ).toBeLessThanOrEqual(1);
  if (expected.shots) await screenshot(page, expected.shots);
}

/** The same page at 390px and at 1280px, with a screenshot of each (`<shots>-390`, `-1280`). */
export async function expectRenterPageAtBothWidths(
  page: Page,
  expected: { notices?: readonly RenterNotice[]; shots?: string } = {},
): Promise<void> {
  const was = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expectRenterPage(page, {
      notices: expected.notices,
      shots: expected.shots ? `${expected.shots}-${width}` : undefined,
    });
  }
  if (was) await page.setViewportSize(was);
}

/**
 * UX-PP-1, UX-PP-4, UX-PP-9: an owner's or a referee's page, at 390px and at 1280px: in the
 * agency's frame, accessible, one primary button at most, nothing under 16px, no sideways scroll,
 * and nothing that invites them to use Gaff (Q45). `shots` saves `<shots>-390` and `-1280`.
 */
export async function expectFramePageAtBothWidths(
  page: Page,
  frame: 'owner' | 'referee',
  shots?: string,
): Promise<void> {
  const was = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(`[data-frame="${frame}"]`)).toBeVisible();
    await expectAccessible(page);
    await expectOnePrimary(page);
    await expectReadable(page);
    await expectNoSidewaysScroll(page);
    expect(await page.locator('body').innerText()).not.toMatch(
      /sign up|create an account|try gaff|join gaff/i,
    );
    if (shots) await screenshot(page, `${shots}-${width}`);
  }
  if (was) await page.setViewportSize(was);
}

/** The newest one-time code emailed for a renter's link (UX-RN-14): the start of its subject. */
export async function latestLinkCodeFor(email: string): Promise<string> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ subject: string }>(
      `select subject from dev_outbox
       where to_address = $1 and subject ~ '^[0-9]{6} is your code for '
       order by created_at desc limit 1`,
      [email],
    );
    const code = rows[0]?.subject.slice(0, 6);
    if (!code) throw new Error(`No code for a link has been sent to ${email}`);
    return code;
  } finally {
    await client.end();
  }
}

/**
 * UX-RN-14, UX-SI-12: gets a renter past the one-time code, on whichever page is asking for it:
 * presses the button that emails the code, then enters it. The six boxes send themselves.
 */
export async function enterLinkCode(
  page: Page,
  email: string,
  button: string | RegExp = 'Email me a code',
): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click();
  const code = page.getByLabel('Six-digit code');
  await expect(code).toBeVisible();
  await expect(async () => {
    await code.fill(await latestLinkCodeFor(email));
  }).toPass({ timeout: 20_000 });
  await expect(code).toBeHidden();
}

/**
 * UX-RN-2: answers the pre-viewing questions on a renter's page, one per screen, by the answers'
 * own words, then sends them. Give the answers in the order the questions are asked.
 */
export async function answerQuestions(page: Page, answers: readonly string[]): Promise<void> {
  for (const [index, answer] of answers.entries()) {
    await page.getByRole('radio', { name: answer, exact: true }).check();
    const last = index === answers.length - 1;
    await page
      .getByRole('button', { name: last ? 'Send my answers' : 'Next', exact: true })
      .click();
  }
}

/**
 * UX-RN-5 to UX-RN-7: books the first free viewing time from a renter's own page: "Choose a
 * time", the first time on the first day, then "Book this viewing". Returns once they're booked.
 */
export async function bookFirstTime(page: Page, mobile?: string): Promise<void> {
  await page.getByRole('link', { name: 'Choose a time', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a time' })).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('listitem')
    .getByRole('link', { name: /^\d{1,2}(:\d{2})?(am|pm)/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Book this viewing?' })).toBeVisible();
  if (mobile) await page.getByLabel('Mobile number for a text reminder').fill(mobile);
  await page.getByRole('button', { name: 'Book this viewing' }).click();
  await expect(page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
}

/**
 * UX-RN-11: applies from a renter's own page: "Apply", how they earn, their income, then the
 * check screen's "Send my application".
 */
export async function applyThroughUi(
  page: Page,
  application: { earning: string; income: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByRole('radio', { name: application.earning, exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Take-home income each month').fill(application.income);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(page.getByRole('heading', { name: 'Your application is in' })).toBeVisible();
}

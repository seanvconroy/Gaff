import { expect, test, type Page } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import { onPhone } from './journeys';
import { bookFirstTime, expectOnePrimary } from './renter';
import {
  addATime,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  isoDateInDays,
  linkInEmail,
  pickDate,
  pickTime,
  screenshot,
  sendTestEmail,
  signUpOperator,
  startViewingsNow,
  subjectsSentTo,
} from './support';

/** Work package WP-16: the calendar and viewings (UX-VW-1 to UX-VW-11). */

const AOIFE = 'aoife.byrne@example.ie';
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

const calendar = (page: Page) => page.getByRole('region', { name: 'Viewing times' });

/** UX-VW-9: no screen uses the browser's own date or time control. */
async function expectNoBrowserPickers(page: Page): Promise<void> {
  await expect(
    page.locator('input[type="date"], input[type="time"], input[type="datetime-local"]'),
  ).toHaveCount(0);
}

/** A viewing time on the calendar, as a phone's row or a desktop's block: one link either way. */
const timeOnCalendar = (page: Page, name: RegExp) =>
  calendar(page).getByRole('link', { name }).locator('visible=true');

/** A live letting with one evening of viewings, an enquiry from Aoife, and her invitation. */
async function aLiveLettingWithAoifeInvited(page: Page) {
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Aoife Byrne')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('1 invited to book a viewing')).toBeVisible();
  let invitation = '';
  await expect(async () => {
    invitation = await linkInEmail(AOIFE, 'Book a viewing: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  return { operator, lettingUrl, invitation };
}

test('UX-VW-1 to UX-VW-3, UX-VW-7, UX-VW-9: every home’s viewing times on one calendar, a day list on a phone and a week on a desktop; Add a time warns of an overlap and doesn’t block', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page, '12 Ranelagh Road');
  await createLettingThroughUi(page, '4 Harbour View');
  const day = isoDateInDays(7);

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(`/calendar?day=${day}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
    // UX-VW-2: one primary action, "Add a time".
    await expectOnePrimary(page);
    await expect(page.locator('[data-button="primary"]').locator('visible=true')).toHaveText([
      'Add a time',
    ]);
    // UX-VW-1: both homes' times, each with its words, in Irish format.
    await expect(timeOnCalendar(page, /^6pm to 7pm · 12 Ranelagh Road.*0 of 4 booked/)).toHaveCount(
      1,
    );
    await expect(timeOnCalendar(page, /^6pm to 7pm · 4 Harbour View.*0 of 4 booked/)).toHaveCount(
      1,
    );
    if (width === '390') {
      // A strip of the week's days; the chosen day's times as rows.
      const days = page.getByRole('navigation', { name: 'Days of the week' });
      await expect(days.getByRole('link')).toHaveCount(7);
      await expect(days.locator('[aria-current="true"]')).toHaveCount(1);
    }
    await expectNoBrowserPickers(page);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `wp16-calendar-${width}`);

    // Previous week, Today, Next week.
    const title = await calendar(page).getByRole('heading', { level: 2 }).innerText();
    await calendar(page).getByRole('link', { name: 'Next week' }).click();
    await expect(calendar(page).getByRole('heading', { level: 2 })).not.toHaveText(title);
    await calendar(page).getByRole('link', { name: 'Previous week' }).click();
    await expect(calendar(page).getByRole('heading', { level: 2 })).toHaveText(title);
  }

  // UX-VW-3: one sheet, at most five fields, each with a default.
  await page.setViewportSize(phone);
  await page.goto(`/calendar?day=${day}`);
  await page.getByRole('button', { name: 'Add a time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a time' });
  await expect(sheet).toBeVisible();
  for (const label of ['Home', 'Day', 'From', 'Until', 'Length of each visit']) {
    await expect(sheet.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(sheet.getByRole('group', { name: 'How people view' })).toBeVisible();
  await expectNoBrowserPickers(page);
  await expectAccessible(page);
  await screenshot(page, 'wp16-add-a-time-390');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // A time for 12 Ranelagh Road the day after, then one at 4 Harbour View that overlaps it.
  const next = isoDateInDays(8);
  await addATime(page, next, async (s) => {
    await s.getByLabel('Home').selectOption({ label: '12 Ranelagh Road' });
    await pickDate(page, 'Day', next, s);
  });
  await page.setViewportSize(desktop);
  await page.getByRole('button', { name: 'Add a time' }).click();
  await sheet.getByLabel('Home').selectOption({ label: '4 Harbour View' });
  await pickDate(page, 'Day', next, sheet);
  await pickTime(page, 'From', '6:30pm', sheet);
  await pickTime(page, 'Until', '7:30pm', sheet);
  // UX-VW-7: a warning at the time fields, naming the other viewing. It doesn't block.
  const warning = sheet.getByText(
    'You have a viewing at 12 Ranelagh Road then, 6pm to 7pm. You can still add this one.',
  );
  await expect(warning).toBeVisible();
  await expect(sheet.getByText(/^4 places, \w+day \d+ \w+, 6:30pm to 7:30pm$/)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'wp16-overlap-warning-1280');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing time added' })).toBeVisible();
  await expect(timeOnCalendar(page, /^6:30pm to 7:30pm · 4 Harbour View/)).toHaveCount(1);
  await expect(timeOnCalendar(page, /^6pm to 7pm · 12 Ranelagh Road/)).toHaveCount(1);
  await screenshot(page, 'wp16-calendar-overlap-1280');
});

test('UX-VW-4: a home with people waiting and no viewing times gets two suggested times, each added with one tap', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Aoife Byrne')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // Its one time is cancelled: nobody had booked, so it goes at once.
  await page.goto(`${lettingUrl}/viewings?day=${isoDateInDays(7)}`);
  await timeOnCalendar(page, /^6pm to 7pm · 12 Ranelagh Road/).click();
  const viewing = page.getByRole('dialog', { name: /^\w+day \d+ \w+, 6pm to 7pm$/ });
  await expect(viewing).toBeVisible();
  await viewing.getByRole('button', { name: /^More for / }).click();
  await page.getByRole('menuitem', { name: 'Cancel this time' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Viewing time cancelled' }),
  ).toBeVisible();

  // UX-VW-4: two suggestions from when renters most often book; with no history, the usual two.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(`${lettingUrl}/viewings`);
    const suggested = page.getByRole('region', { name: 'Suggested times' });
    await expect(suggested.getByRole('listitem')).toHaveText([
      /^(Thursday \d+ \w+, 6pm to 7pm|Saturday \d+ \w+, 11am to 12pm)Add/,
      /^(Thursday \d+ \w+, 6pm to 7pm|Saturday \d+ \w+, 11am to 12pm)Add/,
    ]);
    await expectOnePrimary(page);
    await expectAccessible(page);
    await screenshot(page, `wp16-suggested-times-${width}`);
  }
  // Across every home, the calendar says which home and how many wait.
  await page.goto('/calendar');
  await expect(
    page.getByRole('region', { name: '12 Ranelagh Road: 1 person waiting' }),
  ).toBeVisible();

  // One tap adds it, with the home's last settings.
  await page.goto(`${lettingUrl}/viewings`);
  const suggested = page.getByRole('region', { name: 'Suggested times' });
  const first = suggested.getByRole('listitem').first();
  const words = (await first.innerText()).replace(/\s*Add$/, '');
  await first.getByRole('button', { name: /^Add/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing time added' })).toBeVisible();
  await expect(suggested).toHaveCount(0);
  const range = words.split(', ')[1]!;
  await expect(
    timeOnCalendar(page, new RegExp(`^${range} · 12 Ranelagh Road.*0 of 4 booked`)),
  ).toHaveCount(1);
});

test('UX-VW-6, UX-VW-8, UX-VW-10, UX-VW-11, R12 to R15: a viewing’s sheet; its calendar file; changing and cancelling it with a booking; marking who came', async ({
  browser,
  page,
}) => {
  test.slow();
  const { operator, invitation } = await aLiveLettingWithAoifeInvited(page);
  const renter = await onPhone(browser, invitation);
  await bookFirstTime(renter.page, '087 123 4567');

  // UX-VW-6: tapping the time opens its sheet: who's booked and when, places, the waiting list.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto(`/calendar?day=${isoDateInDays(7)}`);
    await timeOnCalendar(page, /^6pm to 7pm · 12 Ranelagh Road.*1 of 4 booked/).click();
    const sheet = page.getByRole('dialog', { name: /^\w+day \d+ \w+, 6pm to 7pm$/ });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('1 of 4 booked · 3 places left')).toBeVisible();
    await expect(sheet.getByText('Nobody on the waiting list')).toBeVisible();
    await expect(sheet.getByRole('list', { name: 'Who’s booked' })).toHaveText(/6pm\s*Aoife Byrne/);
    // Before the viewing, nothing to mark: the sheet's actions are quiet.
    await expect(sheet.getByRole('link', { name: 'Mark who came' })).toHaveCount(0);
    await expectOnePrimary(page);
    await expectAccessible(page);
    await screenshot(page, `wp16-viewing-sheet-${width}`);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  }

  // UX-VW-8: "Add to my calendar" is a standard calendar file, with nobody's details in it.
  await page.goto(`/calendar?day=${isoDateInDays(7)}`);
  await timeOnCalendar(page, /^6pm to 7pm · 12 Ranelagh Road/).click();
  let sheet = page.getByRole('dialog', { name: /^\w+day \d+ \w+, 6pm to 7pm$/ });
  const file = await page.request.get(
    (await sheet.getByRole('link', { name: 'Add to my calendar' }).getAttribute('href'))!,
  );
  expect(file.headers()['content-type']).toContain('text/calendar');
  const ics = await file.text();
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('SUMMARY:Viewing: 12 Ranelagh Road');
  expect(ics).toContain('DESCRIPTION:1 of 4 booked.');
  expect(ics).not.toMatch(/Aoife|Byrne|example\.ie|087/);

  // UX-VW-6: Change. With someone booked it moves as it is: the day and the start.
  await sheet.getByRole('button', { name: /^More for / }).click();
  await page.getByRole('menuitem', { name: 'Change' }).click();
  sheet = page.getByRole('dialog', { name: 'Change this time' });
  await expect(sheet.getByText('1 person is booked, so the length stays the same.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Until/ })).toHaveCount(0);
  const moved = isoDateInDays(8);
  await pickDate(page, 'Day', moved, sheet);
  await pickTime(page, 'From', '7pm', sheet);
  await expect(sheet.getByText(/^4 places, \w+day \d+ \w+, 7pm to 8pm$/)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'wp16-change-a-time-1280');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Viewing time moved. 1 person is being told' }),
  ).toBeVisible();
  await expect(timeOnCalendar(page, /^7pm to 8pm · 12 Ranelagh Road.*1 of 4 booked/)).toHaveCount(
    1,
  );
  // R13: she hears it has moved, in the fixed confirmation's words, and her booking stands.
  await expect(async () => {
    expect(
      (await subjectsSentTo(AOIFE)).filter((s) => s.startsWith('Viewing booked:')),
    ).toHaveLength(2);
  }).toPass({ timeout: 20_000 });
  await renter.page.reload();
  await expect(renter.page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await expect(renter.page.getByRole('status')).toContainText('7pm');

  // UX-VW-6: Cancel this time, with someone booked: first it needs another time to offer her.
  await addATime(page, isoDateInDays(10));
  await page.goto(`/calendar?day=${moved}`);
  await timeOnCalendar(page, /^7pm to 8pm · 12 Ranelagh Road/).click();
  sheet = page.getByRole('dialog', { name: /^\w+day \d+ \w+, 7pm to 8pm$/ });
  await sheet.getByRole('button', { name: /^More for / }).click();
  await page.getByRole('menuitem', { name: 'Cancel this time' }).click();
  sheet = page.getByRole('dialog', { name: 'Cancel this time?' });
  // It says what happens to her before it's done.
  await expect(
    sheet.getByText(
      '1 person is booked. Gaff emails them straight away with the other times, so they can book again. Their reminders for this time won’t go.',
    ),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'wp16-cancel-a-time-1280');
  await sheet.getByRole('button', { name: 'Cancel this time' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Viewing time cancelled. 1 person is being told' }),
  ).toBeVisible();
  // R11, R12: she's sent the invitation again, with the other times, and books one.
  let again = '';
  await expect(async () => {
    const subjects = await subjectsSentTo(AOIFE);
    expect(subjects.filter((s) => s === 'Book a viewing: 12 Ranelagh Road')).toHaveLength(2);
    again = await linkInEmail(AOIFE, 'Book a viewing: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  await renter.page.goto(again);
  await bookFirstTime(renter.page);
  await renter.context.close();

  // UX-VW-10: on the day, from 15 minutes before, Today and the sheet offer "Mark who came".
  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto('/today');
  await expect(
    page.getByRole('region', { name: 'Needs you' }).getByRole('link', { name: /^Mark who came/ }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'Viewings today' })
    .getByRole('link', { name: /12 Ranelagh Road/ })
    .click();
  sheet = page.getByRole('dialog', { name: /^\w+day \d+ \w+, / });
  await expect(sheet).toBeVisible();
  // It has started: it can't be changed or cancelled now.
  await expect(sheet.getByRole('button', { name: /^More for / })).toHaveCount(0);
  await sheet.getByRole('link', { name: 'Mark who came' }).click();

  // UX-VW-11: a focused screen: no navigation, who's booked, and one line of how many are left.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Mark who came' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByText('1 left to mark.')).toBeVisible();
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, `wp16-mark-who-came-${width}`);
  }
  const aoife = page.getByRole('group', { name: 'Did Aoife Byrne come?' });
  await aoife.getByRole('button', { name: 'Came' }).click();
  await expect(aoife.getByRole('button', { name: 'Came' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Everyone is marked.')).toBeVisible();
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
});

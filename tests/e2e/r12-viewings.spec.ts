import { devices, expect, test, type Browser } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import { expectRenterPageAtBothWidths } from './renter';
import {
  createLettingThroughUi,
  expectAccessible,
  expectFocusRings,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  linkInEmailStarting,
  screenshot,
  sendTestEmail,
  signUpOperator,
  subjectsSentTo,
} from './support';

const AOIFE = 'aoife.byrne@example.ie';
const CIARAN = 'ciaran.os@example.ie';

async function onPhone(browser: Browser, link: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const page = await context.newPage();
  await page.goto(link);
  return { context, page };
}

test('R10, R11, R12, R13, R14: a person decides who views; renters book, move and cancel; a freed place goes to the waiting list', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  const address = await gaffAddress(page);
  await sendTestEmail(page, { to: address, ...daftEnquiry });
  await sendTestEmail(page, { to: address, ...myhomeEnquiry, replyTo: '' });
  await expect(async () => {
    await linkInEmail(CIARAN, 'Your enquiry about 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });

  // R10, R11: the ranking, and a person decides. Aoife is invited; Ciarán goes on the waiting list.
  await page.goto(`${lettingUrl}/shortlist`);
  await expect(page.getByRole('heading', { name: 'Decide who views' })).toBeVisible();
  await page.getByLabel('Invite Ciarán Ó Súilleabháin').uncheck();
  await expect(page.getByLabel('Invite Aoife Byrne')).toBeChecked();
  await expectAccessible(page);
  await screenshot(page, '25-shortlist');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('1 invited to book a viewing, 1 on the waiting list')).toBeVisible();
  await expect(page.getByText('Waiting list', { exact: true })).toBeVisible();
  await screenshot(page, '26-shortlist-decided');

  // R12: Aoife books on her phone, from the invitation.
  let invitation = '';
  await expect(async () => {
    invitation = await linkInEmail(AOIFE, 'Book a viewing: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, invitation);
  const renter = aoife.page;
  // The invitation opens her own page: one thing to do, and one button.
  await expect(renter.getByRole('heading', { name: 'You’re invited to view' })).toBeVisible();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-invited' });
  await renter.getByRole('link', { name: 'Choose a time', exact: true }).click();

  // UX-RN-5: days with a place, then the chosen day's times as large buttons. Nothing to fill in.
  await expect(renter.getByRole('heading', { name: 'Choose a time' })).toBeVisible();
  const times = renter
    .getByRole('main')
    .getByRole('listitem')
    .getByRole('link', { name: /^\d{1,2}(:\d{2})?(am|pm)/ });
  await expect(times.first()).toBeVisible();
  await expect(renter.getByRole('main').locator('input, select, textarea')).toHaveCount(0);
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, '27-renter-choose-time');
  // ADR-0011: in both themes, a focus ring on everything; the dark theme passes axe too.
  await renter.reload();
  await expectFocusRings(renter);
  await renter.emulateMedia({ colorScheme: 'dark' });
  await renter.reload();
  await expectFocusRings(renter);
  await expectAccessible(renter);
  await screenshot(renter, '27-renter-choose-time-dark');
  await renter.emulateMedia({ colorScheme: 'light' });
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-choose-time' });

  // UX-RN-7: the confirm step: the day, time and address, and one optional field, empty (Q12).
  const firstTime = (await times.first().innerText()).split('\n')[0]!.trim();
  await times.first().click();
  await expect(renter.getByRole('heading', { name: 'Book this viewing?' })).toBeVisible();
  await expect(renter.getByText(new RegExp(`^\\w+day \\d+ \\w+, ${firstTime}$`))).toBeVisible();
  await expect(renter.getByText('12 Ranelagh Road, Ranelagh, Dublin 6')).toBeVisible();
  const mobile = renter.getByLabel('Mobile number for a text reminder');
  await expect(mobile).toHaveValue('');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-confirm-time' });
  // A number that isn't one is said at the field, and nothing is booked.
  await mobile.fill('12');
  await renter.getByRole('button', { name: 'Book this viewing' }).click();
  await expect(
    renter.getByText('That mobile number doesn’t look right. Check it, or leave it blank.'),
  ).toBeVisible();
  await expectAccessible(renter);
  await renter.getByLabel('Mobile number for a text reminder').fill('087 123 4567');
  await renter.getByRole('button', { name: 'Book this viewing' }).click();

  // UX-RN-8: booked is a confirmation: the time and address, the calendar, directions, and two
  // quiet actions. No form to move it unless she asks.
  await expect(renter.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  const booked = renter.getByRole('status');
  await expect(booked).toContainText(firstTime);
  await expect(booked).toContainText('12 Ranelagh Road, Ranelagh, Dublin 6');
  await expect(renter.getByText('text you two hours before')).toBeVisible();
  await expect(renter.getByRole('link', { name: 'Get directions' })).toBeVisible();
  await expect(renter.getByRole('main').locator('input, select, textarea')).toHaveCount(0);
  await expectAccessible(renter);
  await screenshot(renter, '28-renter-booked');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-booked' });
  // "Add to my calendar" is a calendar file for this viewing, with nothing about her in it.
  const calendar = await renter.request.get(
    (await renter.getByRole('link', { name: 'Add to my calendar' }).getAttribute('href'))!,
  );
  expect(calendar.headers()['content-type']).toContain('text/calendar');
  const file = await calendar.text();
  expect(file).toContain('SUMMARY:Viewing: 12 Ranelagh Road');
  expect(file).not.toMatch(/Aoife|Byrne|example\.ie|087|\/r\//);

  // R13: the confirmation arrives straight away.
  await expect(async () => {
    expect((await subjectsSentTo(AOIFE)).some((s) => s.startsWith('Viewing booked:'))).toBe(true);
  }).toPass({ timeout: 20_000 });

  // R12: she moves to another time. The number she gave is shown, not asked for again.
  await renter.getByRole('link', { name: 'Change the time' }).click();
  await expect(renter.getByRole('heading', { name: 'Change your viewing' })).toBeVisible();
  await expect(renter.getByText(new RegExp(`You’re booked for .*${firstTime}\\.`))).toBeVisible();
  const newTime = (await times.first().innerText()).split('\n')[0]!.trim();
  expect(newTime).not.toBe(firstTime);
  await times.first().click();
  await expect(renter.getByRole('heading', { name: 'Move to this time?' })).toBeVisible();
  await expect(renter.getByLabel('Mobile number for a text reminder')).toHaveCount(0);
  await expect(renter.getByText('087 123 4567')).toBeVisible();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-move-time' });
  await renter.getByRole('button', { name: 'Move my viewing' }).click();
  await expect(renter.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await expect(renter.getByRole('status')).toContainText(newTime);

  // Then she cancels: one screen that says what will happen, and then "cancelled" with one button.
  await renter.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(renter.getByRole('heading', { name: 'Cancel your viewing?' })).toBeVisible();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-cancel' });
  await renter.getByRole('button', { name: 'Cancel my viewing' }).click();
  // UX-RN-9: it says so, and offers "Book another time". No booking form unasked.
  await expect(renter.getByRole('heading', { name: 'Your viewing is cancelled' })).toBeVisible();
  await expect(renter.getByRole('link', { name: 'Book another time' })).toBeVisible();
  await expect(renter.getByRole('main').locator('input, select, textarea')).toHaveCount(0);
  await expectAccessible(renter);
  await screenshot(renter, '29-renter-cancelled');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-cancelled' });
  await aoife.context.close();

  // R14: the freed place goes to Ciarán, next on the waiting list, with a hold.
  let offer = '';
  await expect(async () => {
    offer = await linkInEmailStarting(CIARAN, 'A viewing place has opened up');
  }).toPass({ timeout: 20_000 });
  const ciaran = await onPhone(browser, offer);
  await expect(ciaran.page.getByRole('heading', { name: 'A place has opened up' })).toBeVisible();
  // UX-RN-10: when the hold ends, in words.
  await expect(
    ciaran.page.getByText(/^It’s yours until \d{1,2}(:\d{2})?(am|pm) (today|tomorrow)\.$/),
  ).toBeVisible();
  // UX-RN-6: one time on offer, so there is no picker: the page states it and the button takes it.
  await expect(ciaran.page.getByRole('radio')).toHaveCount(0);
  await expect(ciaran.page.getByRole('navigation', { name: 'Days with a place' })).toHaveCount(0);
  await expectAccessible(ciaran.page);
  await screenshot(ciaran.page, '30-renter-place-offered');
  await expectRenterPageAtBothWidths(ciaran.page, { shots: 'wp12-live-place-offered' });
  await ciaran.page.getByRole('button', { name: 'Take this place' }).click();
  await expect(ciaran.page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await ciaran.context.close();

  await page.goto(`${lettingUrl}/shortlist`);
  await expect(page.getByText('Booked', { exact: true })).toBeVisible();
  await expect(page.getByText('Invited', { exact: true })).toBeVisible();
});

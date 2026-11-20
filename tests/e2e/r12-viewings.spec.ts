import { devices, expect, test, type Browser } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import { flowAtBothWidths } from './journeys';
import { confirmMobileAndBook, expectRenterPageAtBothWidths, latestTextCodeFor } from './renter';
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

  // R10, R11, UX-DC-1 to UX-DC-6: from Today, a focused flow. The ranking, the top people
  // ticked, and a person decides. Aoife is invited; Ciarán goes on the waiting list.
  await page.goto('/today');
  await page.getByRole('link', { name: /^Choose who views · 12 Ranelagh Road/ }).click();
  await expect(page).toHaveURL(/\/who-views$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose who views' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  const aoifeRow = page.getByRole('checkbox', { name: 'Aoife Byrne', exact: true });
  const ciaranRow = page.getByRole('checkbox', { name: 'Ciarán Ó Súilleabháin', exact: true });
  // UX-DC-2: ticked up to the places, each tick the person's to change.
  await expect(aoifeRow).toBeChecked();
  await expect(page.getByText(/^\d+ places · 2 chosen$/)).toBeVisible();
  // UX-DC-1: the reason in words on tap, and "How Gaff ranks" once.
  await page.getByRole('button', { name: 'Why here: Aoife Byrne' }).click();
  await expect(page.getByText(/\. Enquired \w+day \d+ \w+, /).first()).toBeVisible();
  await expect(page.getByText(/\. Enquired \w+day \d+ \w+, /).nth(1)).toBeHidden();
  await expect(page.getByText('How Gaff ranks')).toHaveCount(1);
  await ciaranRow.uncheck();
  await expect(page.getByText(/^\d+ places · 1 chosen$/)).toBeVisible();
  await flowAtBothWidths(page, 'who-views');
  await screenshot(page, '25-shortlist');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 2: nothing has gone yet. UX-DC-4: fewer ticked than places, and it's said.
  await expect(page.getByRole('heading', { level: 1, name: 'Check and send' })).toBeVisible();
  await expect(
    page.getByText('You’re inviting 1 person. The next 1 go on the waiting list.'),
  ).toBeVisible();
  await expect(page.getByText(/places? won’t be offered\. Invite more\?/)).toBeVisible();
  // UX-DC-6: each fixed message can be read, and not edited.
  await page.getByText('See the message').first().click();
  await expect(page.getByLabel('Invited to book')).toContainText(
    'Book a viewing: 12 Ranelagh Road',
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await flowAtBothWidths(page, 'who-views-check');
  // UX-DC-3: the waiting list, changed on its own screen and never bigger than who's left.
  await page.getByRole('link', { name: 'Change On the waiting list' }).click();
  await expect(page.getByRole('heading', { name: 'How many on the waiting list?' })).toBeVisible();
  await expect(page.getByLabel('People on the waiting list')).toHaveValue('1');
  await page.getByLabel('People on the waiting list').fill('99');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Enter a number from 0 to 50.')).toBeVisible();
  await flowAtBothWidths(page, 'who-views-waitlist');
  await page.getByLabel('People on the waiting list').fill('10');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('You’re inviting 1 person. The next 1 go on the waiting list.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  // UX-FL-4: what was done, and what happens next.
  await expect(page.getByRole('heading', { name: 'Invitations sent' })).toBeVisible();
  await expect(page.getByText('1 invited to book a viewing, 1 on the waiting list')).toBeVisible();
  await expect(page.getByText('Gaff will tell you as people book.')).toBeVisible();
  await flowAtBothWidths(page, 'who-views-sent');
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

  // UX-RN-7: the confirm step: the day, time and address. P16 (Q51): a new booking asks for her
  // mobile, empty (Q12: the number from her enquiry is never filled in), to confirm by text code.
  const firstTime = (await times.first().innerText()).split('\n')[0]!.trim();
  await times.first().click();
  await expect(renter.getByRole('heading', { name: 'Book this viewing?' })).toBeVisible();
  await expect(renter.getByText(new RegExp(`^\\w+day \\d+ \\w+, ${firstTime}$`))).toBeVisible();
  await expect(renter.getByText('12 Ranelagh Road, Ranelagh, Dublin 6')).toBeVisible();
  const mobile = renter.getByLabel('Your mobile number');
  await expect(mobile).toHaveValue('');
  await expectRenterPageAtBothWidths(renter, { shots: 'p16-confirm-mobile' });
  // A number that isn't a mobile is said at the field, and nothing is sent.
  await mobile.fill('12');
  await renter.getByRole('button', { name: 'Text me a code' }).click();
  await expect(
    renter.getByText('That doesn’t look like a mobile number. Enter one like 087 123 4567.'),
  ).toBeVisible();
  await expectAccessible(renter);
  await renter.getByLabel('Your mobile number').fill('087 123 4567');
  await renter.getByRole('button', { name: 'Text me a code' }).click();
  // P16: the code screen: where it went, masked, and the six boxes.
  await expect(renter.getByRole('heading', { name: 'Enter the code we texted you' })).toBeVisible();
  await expect(renter.getByText(/to 087 ••• 4567\. It works for 10 minutes\./)).toBeVisible();
  await expectRenterPageAtBothWidths(renter, { shots: 'p16-mobile-code' });
  // A wrong code is said at the field, and nothing is booked.
  const right = await latestTextCodeFor('087 123 4567');
  await renter.getByLabel('The code from the text').fill(right === '000000' ? '111111' : '000000');
  await expect(
    renter.getByText('That code isn’t right. Check the text and try again.'),
  ).toBeVisible();
  await expectAccessible(renter);
  await renter.getByLabel('The code from the text').fill(right);

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
  await expect(renter.getByLabel('Your mobile number')).toHaveCount(0);
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
  // P16: he confirms a mobile first, then the code takes the place.
  await expect(ciaran.page.getByRole('heading', { name: 'Book this viewing?' })).toBeVisible();
  await expect(ciaran.page.getByRole('link', { name: 'Choose another time' })).toHaveCount(0);
  await confirmMobileAndBook(ciaran.page);
  await ciaran.context.close();

  // Ciarán has Aoife's place now; she cancelled.
  await page.goto(`${lettingUrl}/attendance`);
  await expect(page.getByText('Ciarán Ó Súilleabháin')).toBeVisible();
  await expect(page.getByText('Aoife Byrne')).toHaveCount(0);
});

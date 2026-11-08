import { devices, expect, test, type Browser } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
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
  await expect(aoife.page.getByRole('heading', { name: 'Choose a time to view' })).toBeVisible();
  await expectAccessible(aoife.page);
  await expectNoSidewaysScroll(aoife.page);
  await screenshot(aoife.page, '27-renter-choose-time');
  // ADR-0011: in both themes, a focus ring on everything; the dark theme passes axe too.
  await aoife.page.reload();
  await expectFocusRings(aoife.page);
  await aoife.page.emulateMedia({ colorScheme: 'dark' });
  await aoife.page.reload();
  await expectFocusRings(aoife.page);
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '27-renter-choose-time-dark');
  await aoife.page.emulateMedia({ colorScheme: 'light' });
  await aoife.page.getByRole('button', { name: 'Book this time' }).click();
  await expect(aoife.page.getByText('Choose a time first.')).toBeVisible();
  await aoife.page.getByRole('radio').first().check();
  await aoife.page.getByLabel('Mobile number for a text reminder').fill('087 123 4567');
  await aoife.page.getByRole('button', { name: 'Book this time' }).click();
  await expect(aoife.page.getByText('You’re booked')).toBeVisible();
  await expect(aoife.page.getByRole('heading', { name: 'Your viewing' })).toBeVisible();
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '28-renter-booked');

  // R13: the confirmation arrives straight away.
  await expect(async () => {
    expect((await subjectsSentTo(AOIFE)).some((s) => s.startsWith('Viewing booked:'))).toBe(true);
  }).toPass({ timeout: 20_000 });

  // R12: she moves to another time, then cancels.
  await aoife.page.getByRole('radio').first().check();
  await aoife.page.getByRole('button', { name: 'Move my viewing' }).click();
  await expect(aoife.page.getByText('Your viewing has moved')).toBeVisible();
  await aoife.page.getByRole('button', { name: 'Cancel my viewing' }).click();
  await expect(aoife.page.getByText('Your viewing is cancelled')).toBeVisible();
  await expect(aoife.page.getByRole('heading', { name: 'Choose a time to view' })).toBeVisible();
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '29-renter-cancelled');
  await aoife.context.close();

  // R14: the freed place goes to Ciarán, next on the waiting list, with a hold.
  let offer = '';
  await expect(async () => {
    offer = await linkInEmailStarting(CIARAN, 'A viewing place has opened up');
  }).toPass({ timeout: 20_000 });
  const ciaran = await onPhone(browser, offer);
  await expect(ciaran.page.getByText('A place has opened up')).toBeVisible();
  await expect(ciaran.page.getByText(/It’s held for you until \w+day \d+ \w+, /)).toBeVisible();
  await expect(ciaran.page.getByRole('radio')).toHaveCount(1);
  await expectAccessible(ciaran.page);
  await screenshot(ciaran.page, '30-renter-place-offered');
  await ciaran.page.getByRole('radio').check();
  await ciaran.page.getByRole('button', { name: 'Book this time' }).click();
  await expect(ciaran.page.getByText('You’re booked')).toBeVisible();
  await ciaran.context.close();

  await page.goto(`${lettingUrl}/shortlist`);
  await expect(page.getByText('Booked', { exact: true })).toBeVisible();
  await expect(page.getByText('Invited', { exact: true })).toBeVisible();
});

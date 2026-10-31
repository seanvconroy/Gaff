import { devices, expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
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

test('R15: the operator marks who came, on a phone, with one tap per person', async ({
  browser,
  page,
}) => {
  test.slow();
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page, '4 Harbour View');
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  await sendTestEmail(page, {
    to: await gaffAddress(page),
    ...daftEnquiry,
    subject: 'New enquiry: 4 Harbour View',
    text: daftEnquiry.text.replaceAll('12 Ranelagh Road, Ranelagh, Dublin 6', '4 Harbour View'),
  });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Aoife Byrne')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // Before anyone books, the tab says what will happen.
  await page.goto(`${lettingUrl}/attendance`);
  await expect(page.getByRole('heading', { name: 'Nobody has booked yet' })).toBeVisible();

  await page.goto(`${lettingUrl}/shortlist`);
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('1 invited to book a viewing')).toBeVisible();

  let invitation = '';
  await expect(async () => {
    invitation = await linkInEmail('aoife.byrne@example.ie', 'Book a viewing: 4 Harbour View');
  }).toPass({ timeout: 20_000 });
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto(invitation);
  await renter.getByRole('radio').first().check();
  await renter.getByRole('button', { name: 'Book this time' }).click();
  await expect(renter.getByText('You’re booked')).toBeVisible();

  // Before the viewing, the operator sees when they can mark it.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${lettingUrl}/attendance`);
  await expect(page.getByText(/^Mark from \d/)).toBeVisible();

  // On the day, at the door.
  await startViewingsNow('4 Harbour View', operator);
  await page.reload();
  const aoife = page.getByRole('group', { name: 'Did Aoife Byrne come?' });
  await expect(aoife.getByRole('button', { name: 'Came' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expectAccessible(page);
  await aoife.getByRole('button', { name: 'Came' }).click();
  await expect(aoife.getByRole('button', { name: 'Came' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 booked · 1 came · 0 didn’t come · 0 to mark')).toBeVisible();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await screenshot(page, '31-attendance-phone');

  // A wrong tap is put right with one more tap.
  await aoife.getByRole('button', { name: 'Didn’t come' }).click();
  await expect(aoife.getByRole('button', { name: 'Didn’t come' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await aoife.getByRole('button', { name: 'Came' }).click();
  await expect(aoife.getByRole('button', { name: 'Came' })).toHaveAttribute('aria-pressed', 'true');

  // The renter's page moves on, and the timeline shows the person's decisions.
  await renter.reload();
  await expect(renter.getByText('Thanks for coming to view')).toBeVisible();
  await expectAccessible(renter);
  await phone.close();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByText('Marked as came to the viewing').first()).toBeVisible();
  await expect(page.getByText('Marked as didn’t come')).toBeVisible();
});

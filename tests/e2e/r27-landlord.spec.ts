import { devices, expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

test('R27: the landlord gets a private read-only page, with renters shown only as "Applicant N"', async ({
  browser,
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
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('1 invited to book a viewing')).toBeVisible();

  // The operator makes the link on the Timeline tab. It's shown once, to copy.
  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByRole('heading', { name: 'Share with the landlord' })).toBeVisible();
  await page.getByRole('button', { name: 'Make a private link' }).click();
  const field = page.getByLabel('The landlord’s link');
  await expect(field).toHaveValue(/\/l\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  await expectAccessible(page);

  // The landlord, on their phone, with no account.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const landlord = await phone.newPage();
  await landlord.goto(link);
  await expect(landlord.getByRole('heading', { name: '12 Ranelagh Road' })).toBeVisible();
  await expect(landlord.getByText('Step 4 of 9 · Viewings')).toBeVisible();
  await expect(landlord.getByRole('cell', { name: 'Applicant 1', exact: true })).toBeVisible();
  await expect(landlord.getByText('Invited to view').first()).toBeVisible();
  expect(await landlord.content()).not.toMatch(/Aoife|Byrne|aoife\.byrne|087 123 4567|parking/i);
  await expectAccessible(landlord);
  await expectNoSidewaysScroll(landlord);
  await screenshot(landlord, '33-landlord-view');

  // The operator sees it's been opened, and can stop sharing at any time.
  await page.reload();
  await expect(page.getByText(/^Shared\. The landlord last opened it on /)).toBeVisible();
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByText('The landlord’s link no longer works.')).toBeVisible();
  await expect(page.getByText('Stopped sharing with the landlord')).toBeVisible();
  await landlord.reload();
  await expect(landlord.getByRole('heading', { name: 'This link isn’t working' })).toBeVisible();
  await phone.close();
});

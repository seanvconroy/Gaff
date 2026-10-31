import { devices, expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

test('R9: a renter answers the questions on their phone, with no account', async ({
  browser,
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });

  let link = '';
  await expect(async () => {
    link = await linkInEmail('aoife.byrne@example.ie', 'Your enquiry about 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });

  // The renter, on their phone, signed in to nothing.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto(link);
  await expect(renter.getByRole('heading', { name: '12 Ranelagh Road' })).toBeVisible();
  await expect(
    renter.getByRole('heading', { name: 'Hi Aoife, a few quick questions' }),
  ).toBeVisible();
  await expect(renter.getByText('everyone is asked the same few questions')).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, '23-renter-questions');

  await renter.getByRole('button', { name: 'Send my answers' }).click();
  await expect(renter.getByText('Choose how many people would live in the home')).toBeVisible();
  await expectAccessible(renter);

  await renter
    .getByLabel('How many people would live in the home, including you?')
    .selectOption('2');
  await renter.getByLabel('No', { exact: true }).check();
  await renter.getByRole('button', { name: 'Send my answers' }).click();
  await expect(renter.getByText('Thanks, Aoife')).toBeVisible();
  await expect(renter.getByText('Either way, you’ll hear back from us.')).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, '24-renter-thanks');
  await phone.close();

  // The operator sees the answers have arrived.
  await page.goto('/');
  await page.getByRole('link', { name: '12 Ranelagh Road' }).click();
  await page.getByRole('link', { name: 'Enquiries' }).click();
  await expect(page.getByText('Answered')).toBeVisible();
});

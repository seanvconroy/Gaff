import { expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

test('R28: the dashboard shows each letting’s stage, what needs a person today, and time against the usual', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await expect(page.getByText('No lettings yet')).toBeVisible();

  // A letting being set up needs finishing.
  await createLettingThroughUi(page);
  const lettingUrl = page
    .url()
    .replace(/\/viewings.*$/, '')
    .replace(/\?.*$/, '');
  await page.goto('/');
  const today = page.getByRole('region', { name: 'Needs you today' });
  await expect(
    today.getByRole('link', { name: '12 Ranelagh Road: finish setting up' }),
  ).toBeVisible();
  await expect(page.getByText('Step 1 of 9 · Set up')).toBeVisible();

  // Live, with an enquiry: a person decides who views.
  await page.goto(lettingUrl);
  await goLiveThroughUi(page);
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect(async () => {
    await page.goto('/');
    await expect(
      today.getByRole('link', { name: '12 Ranelagh Road: decide who views (1 person waiting)' }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText('Step 2 of 9 · Enquiries')).toBeVisible();

  // Q15: a minute of active use on the letting counts; the usual time comes from Settings.
  await page.clock.install();
  await page.goto(lettingUrl);
  await page.mouse.move(200, 200);
  const heartbeat = page.waitForResponse(
    (response) => response.url().endsWith('/api/activity') && response.status() === 204,
  );
  await page.clock.runFor(61_000);
  await heartbeat;

  await page.goto('/settings');
  await page.getByLabel('Hours of your time a letting usually takes').fill('6.5');
  await page.getByLabel('Days from advert to signed tenancy, usually').fill('30');
  await page.getByRole('button', { name: 'Save usual times' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/');
  await expect(
    page.getByText(
      /Your time in Gaff: 1 minute · usually 6 hours 30 minutes a letting · first enquiry today, usually let in 30 days/,
    ),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '32-dashboard');

  await today.getByRole('link', { name: /decide who views/ }).click();
  await expect(page.getByRole('heading', { name: 'Decide who views' })).toBeVisible();
});

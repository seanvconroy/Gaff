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
import { letAndClosed } from './today';

test('R28: Today shows what needs a person, Lettings shows each letting’s stage in words, and a closed home shows the time it saved against the usual', async ({
  page,
}) => {
  test.slow();
  const operator = await signUpOperator(page);
  await expect(page.getByRole('heading', { name: 'Add your first letting' })).toBeVisible();

  // A letting being set up needs finishing.
  await createLettingThroughUi(page);
  const lettingUrl = page
    .url()
    .replace(/\/viewings.*$/, '')
    .replace(/\?.*$/, '');
  await page.goto('/today');
  const today = page.getByRole('region', { name: 'Needs you' });
  await expect(
    today.getByRole('link', { name: /Finish setting up · 12 Ranelagh Road/ }),
  ).toBeVisible();
  // UX-NV-9, UX-NV-11: its stage is on Lettings, in words, with no "Step 1 of 9".
  await page.goto('/lettings');
  const settingUp = page.getByRole('list', { name: 'Setting up' });
  await expect(settingUp.getByRole('listitem')).toHaveText([/^12 Ranelagh Road\s*4 steps left/]);

  // Live, with an enquiry: a person decides who views.
  await page.goto(lettingUrl);
  await goLiveThroughUi(page);
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect(async () => {
    await page.goto('/today');
    await expect(
      today.getByRole('link', { name: /Choose who views · 12 Ranelagh Road/ }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(today.getByRole('listitem').first()).toContainText('1 person is waiting to hear');
  await page.goto('/lettings');
  await expect(page.getByRole('list', { name: 'Live' }).getByRole('listitem')).toHaveText([
    /^12 Ranelagh Road\s*Enquiries · 1 so far\s*Needs you$/,
  ]);

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

  // UX-HM-9: none of that is on the home screen, nor on a home that is still being let.
  await page.goto('/today');
  await expect(page.getByRole('main').getByText(/time in Gaff|usual/i)).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, '32-dashboard');
  await page.goto('/lettings');
  await expect(page.getByRole('main').getByText(/time in Gaff|usual|saved/i)).toHaveCount(0);

  await page.goto('/today');
  await today.getByRole('link', { name: /Choose who views/ }).click();
  await expect(page.getByRole('heading', { name: 'Decide who views' })).toBeVisible();

  // Once the home is let and closed, Lettings shows what it saved: the usual six and a half
  // hours, less the minute spent in Gaff.
  await letAndClosed('12 Ranelagh Road', operator);
  await page.goto('/lettings');
  await expect(
    page.getByRole('list', { name: 'Let', exact: true }).getByRole('listitem'),
  ).toHaveText([/^12 Ranelagh Road\s*Let · saved 6 hours 29 minutes/]);
  await expectAccessible(page);
  await screenshot(page, '32-lettings-closed');
});

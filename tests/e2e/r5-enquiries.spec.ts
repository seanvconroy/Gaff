import { expect, test } from '@playwright/test';
import { daftEnquiry, gmailForwardingConfirmation } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

test('R5: an operator finds their Gaff address and how to forward enquiries to it', async ({
  page,
}) => {
  await signUpOperator(page, 'Halcyon Lettings');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Your Gaff address' })).toBeVisible();
  await expect(page.getByText(/^halcyon-lettings(-\d+)?@in\.gaff\.test$/)).toBeVisible();
  await expect(page.getByText('Set up forwarding once')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '17-gaff-address');
});

test('R6: enquiries are read, matched to the home and merged; anything else waits for the operator', async ({
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  const overview = page.url().replace(/\?.*$/, '');
  const to = await gaffAddress(page);

  await sendTestEmail(page, { to, ...daftEnquiry });
  await sendTestEmail(page, { to, ...gmailForwardingConfirmation });

  await expect(async () => {
    await page.goto(`${overview}/enquiries`);
    await expect(page.getByRole('heading', { name: '1 enquiry' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole('cell', { name: 'Aoife Byrne' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Daft', exact: true })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '18-enquiries');

  // R7: the worker has already sent the first reply, as the AI assistant. Other journeys share
  // the development outbox, so look only at mail from this operator.
  const slug = to.split('@')[0]!;
  const firstReply = page
    .locator('article')
    .filter({ hasText: `<${slug}@` })
    .filter({ has: page.getByRole('heading', { name: 'Your enquiry about 12 Ranelagh Road' }) });
  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(firstReply).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(firstReply.getByText('To aoife.byrne@example.ie')).toBeVisible();
  await expect(firstReply.getByText(/I’m Halcyon Lettings’ AI assistant/)).toBeVisible();
  await screenshot(page, '20-first-reply');

  await page.goto('/');
  await expect(page.getByText('1 email needs your attention')).toBeVisible();
  await page.getByRole('link', { name: 'See what needs you' }).click();
  await expect(page.getByText('It might be a forwarding confirmation')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '19-needs-attention');
  await page.getByRole('button', { name: 'It’s not an enquiry' }).click();
  await expect(page.getByText('Nothing needs you right now')).toBeVisible();
});

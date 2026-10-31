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

test('R8 and R29: the AI answers from the facts, a person approves, and answers what it can’t', async ({
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  const to = await gaffAddress(page);
  await sendTestEmail(page, {
    to,
    ...daftEnquiry,
    text: daftEnquiry.text.replace(
      'Hi, is the apartment still available? Is there parking?\nThanks, Aoife',
      'Hi, is it furnished? Is there a garden?\nThanks, Aoife',
    ),
  });

  // R29: the AI's answer waits for approval.
  await expect(async () => {
    await page.goto('/approvals');
    await expect(page.getByRole('heading', { name: /Aoife Byrne asked about/ })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByLabel('The AI’s draft')).toHaveValue(
    /You asked: Is it furnished\?\nFurnishing: Furnished\./,
  );
  await expectAccessible(page);
  await screenshot(page, '21-approvals');
  await page.getByRole('button', { name: 'Approve and send' }).click();
  await expect(page.getByText('Approved. It’s on its way.')).toBeVisible();

  // R8: the garden question wasn't in the facts, so it's for a person.
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await expect(page.getByText('Is there a garden?')).toBeVisible();
  await expect(page.getByText('Gaff doesn’t have this in the home’s facts.')).toBeVisible();
  await page.getByLabel('Your answer').fill('Yes, a small back garden with a shed.');
  await expectAccessible(page);
  await screenshot(page, '22-questions');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(
    page.getByText('Sent. Gaff will use your answer next time someone asks.'),
  ).toBeVisible();

  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(page.getByText(/Yes, a small back garden with a shed\./)).toBeVisible({
      timeout: 1000,
    });
    await expect(page.getByText(/Furnishing: Furnished\./)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
});

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

test('R8, R29 and UX-NV-2: the AI answers from the facts, a person approves in two taps from Today, and answers what it can’t', async ({
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

  // R29: the AI's answer waits for approval. UX-NV-2: it is one row on Today, which opens the
  // renter's conversation in Inbox with the draft in the reply box.
  const row = page.getByRole('link', { name: /Approve 1 answer · 12 Ranelagh Road/ });
  await expect(async () => {
    await page.goto('/today');
    await expect(row).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await row.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Aoife Byrne' })).toBeVisible();
  const reply = page.getByRole('region', { name: 'Reply to Aoife' });
  // UX-AI-1: what the AI drafted says so. UX-AI-11: it answers in a sentence, from the fact.
  await expect(reply.getByText('Drafted by AI')).toBeVisible();
  await expect(
    reply.getByText(/You asked: Is it furnished\?\s+Yes, it’s furnished\./),
  ).toBeVisible();
  // R8: the garden question wasn't in the facts, so it's for a person, marked in the draft.
  await expect(reply.getByLabel('Gaff doesn’t know: Is there a garden?')).toBeVisible();
  await expectAccessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, '21-approvals');
  // The second tap: nothing else is needed to send what Gaff could answer.
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').getByText('Sent')).toBeVisible();

  // R8: the garden question is still the person's to answer, in the same conversation. Their
  // answer is remembered for the home unless they untick it (UX-NV-16).
  await expect(reply.getByText('Drafted by AI')).toHaveCount(0);
  // The toast goes on its own, so the next "Sent" is a new one.
  await expect(page.getByRole('status').getByText('Sent')).toHaveCount(0, { timeout: 10_000 });
  await reply
    .getByLabel('Gaff doesn’t know: Is there a garden?')
    .fill('Yes, a small back garden with a shed.');
  await expect(reply.getByLabel('Remember this for 12 Ranelagh Road')).toBeChecked();
  await expectAccessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, '22-questions');
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').getByText('Sent')).toBeVisible();
  // Nothing is waiting any more: the reply box is for writing to her.
  await expect(page.getByRole('region', { name: 'Write to Aoife' })).toBeVisible();

  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(page.getByText(/Yes, a small back garden with a shed\./)).toBeVisible({
      timeout: 1000,
    });
    await expect(page.getByText(/Yes, it’s furnished\./)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
});

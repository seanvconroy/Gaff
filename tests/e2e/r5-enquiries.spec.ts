import { expect, test } from '@playwright/test';
import { expectAccessible, screenshot, signUpOperator } from './support';

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

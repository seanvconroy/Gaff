import { expect, test } from '@playwright/test';
import {
  createLettingThroughUi,
  expectAccessible,
  goLiveThroughUi,
  makeStaff,
  screenshot,
  signIn,
  signUpOperator,
  uniqueEmail,
} from './support';

test('Test copy: an admin makes someone a tester, who can then open the staff pages', async ({
  browser,
  page,
}) => {
  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  const partnerEmail = uniqueEmail('partner');
  await signIn(partner, partnerEmail);

  const adminEmail = uniqueEmail('founder');
  await signIn(page, adminEmail);
  await makeStaff(adminEmail, 'admin');
  await page.goto('/staff/testers');
  await expect(page.getByRole('heading', { name: 'Testers' })).toBeVisible();
  await page.getByLabel('Their email').fill(uniqueEmail('nobody'));
  await page.getByRole('button', { name: 'Add tester' }).click();
  await expect(page.getByText('There’s no account with that email yet.')).toBeVisible();

  await page.getByLabel('Their email').fill(partnerEmail);
  await page.getByRole('button', { name: 'Add tester' }).click();
  await expect(page.getByText('Done. They’re a tester now')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: partnerEmail });
  await expect(row).toContainText('Admin');
  await expectAccessible(page);
  await screenshot(page, 'test-copy-testers');

  await partner.goto('/staff/checks');
  await expect(partner.getByRole('heading', { name: 'Licence checks' })).toBeVisible();
  await expect(partner.getByRole('link', { name: 'Testers' })).toBeVisible();

  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Done. They’re no longer a tester.')).toBeVisible();
  await partner.goto('/staff/checks');
  await expect(partner.getByRole('heading', { name: 'Licence checks' })).toHaveCount(0);
  await partnerContext.close();
});

test('Test copy: made-up renters enquire about a letting with one press', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page, '9 Orchard Row', '', 'Rathmines, Dublin 6');
  await goLiveThroughUi(page);
  const overview = page.url().replace(/\?.*$/, '');
  await page.goto(`${overview}/enquiries`);
  await page.getByRole('button', { name: 'Add test enquiries' }).click();
  await expect(page.getByText('5 made-up renters have enquired.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '5 enquiries' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'MyHome' }).first()).toBeVisible();
  await expect(page.getByText('Answered')).toHaveCount(4);
  await expectAccessible(page);
  await screenshot(page, 'test-copy-enquiries');
});

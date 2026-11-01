import { expect, test } from '@playwright/test';
import { AOIFE, anAcceptedOffer, onPhone } from './journeys';
import { expectAccessible, expectNoSidewaysScroll, linkInEmail, screenshot } from './support';

test('R22: the tenant reads and signs the agreement on their phone, then the operator signs for the landlord', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl } = await anAcceptedOffer(browser, page);
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'Tenancy agreement' })).toBeVisible();
  await expect(page.getByText('Step 8 of 9 · Tenancy')).toBeVisible();
  await expectAccessible(page);
  // The agreement must name the landlord: this agency adds them first.
  await page.getByLabel('Landlord’s name').fill('Tom Walsh');
  await page.getByLabel('Landlord’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save the landlord’s details' }).click();
  await page.getByRole('button', { name: 'Send to Aoife to sign' }).click();
  await expect(page.getByText('Waiting for them to sign.')).toBeVisible();

  let agreementLink = '';
  await expect(async () => {
    agreementLink = await linkInEmail(AOIFE, '12 Ranelagh Road: your tenancy agreement to sign');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, agreementLink);
  const tenant = aoife.page;
  await expect(
    tenant.getByRole('heading', { name: 'Tenancy agreement: 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(tenant.getByText(/€1,850 a month, paid in advance on the 1st day/)).toBeVisible();
  await expectAccessible(tenant);
  await expectNoSidewaysScroll(tenant);
  await screenshot(tenant, '43-tenant-agreement');
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrnes');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(
    tenant.getByText('Type your name as it is on the agreement: Aoife Byrne.'),
  ).toBeVisible();
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrne');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(tenant.getByText('Thanks, you’ve signed')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Aoife has signed')).toBeVisible();
  await page.getByLabel('Type your full name to sign').fill('Ann Power');
  await page.getByLabel(/I agree to sign this agreement electronically, for the landlord/).check();
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(page.getByText('Signed by both sides')).toBeVisible();

  await tenant.reload();
  await expect(tenant.getByText(/signed electronically by Aoife Byrne on/)).toBeVisible();
  await expect(tenant.getByText(/signed by Ann Power for Halcyon Lettings on/)).toBeVisible();
  await expectAccessible(tenant);
  await aoife.context.close();
});

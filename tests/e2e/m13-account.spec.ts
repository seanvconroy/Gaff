import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectAccessible, signIn, uniqueEmail } from './support';

test('M13: a renter downloads their data and deletes their account themselves', async ({
  page,
}) => {
  const email = uniqueEmail('orla');
  await signIn(page, email);
  await page.getByLabel('Your first name').fill('Orla');
  await page.getByRole('button', { name: 'Start looking' }).click();
  await expect(page.getByRole('heading', { name: 'Your homes' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Your account' })
    .getByRole('link', { name: 'Account' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expectAccessible(page);

  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download my data' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('my-gaff-data.json');
  const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(data).toMatchObject({ account: { email }, profile: { givenName: 'Orla' } });

  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Tick the box to confirm, then delete.')).toBeVisible();
  await page.getByLabel('I understand this can’t be undone.').check();
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Your account is deleted')).toBeVisible();
  await page.goto('/my');
  await expect(page).toHaveURL(/\/sign-in$/);
});

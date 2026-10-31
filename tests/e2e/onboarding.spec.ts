import { expect, test } from '@playwright/test';
import { expectAccessible, screenshot, signIn, uniqueEmail } from './support';

test('a new operator signs in by email link and sets up their workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '01-sign-in');

  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Enter your work email address')).toBeVisible();
  await expectAccessible(page);

  const email = uniqueEmail();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '02-welcome');

  await page.getByLabel('Your name').fill('Ann Power');
  await page.getByLabel('Other people: we are a letting agency').check();
  await page.getByLabel('Name of your agency or business').fill('Halcyon Lettings');
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByText('Enter your PSRA licence number')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '03-welcome-error');

  await page.getByLabel('PSRA licence number').fill('001234');
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your lettings' })).toBeVisible();
  await expect(page.getByText('Ann Power · Halcyon Lettings')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '04-dashboard-empty');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

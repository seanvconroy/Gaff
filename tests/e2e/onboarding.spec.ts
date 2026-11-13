import { expect, test } from '@playwright/test';
import { chooseLetting, expectAccessible, screenshot, signIn, uniqueEmail } from './support';

test('AU3: a new letter signs in with an emailed code and sets up their workspace', async ({
  page,
}) => {
  // Signed out, Gaff opens on the homes to rent; letters sign in from there.
  await page.goto('/');
  await expect(page).toHaveURL(/\/to-rent$/);
  await page
    .getByRole('navigation', { name: 'Gaff' })
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '01-sign-in');

  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await expect(page.getByText('Enter your email address, like')).toBeVisible();
  await expectAccessible(page);

  const email = uniqueEmail();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'What brings you to Gaff?' })).toBeVisible();
  await expectAccessible(page);
  await chooseLetting(page);
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

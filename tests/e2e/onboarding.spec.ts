import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  openAccountMenu,
  screenshot,
  setUpAgency,
  signIn,
  uniqueEmail,
} from './support';

test('a new operator signs in by email code and sets up their agency through first run', async ({
  page,
}) => {
  // A signed-out visitor who asks for the letting side is sent to sign in.
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '01-sign-in');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Enter an email address, like ann@example.ie')).toBeVisible();
  await expectAccessible(page);

  // UX-SI-8: no profile yet, so first run starts. One question per screen (UX-AC-6).
  const email = uniqueEmail();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole('heading', { name: 'Let’s get you started. What’s your name?' }),
  ).toBeVisible();
  // The old card is gone: no workspace to set up, no business name, no licence to type.
  await expect(page.getByText(/Set up your workspace|PSRA licence number/)).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, '02-welcome');

  // Pressing Continue with no name marks the field, with no box at the top (UX-FL-3).
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '03-welcome-error');

  // Their name, "I work at a letting agency", the agency, "Yes, that's us": then Today.
  await setUpAgency(page, email);
  await expect(page).toHaveURL(/\/today$/);
  await expectAccessible(page);
  await screenshot(page, '04-dashboard-empty');

  // UX-NV-8: who is signed in, and Sign out, are in the account menu on the avatar.
  const menu = await openAccountMenu(page);
  await expect(page.getByText('Ann Power · Halcyon Lettings')).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

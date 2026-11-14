import { expect, test } from '@playwright/test';
import {
  addPasskeyDevice,
  ageSignIn,
  enterEmailedCode,
  expectAccessible,
  latestEmailFor,
  passkeysByButtonOnly,
  screenshot,
  signIn,
  uniqueEmail,
} from './support';

test('AU6: someone adds a passkey, and signs in with it and nothing else', async ({ page }) => {
  await addPasskeyDevice(page);
  const email = uniqueEmail('orla');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);

  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'How you sign in' })).toBeVisible();
  await expect(page.getByText(`You’re signed in as ${email}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(
    page.getByText('Your passkey is added. Next time, choose “Sign in with a passkey”.'),
  ).toBeVisible();
  const passkeys = page.getByRole('region', { name: 'Passkeys' });
  await expect(
    passkeys.getByText('Kept in your password manager, so it’s on all your devices.'),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au6-passkey-added');
  const told = await latestEmailFor(email);
  expect(told.subject).toBe('A passkey was added to your Gaff account');
  expect(told.text).toContain('If it wasn’t, sign in, remove it under “How you sign in”');

  // A name they'll recognise.
  await passkeys.getByText('Rename “Passkey”').click();
  await passkeys.getByLabel('A name you’ll recognise').fill('Orla’s laptop');
  await passkeys.getByRole('button', { name: 'Save the name' }).click();
  await expect(page.getByText('Renamed.')).toBeVisible();
  await expect(passkeys.getByText('Orla’s laptop', { exact: true })).toBeVisible();

  // Signed out, the passkey alone signs them in: no email, no password, no code. The sign-in
  // page offers it in the email box's suggestions, and Chrome's stand-in device picks it at once.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await expect(page).toHaveURL(/\/welcome$/);

  // And from the button, in a browser that doesn't offer suggestions.
  await passkeysByButtonOnly(page);
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au6-sign-in-with-passkey');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  await page.goto('/account/security');
  // This device comes first; the earlier passkey sign-in is listed below it.
  const devices = page.getByRole('region', { name: 'Signed-in devices' });
  const thisDevice = devices.getByRole('listitem').first();
  await expect(thisDevice).toContainText('This device');
  await expect(thisDevice).toContainText(/Signed in with a passkey on /);

  // Removed, it no longer signs anyone in, and the page says what to do instead.
  await passkeys.getByRole('button', { name: 'Remove “Orla’s laptop”' }).click();
  await expect(page.getByText('That passkey is removed.')).toBeVisible();
  await expect(passkeys.getByText('Orla’s laptop', { exact: true })).toBeHidden();
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(
    page.getByText(
      'That passkey didn’t sign you in. It may have been removed from your account. Try again, or sign in another way.',
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectAccessible(page);
});

test('AU6: a passkey kept on one device says so, and a second one for the same device is refused', async ({
  page,
}) => {
  await addPasskeyDevice(page, false);
  const email = uniqueEmail('orla');
  await signIn(page, email);
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Your passkey is added.')).toBeVisible();
  await expect(page.getByText('On one device only.')).toBeVisible();

  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(
    page.getByText('This device already has a passkey for your Gaff account. It’s in the list.'),
  ).toBeVisible();
  await expectAccessible(page);
});

test('AU7: changing how you sign in asks to confirm it’s you, when the sign-in is over an hour old', async ({
  page,
}) => {
  await addPasskeyDevice(page);
  const email = uniqueEmail('orla');
  await signIn(page, email);
  await ageSignIn(email, 61);

  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/confirm\?next=%2Faccount%2Fsecurity$/);
  // Only the ways this account has: a code by email, to the address it already knows.
  await expect(page.getByLabel('Your email address')).toHaveValue(email);
  await expect(page.getByLabel('Your email address')).not.toBeEditable();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, 'au7-confirm-its-you');

  await page.getByRole('button', { name: 'Email me a code' }).click();
  await enterEmailedCode(page, email);
  // Back to what they were doing, and now it goes through.
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Your passkey is added.')).toBeVisible();

  // With a passkey, confirming is one touch.
  await ageSignIn(email, 61);
  await page.getByRole('button', { name: 'Remove “Passkey”' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByRole('button', { name: 'Remove “Passkey”' }).click();
  await expect(page.getByText('That passkey is removed.')).toBeVisible();
});

test('M5: the door to Gaff’s own tools takes a passkey and nothing else', async ({ page }) => {
  await addPasskeyDevice(page);
  const email = uniqueEmail('orla');
  await signIn(page, email);

  // Staff with no passkey are sent here to add one.
  await page.goto('/account/security?need=passkey');
  await expect(
    page.getByText(
      'Gaff’s own tools need a passkey. Add one under “Passkeys” below, then open the tools again and sign in with it.',
    ),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Your passkey is added.')).toBeVisible();

  // Then to sign in with it: no email, no code, no Google.
  await page.goto('/account/confirm?with=passkey&next=%2Faccount%2Fsecurity');
  await expect(page.getByRole('heading', { name: 'Sign in with your passkey' })).toBeVisible();
  await expect(page.getByLabel('Your email address')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(1);
  await expectAccessible(page);
  await screenshot(page, 'm5-staff-passkey');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(
    page.getByRole('region', { name: 'Signed-in devices' }).getByRole('listitem').first(),
  ).toContainText(/Signed in with a passkey on /);
});

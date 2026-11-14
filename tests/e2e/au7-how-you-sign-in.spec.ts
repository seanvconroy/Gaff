import { expect, test } from '@playwright/test';
import {
  chooseAtProvider,
  enterEmailedCode,
  expectAccessible,
  expectFocusRings,
  expectNoSidewaysScroll,
  latestEmailFor,
  madeUpAt,
  screenshot,
  signIn,
  uniqueEmail,
} from './support';

const PASSWORD = 'the bins go out on tuesday';
const NEW_PASSWORD = 'a different sentence entirely';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

test('AU7: someone who signs in with a code adds a password, then changes it', async ({ page }) => {
  const email = uniqueEmail('cathal');
  await signIn(page, email);
  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'How you sign in' })).toBeVisible();
  await expectFocusRings(page);
  await expectAccessible(page);
  await screenshot(page, 'au7-how-you-sign-in');

  const ways = page.getByRole('region', { name: 'Ways to sign in' });
  await expect(ways.getByText(`We email a 6-digit code to ${email}.`)).toBeVisible();
  await expect(ways.getByText('You haven’t set one.')).toBeVisible();

  // A password everyone knows is refused, with no blame; a good one is added.
  await ways.getByText('Add a password').click();
  await ways.getByLabel('Choose a password').fill('password1234');
  await ways.getByRole('button', { name: 'Add this password' }).click();
  await expect(
    ways.getByText('This password has appeared in a data breach, so it isn’t safe to use.'),
  ).toBeVisible();
  await expectAccessible(page);
  await ways.getByLabel('Choose a password').fill(PASSWORD);
  await ways.getByRole('button', { name: 'Add this password' }).click();
  await expect(
    page.getByText('Your password is added. You can sign in with it from now on.'),
  ).toBeVisible();
  await expect(ways.getByText('You have a password.')).toBeVisible();
  expect((await latestEmailFor(email)).subject).toBe('A password was added to your Gaff account');

  // Changing it needs the current one.
  await ways.getByText('Change your password').click();
  await ways.getByLabel('Your current password').fill('not the right one at all');
  await ways.getByLabel('Your new password').fill(NEW_PASSWORD);
  await ways.getByRole('button', { name: 'Change my password' }).click();
  await expect(ways.getByText('That isn’t your current password. Try again.')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au7-change-password');
  await ways.getByLabel('Your current password').fill(PASSWORD);
  await ways.getByLabel('Your new password').fill(NEW_PASSWORD);
  await ways.getByRole('button', { name: 'Change my password' }).click();
  await expect(
    page.getByText('Your password is changed, and your other devices have been signed out.'),
  ).toBeVisible();
  const told = await latestEmailFor(email);
  expect(told.subject).toBe('Your Gaff password was changed');

  // The new one signs them in.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU7: someone connects Google, signs in with it, and disconnects it', async ({ page }) => {
  const email = uniqueEmail('cathal');
  await signIn(page, email);
  await page.goto('/account/security');
  const ways = page.getByRole('region', { name: 'Ways to sign in' });
  await expect(ways.getByText('Not connected.')).toHaveCount(2);

  // Cancelling changes nothing, and says so.
  await ways.getByRole('button', { name: 'Connect Google' }).click();
  await expect(page.getByRole('heading', { name: 'Stand-in for Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByText('Connecting Google was cancelled. Nothing has changed.'),
  ).toBeVisible();
  await expectAccessible(page);

  // Their Google account has another address: fine, because they're signed in.
  const atGoogle = madeUpAt('gmail.com');
  await ways.getByRole('button', { name: 'Connect Google' }).click();
  await chooseAtProvider(page, 'Google', atGoogle);
  await expect(
    page.getByText('Google is connected. You can sign in with it from now on.'),
  ).toBeVisible();
  await expect(ways.getByText(/^Connected on \w+ \d{1,2} \w+\.$/)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au7-google-connected');
  expect((await latestEmailFor(email)).subject).toBe('Google was connected to your Gaff account');

  // It signs them in to this account, not a new one.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAtProvider(page, 'Google', atGoogle);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.goto('/account/security');
  await expect(page.getByText(`You’re signed in as ${email}.`)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Signed-in devices' }).getByText(/Signed in with Google on /),
  ).toBeVisible();

  await ways.getByRole('button', { name: 'Disconnect Google' }).click();
  await expect(
    page.getByText('Disconnected. It can’t be used to sign in to this account any more.'),
  ).toBeVisible();
  await expect(ways.getByText('Not connected.')).toHaveCount(2);
});

test('AU4, AU7: a Google account that’s another Gaff account’s way in can’t be connected', async ({
  page,
}) => {
  // Someone made a Gaff account with this Google account.
  const taken = madeUpAt('gmail.com');
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAtProvider(page, 'Google', taken);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.context().clearCookies();

  await signIn(page, uniqueEmail('cathal'));
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Connect Google' }).click();
  await chooseAtProvider(page, 'Google', taken);
  await expect(
    page.getByText(
      'That Google account is already used by another Gaff account. To use it here, sign in to that account and disconnect it first.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Ways to sign in' }).getByText('Not connected.'),
  ).toHaveCount(2);
  await expectAccessible(page);
});

test('AU8: someone sees where they’re signed in, and signs the other devices out', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('cathal');
  await signIn(page, email);

  const phoneContext = await browser.newContext({ userAgent: IPHONE });
  const phone = await phoneContext.newPage();
  await signIn(phone, email);

  await page.goto('/account/security');
  const devices = page.getByRole('region', { name: 'Signed-in devices' });
  await expect(devices.getByRole('listitem')).toHaveCount(2);
  await expect(devices.getByRole('listitem').first()).toContainText('This device');
  await expect(devices.getByText('Safari on an iPhone', { exact: true })).toBeVisible();
  await expect(devices.getByText(/Signed in with a code by email on /).first()).toBeVisible();
  // With one other device, its own button is enough.
  await expect(page.getByRole('button', { name: 'Sign out everywhere else' })).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, 'au8-signed-in-devices');

  await devices.getByRole('button', { name: 'Sign out Safari on an iPhone' }).click();
  await expect(page.getByText('That device is signed out.')).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  await phone.goto('/account/security');
  await expect(phone).toHaveURL(/\/sign-in\?next=%2Faccount%2Fsecurity$/);

  // Two other devices: one button signs both out.
  await signIn(phone, email);
  const tabletContext = await browser.newContext({ userAgent: IPHONE.replace('iPhone;', 'iPad;') });
  const tablet = await tabletContext.newPage();
  await signIn(tablet, email);
  await page.reload();
  await expect(devices.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
  await expect(page.getByText('Every other device is signed out.')).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  await tablet.goto('/account/security');
  await expect(tablet).toHaveURL(/\/sign-in\?/);
  await phoneContext.close();
  await tabletContext.close();
});

test('AU7, AU13: “How you sign in” fits a phone and works without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 640 },
  });
  const page = await context.newPage();
  // A long address, with nowhere to break: it wraps rather than widening the page.
  const email = uniqueEmail('cathal.osullivan-fitzgerald.lettings');
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expectNoSidewaysScroll(page);
  await enterEmailedCode(page, email);

  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'How you sign in' })).toBeVisible();
  await expectNoSidewaysScroll(page);
  // Passkeys need JavaScript, and the page says so rather than showing a button that does nothing.
  // (The line is in a <noscript>, which this browser keeps in the page but doesn't lay out.)
  expect(await page.content()).toContain('Adding a passkey needs JavaScript.');
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toHaveCount(0);

  await page.getByText('Add a password').click();
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Add this password' }).click();
  await expect(
    page.getByText('Your password is added. You can sign in with it from now on.'),
  ).toBeVisible();
  await context.close();
});

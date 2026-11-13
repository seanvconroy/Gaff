import { expect, test, type Page } from '@playwright/test';
import {
  enterEmailedCode,
  expectAccessible,
  latestCodeFor,
  latestEmailFor,
  screenshot,
  signIn,
  signUpOperator,
  uniqueEmail,
} from './support';

const PASSWORD = 'the bins go out on tuesday';
const NEW_PASSWORD = 'a different sentence entirely';

async function createAccount(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Choose a password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await enterEmailedCode(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
}

async function signOutFromWelcome(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/sign-in');
}

test('AU1, AU2: someone creates an account with a password, and a code confirms their email', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au1-create-account');

  // A password that's too short, then one everyone knows: each says what to do, with no blame.
  const email = uniqueEmail('niamh');
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Choose a password').fill('too short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByText('Use at least 12 characters. A short sentence works well.'),
  ).toHaveCount(1);
  await expect(page.getByLabel('Your email address')).toHaveValue(email);
  await expectAccessible(page);
  await page.getByLabel('Choose a password').fill('password1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByText('This password has appeared in a data breach, so it isn’t safe to use.'),
  ).toBeVisible();
  await screenshot(page, 'au1-create-account-breached');

  // Show lets them check what they typed.
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await expect(page.getByLabel('Choose a password')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Choose a password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await expect(page.getByText(`We’ve sent an email to ${email}.`)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au2-confirm-email');
  const sent = await latestEmailFor(email);
  expect(sent.subject).toMatch(/^\d{6} is your code to finish setting up Gaff$/);
  expect(sent.text).toContain('Nobody from Gaff will ever ask you for this code.');

  // A wrong code says so, and how to get another.
  const code = await latestCodeFor(email);
  await page.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText('That code isn’t right, or it’s more than 10 minutes old.'),
  ).toBeVisible();
  await expectAccessible(page);

  // The right one, pasted with a space in it, confirms the email and signs them in.
  await page.getByLabel('6-digit code').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'What brings you to Gaff?' })).toBeVisible();

  // From now on the password signs them in.
  await signOutFromWelcome(page);
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU3: a wrong password and an unknown email get the same answer', async ({ page }) => {
  const email = uniqueEmail('cormac');
  await createAccount(page, email);
  await signOutFromWelcome(page);

  const sameAnswer = page.getByText(
    'That email and password don’t match. Try again, reset your password, or email yourself a code.',
  );
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(sameAnswer).toBeVisible();
  await expect(page.getByLabel('Your email address')).toHaveValue(email);
  await expectAccessible(page);
  await screenshot(page, 'au3-sign-in-wrong');

  await page.getByLabel('Your email address').fill(uniqueEmail('nobody'));
  await page.getByLabel('Password', { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(sameAnswer).toBeVisible();

  // No password typed: it asks for one, or offers the code.
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByText('Enter your password, or email yourself a code instead'),
  ).toBeVisible();
  await expectAccessible(page);
});

test('AU4: creating an account with an email that has one says the same, and emails its owner', async ({
  page,
}) => {
  const email = uniqueEmail('orla');
  await createAccount(page, email);
  await signOutFromWelcome(page);

  await page.goto('/sign-up');
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Choose a password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  // The same page as for a new address: nothing here says the address has an account.
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await expect(page.getByText(`We’ve sent an email to ${email}.`)).toBeVisible();

  const sent = await latestEmailFor(email);
  expect(sent.subject).toBe('You already have a Gaff account');
  expect(sent.text).toContain('/sign-in');

  // And the password hasn't changed.
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU5: a forgotten password is reset with a code, and every other device is signed out', async ({
  browser,
  page,
}) => {
  const email = uniqueEmail('dara');
  await createAccount(page, email);

  // On another device, they've forgotten the password.
  const other = await (await browser.newContext()).newPage();
  await other.goto('/sign-in');
  await other.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(other.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expectAccessible(other);
  await other.getByLabel('Your email address').fill(email);
  await other.getByRole('button', { name: 'Email me a code' }).click();

  await expect(other.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(
    other.getByText(`If there’s a Gaff account for ${email}, we’ve sent a 6-digit code to it.`),
  ).toBeVisible();
  await expectAccessible(other);
  await screenshot(other, 'au5-reset-password');
  expect((await latestEmailFor(email)).subject).toMatch(
    /^\d{6} is your code to reset your Gaff password$/,
  );

  await other.getByLabel('6-digit code').fill(await latestCodeFor(email));
  await other.getByLabel('Choose a new password').fill(NEW_PASSWORD);
  await other.getByRole('button', { name: 'Save password and sign in' }).click();
  await expect(other).toHaveURL(/\/welcome$/);
  expect((await latestEmailFor(email)).subject).toBe('Your Gaff password was changed');

  // The first device has been signed out.
  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/sign-in$/);

  // The old password no longer works; the new one does.
  await page.getByLabel('Your email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('That email and password don’t match.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU5: asking to reset a password for an address with no account says the same, and sends nothing', async ({
  page,
}) => {
  const email = uniqueEmail('nobody');
  await page.goto('/forgot-password');
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(
    page.getByText(`If there’s a Gaff account for ${email}, we’ve sent a 6-digit code to it.`),
  ).toBeVisible();
  expect((await latestEmailFor(email)).subject).toBe('');
});

test('AU3: signing in brings a letter back to the page they asked for', async ({ page }) => {
  const email = await signUpOperator(page, 'Fuchsia Lettings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto('/sign-in?next=/settings/team');
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterEmailedCode(page, email);
  await expect(page).toHaveURL(/\/settings\/team$/);

  // Somewhere that isn't Gaff is ignored.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/sign-in?next=https://example.com/');
  await signInHere(page, email);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

async function signInHere(page: Page, email: string): Promise<void> {
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterEmailedCode(page, email);
}

test('AU13: signing in and creating an account work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  // A code.
  const email = uniqueEmail('plain');
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await context.clearCookies();

  // A new account with a password, then signing in with it.
  const second = uniqueEmail('plainer');
  await page.goto('/sign-up');
  await page.getByLabel('Your email address').fill(second);
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await latestCodeFor(second));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await context.clearCookies();

  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(second);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  // A wrong password still says so, on a page rendered by the server.
  await context.clearCookies();
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(second);
  await page.getByLabel('Password', { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('That email and password don’t match.')).toBeVisible();
  await context.close();
});

test('AU3: the code page sends a new code, but not straight away', async ({ page }) => {
  const email = uniqueEmail('fionn');
  await page.goto('/sign-in');
  await page.getByLabel('Your email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au3-enter-code');

  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(
    page.getByText('You can ask for a new code a minute after the last one.'),
  ).toBeVisible();
  await expectAccessible(page);

  // Without the step in progress, the page has nothing to show and goes back to the start.
  await page.context().clearCookies();
  await page.goto('/sign-in/code');
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
});

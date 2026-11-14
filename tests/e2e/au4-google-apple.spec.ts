import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, latestEmailFor, screenshot, signIn } from './support';

let counter = 0;
/** A made-up address at a domain the provider hosts, so it can vouch for it. */
function madeUp(domain: string): string {
  counter += 1;
  return `gaff.test.${Date.now()}.${counter}@${domain}`;
}

/** The stand-in for a provider's own sign-in page: choose who to be, and what it says. */
async function chooseAt(
  page: Page,
  provider: 'Google' | 'Apple',
  email: string,
  options: { tick?: string; untick?: string } = {},
): Promise<void> {
  await expect(page.getByRole('heading', { name: `Stand-in for ${provider}` })).toBeVisible();
  await page.getByLabel(`Email address of the ${provider} account`).fill(email);
  if (options.tick) await page.getByLabel(options.tick).check();
  if (options.untick) await page.getByLabel(options.untick).uncheck();
  await page.getByRole('button', { name: 'Continue as this person' }).click();
}

test('AU1, AU3: someone signs in with Google, and has an account with no code to type', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
  await expect(page.getByText('or use your email')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au3-sign-in-with-providers');

  const email = madeUp('gmail.com');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expectAccessible(page);
  await chooseAt(page, 'Google', email);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'What brings you to Gaff?' })).toBeVisible();
  // A new account isn't news that Google was connected.
  expect((await latestEmailFor(email)).subject).toBe('');

  // Coming back, the same Google account is the same Gaff account.
  await page.context().clearCookies();
  await page.goto('/sign-up');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAt(page, 'Google', email);
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU3: Apple sends people back with a form post, and Hide My Email is the account’s address', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await chooseAt(page, 'Apple', madeUp('icloud.com'), { tick: 'Hide My Email' });
  await expect(page.getByRole('heading', { name: 'Back to Gaff' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Gaff' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('AU4: Google joins an account that already exists for a Gmail address, and its owner is told', async ({
  page,
}) => {
  const email = madeUp('gmail.com');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.context().clearCookies();

  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAt(page, 'Google', email);
  await expect(page).toHaveURL(/\/welcome$/);
  const told = await latestEmailFor(email);
  expect(told.subject).toBe('Google was connected to your Gaff account');
  expect(told.text).toContain('If it wasn’t');
});

test('AU4: a provider that doesn’t host the address is never taken at its word', async ({
  page,
}) => {
  // A new address the provider only checked once: a code comes first.
  const work = madeUp('halcyon.test');
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAt(page, 'Google', work);
  await expect(page).toHaveURL(/\/sign-in\?/);
  await expect(
    page.getByText(
      'Google can’t confirm that email address is still yours. This first time, use “Email me a code instead”. Then connect Google from “How you sign in”.',
    ),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'au4-code-first');

  // An address that already has an account: nobody is let in on the provider's say-so.
  await signIn(page, work);
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await chooseAt(page, 'Apple', work);
  await page.getByRole('button', { name: 'Continue to Gaff' }).click();
  await expect(
    page.getByText(
      'You already have a Gaff account for this email. Sign in another way, then connect Apple from “How you sign in”.',
    ),
  ).toBeVisible();
  await expectAccessible(page);
  expect((await latestEmailFor(work)).subject).not.toContain('was connected');
});

test('AU3: cancelling at the provider comes back to sign-in, with a plain line', async ({
  page,
}) => {
  await page.goto('/sign-in?next=/settings/team');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Stand-in for Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Signing in with Google was cancelled.')).toBeVisible();
  // Where they were going is kept for the next try.
  await expect(page).toHaveURL(/next=%2Fsettings%2Fteam/);
  await expectAccessible(page);
});

test('AU13: Google and Apple work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await chooseAt(page, 'Google', madeUp('gmail.com'));
  await expect(page).toHaveURL(/\/welcome$/);

  await context.clearCookies();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await chooseAt(page, 'Apple', madeUp('icloud.com'));
  await page.getByRole('button', { name: 'Continue to Gaff' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await context.close();
});

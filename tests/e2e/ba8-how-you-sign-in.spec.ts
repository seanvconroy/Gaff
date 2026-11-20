import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  confirmItsYou,
  expectAccessible,
  expectNoSidewaysScroll,
  screenshot,
  signIn,
  signUpRenter,
  subjectsSentTo,
} from './support';

/**
 * BA-8 (AU6, AU7, AU8, AU11): "How you sign in" on Profile is something a person can change,
 * each change behind "Confirm it's you" (UX-SI-10), and "Signed-in devices" lists where they're
 * signed in, to sign out one or all the others. At a phone's width and a laptop's. Apple is the
 * local stand-in; the passkey is the browser's virtual authenticator.
 */
const widths = [390, 1280] as const;
const viewport = (width: number) => ({ width, height: width === 390 ? 844 : 900 });

async function rows<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** A day on from signing in: the passkey offer's moment has passed. */
async function aDayLater(email: string): Promise<void> {
  await rows(
    `update sessions set created_at = now() - interval '1 day'
     where user_id = (select id from users where email = $1)`,
    [email],
  );
}

async function withVirtualAuthenticator(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

const signInSection = (page: Page) => page.getByRole('region', { name: 'Sign-in', exact: true });
const devicesSection = (page: Page) => page.getByRole('region', { name: 'Signed-in devices' });

for (const width of widths) {
  test(`BA-8, AU6, AU7: a person changes how they sign in, confirming it’s them each time, at ${width}px`, async ({
    browser,
  }) => {
    test.slow();
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const email = await signUpRenter(page, 'Aoife Byrne');
    // The device can keep a passkey from here on (after first run, so no offer comes first).
    await withVirtualAuthenticator(page);
    await aDayLater(email);

    await page.goto('/profile');
    const section = signInSection(page);
    await expect(section.getByRole('heading', { name: 'Sign-in' })).toBeVisible();
    await expect(section.getByText('Always works, to the email above')).toBeVisible();
    await expect(section.getByText('Not connected')).toHaveCount(2);
    await expect(devicesSection(page).getByText('This device')).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ba8-how-you-sign-in-${width}`);

    // Connect Apple: "Confirm it's you" first, then Apple's own page, then back to Profile.
    await section.getByRole('button', { name: 'Connect Apple' }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirm it’s you' });
    await expect(confirm.getByText('Before you change how you sign in')).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ba8-confirm-change-sign-in-${width}`);
    await confirmItsYou(page);
    await expect(page.getByRole('heading', { name: 'Stand-in for Apple' })).toBeVisible();
    await page.getByLabel('Their Apple email').fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/profile\?connected=apple/);
    await expect(page.getByText('Apple is connected. You can sign in with it now.')).toBeVisible();
    await expect(section.getByText(/^Connected on /)).toBeVisible();
    await expect
      .poll(() => subjectsSentTo(email), { timeout: 60_000 })
      .toContain('Apple was connected to your Gaff account');

    // Add a passkey: confirmed again (each confirmation works once), then the device's prompt.
    await aDayLater(email);
    await page.reload();
    await section.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(confirm).toBeVisible();
    await confirmItsYou(page);
    await expect(page.getByText('Passkey added. You can sign in with it now.')).toBeVisible();
    await expect(section.getByRole('button', { name: /^Rename / })).toBeVisible();
    await expect
      .poll(() => subjectsSentTo(email), { timeout: 60_000 })
      .toContain('A passkey was added to your Gaff account');

    // Rename it: the passkey itself confirms it's them now.
    await aDayLater(email);
    await page.reload();
    await section.getByRole('button', { name: /^Rename / }).click();
    const rename = page.getByRole('dialog', { name: 'Rename this passkey' });
    await rename.getByLabel('Name').fill('My phone');
    await expectAccessible(page);
    await screenshot(page, `ba8-rename-passkey-${width}`);
    await rename.getByRole('button', { name: 'Save' }).click();
    await expect(confirm.getByRole('button', { name: 'Use your passkey' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Use your passkey' }).click();
    await expect(page.getByText('Passkey renamed.')).toBeVisible();
    await expect(section.locator('dt', { hasText: 'My phone' })).toBeVisible();

    // Disconnect Apple, and remove the passkey: each asks again.
    await aDayLater(email);
    await page.reload();
    await section.getByRole('button', { name: 'Disconnect Apple' }).click();
    await expect(confirm).toBeVisible();
    await confirmItsYou(page);
    await expect(page.getByText('Apple is disconnected.')).toBeVisible();
    await expect(section.getByText('Not connected')).toHaveCount(2);
    await section.getByRole('button', { name: 'Remove My phone' }).click();
    await expect(confirm).toBeVisible();
    await confirmItsYou(page);
    await expect(page.getByText('Passkey removed.')).toBeVisible();
    await expect(section.locator('dt', { hasText: 'My phone' })).toHaveCount(0);
    await expect
      .poll(() => subjectsSentTo(email), { timeout: 60_000 })
      .toEqual(
        expect.arrayContaining([
          'Apple was disconnected from your Gaff account',
          'A passkey was removed from your Gaff account',
        ]),
      );
    await context.close();
  });
}

for (const width of widths) {
  test(`BA-8, AU8: a person sees where they’re signed in, and signs out one or all the others, at ${width}px`, async ({
    browser,
  }) => {
    test.slow();
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const email = await signUpRenter(page, 'Cian Byrne');

    // The same person on a phone and on another laptop.
    const phone = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1',
    });
    const phonePage = await phone.newPage();
    await signIn(phonePage, email);
    const laptop = await browser.newContext();
    const laptopPage = await laptop.newPage();
    await signIn(laptopPage, email);

    await page.goto('/profile#profile-devices');
    const devices = devicesSection(page);
    await expect(devices.getByText('This device')).toBeVisible();
    await expect(devices.locator('dt', { hasText: 'Safari on an iPhone' })).toBeVisible();
    await expect(devices.getByText(/^Last used /)).toHaveCount(2);
    await devices.scrollIntoViewIfNeeded();
    await expectAccessible(page);
    await screenshot(page, `ba8-signed-in-devices-${width}`);

    // Sign the phone out: it's signed out there, at once, and this device isn't.
    await devices.getByRole('button', { name: 'Sign out Safari on an iPhone' }).click();
    await expect(page.getByText('Signed out of that device.')).toBeVisible();
    await expect(devices.locator('dt', { hasText: 'Safari on an iPhone' })).toHaveCount(0);
    await phonePage.goto('/profile');
    await expect(phonePage).toHaveURL(/\/sign-in/);

    // All the others: the laptop goes too.
    await devices.getByRole('button', { name: 'Sign out all other devices' }).click();
    await expect(page.getByText('Signed out of 1 other device.')).toBeVisible();
    await expect(devices.getByRole('button', { name: 'Sign out all other devices' })).toHaveCount(
      0,
    );
    await laptopPage.goto('/profile');
    await expect(laptopPage).toHaveURL(/\/sign-in/);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await phone.close();
    await laptop.close();
    await context.close();
  });
}

test('BA-8, M5: the staff passkey page is for Gaff’s own team only', async ({ page }) => {
  await signUpRenter(page, 'Not Staff');
  const response = await page.goto('/sign-in/staff');
  expect(response?.status()).toBe(404);
});

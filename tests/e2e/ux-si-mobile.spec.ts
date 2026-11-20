import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  confirmItsYou,
  expectAccessible,
  expectNoSidewaysScroll,
  latestCodeFor,
  latestTextCodeFor,
  screenshot,
  signUpRenter,
  subjectsSentTo,
  uniqueEmail,
  uniqueMobile,
} from './support';

/**
 * UX-SI-13, UX-SI-14 (ADR-0033): signing in with a mobile number, through the real screens, at a
 * phone's width and a laptop's. Texts go to the development outbox, as email does.
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

const peopleWith = (email: string) =>
  rows<{ id: string }>('select id from users where email = $1', [email]);
const ownerOf = async (mobile: string) =>
  (
    await rows<{ user_id: string }>('select user_id from sign_in_mobiles where mobile = $1', [
      mobile,
    ])
  )[0]?.user_id ?? null;

/** Signed out, on this device: the session goes, and what the device remembers stays. */
async function signOutHere(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: /session_token/ });
}

const field = (page: Page) => page.getByLabel('Email or mobile number');
const pressContinue = (page: Page) =>
  page.getByRole('button', { name: 'Continue', exact: true }).click();
const signedIn = (page: Page) =>
  page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });
const wrongCodeFor = (code: string) => (code === '111111' ? '222222' : '111111');

async function onCodeScreen(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
}

test('UX-SI-13, UX-SI-14: a new person signs in with a mobile number, adds their email, and comes back by text alone', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const mobile = uniqueMobile();
    const email = uniqueEmail('saoirse');

    // One field. While it holds an email there's no picker; a number brings one in below it.
    await page.goto('/sign-in');
    await field(page).fill('saoirse@');
    await expect(page.getByLabel('Country code')).toHaveCount(0);
    await field(page).fill(mobile.typed);
    await expect(page.getByLabel('Country code')).toHaveValue('IE');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-mobile-number-${width}`);

    // The code goes by text, and the screen says where, in full.
    await pressContinue(page);
    await onCodeScreen(page);
    await expect(
      page.getByText(
        `We texted a six-digit code to ${mobile.shown}. It works for the next 10 minutes.`,
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Use a different number' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-mobile-code-${width}`);

    // A wrong code is said at the field, in the words for a text.
    const code = await latestTextCodeFor(mobile.e164);
    await page.getByLabel('Six-digit code').fill(wrongCodeFor(code));
    await expect(page.getByLabel('Six-digit code')).toHaveAccessibleDescription(
      /That code isn’t right\. Check the text and try again\./,
    );

    // The right code proves the number. Nobody has it, so one question follows: the email.
    await page.getByLabel('Six-digit code').fill(code);
    await expect(page.getByRole('heading', { name: 'What’s your email?', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\/email$/);
    await expect(
      page.getByText(`Your mobile, ${mobile.shown}, is confirmed.`, { exact: false }),
    ).toBeVisible();
    // Nobody is signed in yet, and nobody has been made.
    expect((await context.cookies()).some((c) => /session_token/.test(c.name))).toBe(false);
    expect(await ownerOf(mobile.e164)).toBeNull();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-mobile-email-${width}`);

    // An address that isn't one is said at the field.
    await page.getByLabel('Email', { exact: true }).fill('not an address');
    await pressContinue(page);
    await expect(page.getByLabel('Email', { exact: true })).toHaveAccessibleDescription(
      /Enter an email address, like ann@example\.ie/,
    );

    // The email gets a code of its own, and the email says what entering it adds.
    await page.getByLabel('Email', { exact: true }).fill(email);
    await pressContinue(page);
    await onCodeScreen(page);
    await expect(
      page.getByText(`We sent a six-digit code to ${email}.`, { exact: false }),
    ).toBeVisible();
    const [sent] = await rows<{ text: string }>(
      'select text from dev_outbox where to_address = $1 order by created_at desc limit 1',
      [email],
    );
    expect(sent!.text).toContain(
      `the mobile number ending ${mobile.e164.slice(-4)} becomes a way to sign in to your Gaff account`,
    );
    // "Use a different email" comes back to the question; the number is still confirmed.
    await page.getByRole('link', { name: 'Use a different email' }).click();
    await expect(page.getByRole('heading', { name: 'What’s your email?' })).toBeVisible();
    await page.goBack();
    await onCodeScreen(page);

    // A new person: made, signed in, and straight on to set up. Nothing was "found".
    await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    const [person] = await peopleWith(email);
    expect(person).toBeTruthy();
    expect(await ownerOf(mobile.e164)).toBe(person!.id);

    // UX-SI-6: the device remembers they chose their mobile. Next time, the text alone is enough.
    await signOutHere(context);
    await page.goto('/sign-in');
    await expect(page.getByText('You used your mobile number last time.')).toBeVisible();
    // With its country code typed, no picker is needed.
    await field(page).fill(mobile.e164);
    await expect(page.getByLabel('Country code')).toHaveCount(0);
    await pressContinue(page);
    await onCodeScreen(page);
    await page.getByLabel('Six-digit code').fill(await latestTextCodeFor(mobile.e164));
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    expect(await peopleWith(email)).toHaveLength(1);
    const [session] = await rows<{ sign_in_method: string }>(
      'select sign_in_method from sessions where user_id = $1 order by created_at desc limit 1',
      [person!.id],
    );
    expect(session!.sign_in_method).toBe('sms_code');
    await context.close();
  }
});

test('UX-SI-14: a mobile number finds the account its email already has, and Profile can remove it', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    // Someone who has used Gaff before, with a code by email.
    const email = await signUpRenter(page);
    const [person] = await peopleWith(email);
    await signOutHere(context);

    // This time they start with their mobile number, which Gaff has never seen.
    const mobile = uniqueMobile();
    await page.goto('/sign-in?next=%2Fsaved');
    await field(page).fill(mobile.typed);
    await pressContinue(page);
    await onCodeScreen(page);
    await page.getByLabel('Six-digit code').fill(await latestTextCodeFor(mobile.e164));
    await expect(page.getByRole('heading', { name: 'What’s your email?' })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await pressContinue(page);
    await onCodeScreen(page);
    await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));

    // "We've found your account": only now, once the mailbox has said yes.
    await expect(
      page.getByRole('heading', { name: 'We’ve found your account', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(`You’re signed in as ${email}.`)).toBeVisible();
    const masked = `087 ••• ${mobile.e164.slice(-4)}`;
    await expect(
      page.getByText(`You can sign in with your mobile, ${masked}, from now on.`),
    ).toBeVisible();
    // Rule 8: nothing about the person is in the address bar.
    await expect(page).toHaveURL(/\/sign-in\/found\?joined=mobile&next=%2Fsaved$/);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-found-mobile-${width}`);

    // The same person, and on to where they were going.
    await page.getByRole('link', { name: 'Continue', exact: true }).click();
    await signedIn(page);
    await expect(page).toHaveURL(/\/saved$/);
    expect(await peopleWith(email)).toEqual([person]);
    expect(await ownerOf(mobile.e164)).toBe(person!.id);
    // AU11: they're told a way in was added, in case it wasn't them.
    await expect
      .poll(() => subjectsSentTo(email), { timeout: 15_000 })
      .toContain('A mobile number was added to your Gaff account');

    // Profile lists it, masked, and takes it off behind "Confirm it's you".
    await page.goto('/profile');
    const signIn = page.getByRole('region', { name: 'Sign-in', exact: true });
    await expect(signIn.getByRole('term').filter({ hasText: 'A code by text' })).toBeVisible();
    await expect(signIn.getByText(`To ${masked}`)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-profile-mobile-${width}`);
    await signIn.getByRole('button', { name: 'Remove a code by text' }).click();
    await confirmItsYou(page);
    await expect(page.getByText('Mobile number removed.')).toBeVisible();
    // The row stays, to add one again.
    await expect(signIn.getByText('Not added')).toBeVisible();
    await expect(signIn.getByText(`To ${masked}`)).toHaveCount(0);
    expect(await ownerOf(mobile.e164)).toBeNull();
    await context.close();
  }
});

test('UX-SI-13: a number that can’t be texted is said at the field, and other countries are picked', async ({
  page,
}) => {
  await page.setViewportSize(viewport(390));
  await page.goto('/sign-in');

  // Not a whole number.
  await field(page).fill('087 12');
  await pressContinue(page);
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page)).toHaveAccessibleDescription(/Enter a mobile number, like 087 123 4567/);
  await expect(field(page)).toHaveValue('087 12');
  await expectAccessible(page);

  // A country Gaff doesn't text: use an email.
  await field(page).fill('+7 912 345 67 89');
  await pressContinue(page);
  await expect(field(page)).toHaveAccessibleDescription(
    /We can’t text that country yet\. Enter your email instead\./,
  );

  // Another country's number, typed as it is at home, with its code picked.
  await field(page).fill('07700 900123');
  await page.getByLabel('Country code').selectOption({ label: 'United Kingdom (+44)' });
  await screenshot(page, 'ux-si-mobile-country-390');
  await pressContinue(page);
  await onCodeScreen(page);
  await expect(
    page.getByText('We texted a six-digit code to +44 7700900123.', { exact: false }),
  ).toBeVisible();
  // "Use a different number" goes back to the start.
  await page.getByRole('link', { name: 'Use a different number' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
});

test('UX-SI-13: a signed-in person adds a mobile number on Profile, and signs in with it', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const email = await signUpRenter(page);
    const [person] = await peopleWith(email);
    const mobile = uniqueMobile();

    await page.goto('/profile');
    const signIn = page.getByRole('region', { name: 'Sign-in', exact: true });
    await expect(signIn.getByText('Not added')).toBeVisible();
    await signIn.getByRole('button', { name: 'Add a code by text' }).click();
    // Never mistaken for the mobile kept under "Your details": each button has its own name.
    await expect(page.getByRole('button', { name: 'Add mobile', exact: true })).toHaveCount(1);
    const sheet = page.getByRole('dialog', { name: 'Add a mobile number' });
    await expect(sheet.getByLabel('Country code')).toHaveValue('IE');
    await expectAccessible(page);
    await page.screenshot({ path: `screenshots/ux-si-profile-add-mobile-${width}.png` });

    // Not a mobile number: said at the field, and nothing is texted.
    await sheet.getByLabel('Mobile number').fill('087 12');
    await sheet.getByRole('button', { name: 'Text me a code' }).click();
    await expect(sheet.getByLabel('Mobile number')).toHaveAccessibleDescription(
      /Enter a mobile number, like 087 123 4567/,
    );

    // A change to how they sign in: "Confirm it's you" first, then the text goes.
    await sheet.getByLabel('Mobile number').fill(mobile.typed);
    await sheet.getByRole('button', { name: 'Text me a code' }).click();
    await confirmItsYou(page);
    await expect(
      sheet.getByText(`We texted a six-digit code to ${mobile.shown}.`, { exact: false }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `screenshots/ux-si-profile-add-mobile-code-${width}.png` });

    // A wrong code is said at the field; the right one adds the number.
    const code = await latestTextCodeFor(mobile.e164);
    await sheet.getByLabel('Six-digit code').fill(wrongCodeFor(code));
    await expect(sheet.getByLabel('Six-digit code')).toHaveAccessibleDescription(
      /That code isn’t right\. Check the text and try again\./,
    );
    await sheet.getByLabel('Six-digit code').fill(code);
    await expect(page.getByText('Mobile number added. You can sign in with it now.')).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await expect(signIn.getByText(`To 087 ••• ${mobile.e164.slice(-4)}`)).toBeVisible();
    expect(await ownerOf(mobile.e164)).toBe(person!.id);

    // And the number signs them in, with no email asked for.
    await signOutHere(context);
    await page.goto('/sign-in');
    await field(page).fill(mobile.typed);
    await pressContinue(page);
    await onCodeScreen(page);
    await page.getByLabel('Six-digit code').fill(await latestTextCodeFor(mobile.e164));
    await signedIn(page);
    expect(await peopleWith(email)).toEqual([person]);
    await context.close();
  }
});

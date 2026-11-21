import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  confirmItsYou,
  expectAccessible,
  expectNoSidewaysScroll,
  latestCodeFor,
  latestLinkFor,
  screenshot,
  setUpAgency,
  signIn,
  signUpOperator,
  uniqueEmail,
} from './support';

/**
 * UX-SI-1 to UX-SI-15: sign-in, through the real screens, at a phone's width and a laptop's.
 * Google and Apple are the local stand-ins; passkeys use the browser's virtual authenticator.
 */
const widths = [390, 1280] as const;
const viewport = (width: number) => ({ width, height: width === 390 ? 844 : 900 });

/**
 * A sheet over a long page: what's on screen, not the whole page. A sheet stays put while the
 * page scrolls under it, so a full-page picture would show it out of place.
 */
async function screenshotOfSheet(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `screenshots/${name}.png` });
}

async function rows<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** Signed out, on this device: the session goes, and what the device remembers stays. */
async function signOutHere(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: /session_token/ });
}

async function startWithEmail(page: Page, email: string, path = '/sign-in'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email or mobile number').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function onCodeScreen(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
}

const signedIn = (page: Page) =>
  page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });

/** A code that isn't the one that was sent. */
const wrongCodeFor = (code: string) => (code === '111111' ? '222222' : '111111');

async function usersWith(email: string) {
  return rows<{ id: string; email_verified: boolean; name: string }>(
    'select id, email_verified, name from users where email = $1',
    [email],
  );
}

/** The browser's own stand-in for Face ID or a fingerprint: a virtual authenticator. */
async function withVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { client, authenticatorId };
}

async function throughStandIn(
  page: Page,
  provider: 'Google' | 'Apple',
  person: { name?: string; email: string; hideEmail?: boolean },
): Promise<void> {
  await page.getByRole('button', { name: `Continue with ${provider}` }).click();
  await expect(page.getByRole('heading', { name: `Stand-in for ${provider}` })).toBeVisible();
  if (person.name) await page.getByLabel('Their name').fill(person.name);
  await page.getByLabel(`Their ${provider} email`).fill(person.email);
  if (person.hideEmail) await page.getByLabel('Hide my email').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test('UX-SI-1, UX-SI-7: one screen to sign in or create an account, with no tagline', async ({
  page,
}) => {
  for (const width of widths) {
    await page.setViewportSize(viewport(width));
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in or sign up', level: 1 })).toBeVisible();

    // In order: the one field and Continue, "or", Google, Apple, then the small print.
    const parts = [
      page.getByLabel('Email or mobile number'),
      page.getByRole('button', { name: 'Continue', exact: true }),
      page.getByText('or', { exact: true }),
      page.getByRole('button', { name: 'Continue with Google' }),
      page.getByRole('button', { name: 'Continue with Apple' }),
      page.getByText('By continuing, you agree to Gaff’s'),
    ];
    let above = 0;
    for (const part of parts) {
      const box = await part.boundingBox();
      expect(box, 'each part is on screen').not.toBeNull();
      expect(box!.y).toBeGreaterThan(above);
      above = box!.y;
    }
    await expect(page.getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'privacy notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );

    // UX-SI-7: no description of Gaff, no tagline, no illustration.
    await expect(page.getByText(/Gaff runs the letting|from the first enquiry/)).toHaveCount(0);
    await expect(page.getByRole('main').locator('img, picture')).toHaveCount(0);

    // No passwords anywhere (UX-SI-1).
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    // UX-SI-5: the browser may offer a saved passkey on the email field.
    await expect(page.getByLabel('Email or mobile number')).toHaveAttribute(
      'autocomplete',
      'username webauthn',
    );

    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-sign-in-${width}`);
  }

  // The terms and the privacy notice the small print links to.
  for (const [path, title] of [
    ['/terms', 'Terms'],
    ['/privacy', 'Privacy notice'],
  ] as const) {
    for (const width of widths) {
      await page.setViewportSize(viewport(width));
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectAccessible(page);
      await screenshot(page, `ux-si${path.replace('/', '-')}-${width}`);
    }
  }
  await expect(page.getByText('Google and Apple')).toBeVisible();
});

test('UX-SI-2, UX-SI-8: a new person signs in by code, and comes back the same way', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const email = uniqueEmail('niamh');

    await startWithEmail(page, email);
    await onCodeScreen(page);
    // Rule 8: the address is never in a URL.
    expect(page.url()).toMatch(/\/sign-in\/code$/);
    // UX-SI-16: one line says where it went. The title is the label a person reads.
    await expect(page.getByText(`We sent a code to ${email}.`, { exact: true })).toBeVisible();
    const input = page.getByLabel('Six-digit code');
    await expect(page.locator('label', { hasText: 'Six-digit code' })).toHaveClass(
      /visually-hidden/,
    );
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(input).toBeFocused();
    // "Send a new code" unlocks after 30 seconds.
    await expect(
      page.getByRole('button', { name: /^Send a new code in \d+ seconds$/ }),
    ).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Use a different email' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-code-${width}`);

    // Nobody was told "no account found": there was no account, and now there is.
    expect(await usersWith(email)).toEqual([]);
    // A paste of the code, spaces and all, sends itself.
    const code = await latestCodeFor(email);
    await input.evaluate(
      (el, text) => {
        const data = new DataTransfer();
        data.setData('text', text);
        el.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      },
      `${code.slice(0, 3)} ${code.slice(3)}`,
    );
    await signedIn(page);
    // A person who hasn't set up yet starts first run.
    await expect(page).toHaveURL(/\/welcome$/);
    const created = await usersWith(email);
    expect(created).toHaveLength(1);
    expect(created[0]!.email_verified).toBe(true);

    // Back again: the same path, the same person, and the method is remembered on the device.
    await signOutHere(context);
    await page.goto('/sign-in');
    await expect(page.getByText('You used your email last time.')).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-sign-in-last-used-${width}`);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/welcome$/);
    expect((await usersWith(email)).map((user) => user.id)).toEqual([created[0]!.id]);

    // The code was kept as a hash, never as itself, and is used up.
    const stored = await rows<{ code_hash: string; used: boolean }>(
      'select code_hash, used_at is not null as used from one_time_codes where subject = $1',
      [email],
    );
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.code_hash).not.toContain(code);
      expect(row.used).toBe(true);
    }
    await context.close();
  }
});

test('UX-SI-2: a wrong code, too many tries, an expired code and a new code', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize(viewport(width));
    await page.context().clearCookies();
    const email = uniqueEmail('wrong');
    await startWithEmail(page, email);
    await onCodeScreen(page);
    const code = await latestCodeFor(email);
    const input = page.getByLabel('Six-digit code');

    // Wrong code: the words from the states table, under the input, and the input clears.
    await input.fill(wrongCodeFor(code));
    await expect(
      page.getByText('That code isn’t right. Check the email and try again.'),
    ).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();
    await expectAccessible(page);
    await screenshot(page, `ux-si-code-wrong-${width}`);

    // Five tries: the fifth wrong one finishes the code, and even the right code is refused.
    for (let attempt = 2; attempt <= 5; attempt++) {
      await input.fill(wrongCodeFor(code));
      await expect(input).toHaveValue('');
      if (attempt < 5) {
        await expect(page.getByText('That code isn’t right.')).toBeVisible();
      }
    }
    await expect(page.getByText('That code has expired.')).toBeVisible();
    await input.fill(code);
    await expect(page.getByText('That code has expired.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\/code$/);
    await expectAccessible(page);
    await screenshot(page, `ux-si-code-expired-${width}`);

    // Thirty seconds on, "Send a new code" is the screen's main button.
    await rows(
      "update one_time_codes set sent_at = sent_at - interval '1 minute' where subject = $1",
      [email],
    );
    await page.reload();
    await expect(page.getByText('That code has expired.')).toBeVisible();
    const sendNew = page.getByRole('button', { name: 'Send a new code', exact: true });
    await expect(sendNew).toBeEnabled();
    await expect(sendNew).toHaveClass(/primary/);
    await sendNew.click();
    await expect(
      page.getByText('We’ve sent a new code. The old one no longer works.').first(),
    ).toBeVisible();
    await expect(page.getByText('That code has expired.')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Send a new code in \d+ seconds$/ }),
    ).toBeDisabled();
    const newCode = await latestCodeFor(email);

    // An expired code: ten minutes on, the right code is refused in the same words.
    await rows(
      "update one_time_codes set expires_at = now() - interval '1 second' where subject = $1",
      [email],
    );
    await input.fill(newCode);
    await expect(page.getByText('That code has expired.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\/code$/);
  }
});

test('UX-SI-2: the email that didn’t send, and the pressed button showing progress', async ({
  page,
}) => {
  for (const width of widths) {
    await page.setViewportSize(viewport(width));
    await page.goto('/sign-in');
    await page.getByLabel('Email or mobile number').fill('nobody@undeliverable.gaff.test');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const email = page.getByLabel('Email or mobile number');
    // At the field, never in a box at the top.
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(
      /We couldn’t send the code\. Check the address and try again\./,
    );
    await expect(email).toHaveValue('nobody@undeliverable.gaff.test');
    await expect(page.locator('[class*="Notice-module"]')).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-si-email-not-sent-${width}`);

    // An address that isn't one: said at the field too.
    await email.fill('not an address');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(email).toHaveAccessibleDescription(
      /Enter an email address or a mobile number, like 087 123 4567/,
    );
  }

  // Loading: the pressed button shows progress and the others are disabled.
  await page.goto('/sign-in');
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/sign-in', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await page.getByLabel('Email or mobile number').fill(uniqueEmail('loading'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sending your code…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  await screenshot(page, 'ux-si-sign-in-loading-390');
  release();
  await onCodeScreen(page);
});

test('UX-SI-1, UX-SI-8, UX-SI-11: Google and Apple, joined to one person by a verified email', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const email = uniqueEmail('orla');

    // Cancelled at Google: back on the sign-in screen, with no error.
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Stand-in for Google' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-stand-in-google-${width}`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
    await expect(page.getByText(/Error|couldn’t/)).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-si-google-cancelled-${width}`);

    // Cancelled at Apple: the same.
    await page.getByRole('button', { name: 'Continue with Apple' }).click();
    await expect(page.getByRole('heading', { name: 'Stand-in for Apple' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
    await expect(page.getByText(/Error|couldn’t/)).toHaveCount(0);

    // A new person continues with Google, and is signed in. Their name came with them.
    await throughStandIn(page, 'Google', { name: 'Orla Kelly', email });
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    // UX-AC-6: Google supplied her name, so first run doesn't ask for it.
    await expect(page.getByLabel('First and last name')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
    const [person] = await usersWith(email);
    expect(person).toMatchObject({ email_verified: true, name: 'Orla Kelly' });

    // UX-SI-6: the device remembers the method, and nothing about the person.
    await signOutHere(context);
    await page.goto('/sign-in');
    await expect(page.getByText('You used Google last time.')).toBeVisible();
    const remembered = (await context.cookies()).find((c) => c.name === 'gaff_last_method');
    expect(remembered?.value).toBe('google');

    // AU4, UX-SI-15: Apple doesn't look after a work address, so it can't join her by it. A
    // code goes to the address as Apple comes back, and she lands on the code screen: no
    // starting again. Entering it signs her in as herself and connects Apple, in one step.
    await throughStandIn(page, 'Apple', { email });
    await onCodeScreen(page);
    await expect(
      page.getByText(`We sent a code to ${email}, to check it’s yours.`, { exact: true }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-provider-code-${width}`);
    await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
    // "We've found your account": signed in, with the account's email and what was joined.
    await expect(
      page.getByRole('heading', { name: 'We’ve found your account', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('You’re signed in.', { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveText([`Email: ${email}`, 'Connected: Apple']);
    await expect(page).toHaveURL(/\/sign-in\/found\?joined=apple$/);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-found-apple-${width}`);
    await page.getByRole('link', { name: 'Continue', exact: true }).click();
    await signedIn(page);
    expect((await usersWith(email)).map((user) => user.id)).toEqual([person!.id]);
    const methods = await rows<{ provider_id: string; kept: number }>(
      `select provider_id,
              num_nonnulls(access_token, refresh_token, id_token, scope) as kept
       from accounts where user_id = $1 order by provider_id`,
      [person!.id],
    );
    // Sign-in only (Q30): nothing the provider hands over beyond who it is is kept.
    expect(methods).toEqual([
      { provider_id: 'apple', kept: 0 },
      { provider_id: 'google', kept: 0 },
    ]);
    // From then on Apple signs her straight in, as the same person.
    await signOutHere(context);
    await page.goto('/sign-in');
    await expect(page.getByText('You used Apple last time.')).toBeVisible();
    await throughStandIn(page, 'Apple', { email });
    await signedIn(page);
    expect((await usersWith(email)).map((user) => user.id)).toEqual([person!.id]);

    // UX-SI-11: Apple's "Hide My Email": the relay address is the person's email.
    await signOutHere(context);
    await page.goto('/sign-in');
    await throughStandIn(page, 'Apple', {
      name: 'Cian Byrne',
      email: uniqueEmail('cian'),
      hideEmail: true,
    });
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    const relayed = await rows<{ email: string }>(
      `select u.email from users u join sessions s on s.user_id = u.id
       order by s.created_at desc limit 1`,
      [],
    );
    expect(relayed[0]!.email).toMatch(/^[0-9a-f]{10}@privaterelay\.appleid\.com$/);
    await context.close();
  }
});

test('UX-SI-3: the email’s button signs in on the same browser, and shows the code anywhere else', async ({
  browser,
}) => {
  for (const width of widths) {
    const started = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await started.newPage();
    const email = uniqueEmail('link');

    // On the same device and browser: one press, signed in.
    await startWithEmail(page, email);
    await onCodeScreen(page);
    const button = await latestLinkFor(email);
    expect(button).toMatch(/\/sign-in\/open\?t=[A-Za-z0-9_-]{43}$/);
    expect(button).not.toContain('@');
    await page.goto(button);
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    // The button works once.
    await signOutHere(started);
    await page.goto(button);
    await expect(page.getByRole('heading', { name: 'That button has expired' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-si-button-expired-${width}`);

    // Opened anywhere else: the code in large type, and nobody signed in there.
    await startWithEmail(page, email);
    await onCodeScreen(page);
    const code = await latestCodeFor(email);
    const elsewhere = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const other = await elsewhere.newPage();
    await other.goto(await latestLinkFor(email));
    await expect(other.getByRole('heading', { name: 'Your code', level: 1 })).toBeVisible();
    await expect(other.getByText(code, { exact: true })).toBeVisible();
    await expect(
      other.getByText('Enter this code on the device where you started signing in.'),
    ).toBeVisible();
    await expect(other.getByText(/^It works until \d{1,2}(:\d{2})?(am|pm)\.$/)).toBeVisible();
    expect(
      await other
        .getByText(code, { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(28);
    await expectNoSidewaysScroll(other);
    await expectAccessible(other);
    await screenshot(other, `ux-si-code-shown-${width}`);
    // Nobody is left signed in on the wrong browser, and the code can't be used from it.
    await other.goto('/today');
    await expect(other).toHaveURL(/\/sign-in(\?|$)/);
    expect((await elsewhere.cookies()).some((c) => /session_token/.test(c.name))).toBe(false);
    await elsewhere.close();

    // Looking used nothing up: the code still works where they started.
    await page.getByLabel('Six-digit code').fill(code);
    await signedIn(page);
    await started.close();
  }
});

test('UX-SI-4, UX-SI-5: a passkey is offered after sign-in, and signs a returning person in', async ({
  browser,
}) => {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: viewport(width), locale: 'en-IE' });
    const page = await context.newPage();
    const { client, authenticatorId } = await withVirtualAuthenticator(page);
    const email = uniqueEmail('passkey');

    // A new person signs in by code on a device that can keep a passkey: one sheet offers it.
    await startWithEmail(page, email);
    await onCodeScreen(page);
    await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
    const sheet = page.getByRole('dialog', { name: 'Sign in faster next time' });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\/passkey$/);
    await expect(sheet.getByText(/instead of a code from your email\.$/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Not now' })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-si-passkey-offer-${width}`);

    await sheet.getByRole('button', { name: 'Turn it on' }).click();
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    const [person] = await usersWith(email);
    const kept = await rows<{ public_key: string }>(
      'select public_key from passkeys where user_id = $1',
      [person!.id],
    );
    expect(kept).toHaveLength(1);
    const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId });
    expect(credentials).toHaveLength(1);

    // A returning person is offered the passkey first, by the browser's own prompt on the email
    // field. While the person hasn't answered it (the authenticator is waiting for their
    // touch), the other methods stay on the screen and nothing else has changed.
    const touch = (enabled: boolean) =>
      client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled });
    await touch(false);
    await signOutHere(context);
    const offered = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/passkey/generate-authenticate-options'),
    );
    await page.goto('/sign-in');
    expect((await offered).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Email or mobile number')).toBeEditable();
    await expect(page).toHaveURL(/\/sign-in$/);

    // They take the browser's offer (their touch, here): signed in, with no code and no email.
    const mailBefore = await rows('select 1 from dev_outbox where to_address = $1', [email]);
    await touch(true);
    await page.reload();
    await signedIn(page);
    await expect(page).toHaveURL(/\/welcome$/);
    expect(await rows('select 1 from dev_outbox where to_address = $1', [email])).toHaveLength(
      mailBefore.length,
    );
    // No second offer: they used the passkey, and the device has one.
    expect((await context.cookies()).find((c) => c.name === 'gaff_passkey')?.value).toBe('added');
    expect((await usersWith(email)).map((user) => user.id)).toEqual([person!.id]);

    await touch(false);
    await signOutHere(context);
    await page.goto('/sign-in');
    await expect(page.getByText('You used a passkey last time.')).toBeVisible();
    await context.close();
  }
});

test('UX-SI-4: “Not now” to a passkey is remembered for 30 days', async ({ browser }) => {
  const context = await browser.newContext({ viewport: viewport(390), locale: 'en-IE' });
  const page = await context.newPage();
  await withVirtualAuthenticator(page);
  const email = uniqueEmail('notnow');

  await startWithEmail(page, email);
  await onCodeScreen(page);
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  const sheet = page.getByRole('dialog', { name: 'Sign in faster next time' });
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await signedIn(page);
  await expect(page).toHaveURL(/\/welcome$/);

  const memory = (await context.cookies()).find((c) => c.name === 'gaff_passkey');
  expect(memory?.value).toBe('later');
  const days = (memory!.expires - Date.now() / 1000) / 86_400;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
  expect(
    await rows('select 1 from passkeys p join users u on u.id = p.user_id where u.email = $1', [
      email,
    ]),
  ).toEqual([]);

  // Signing in again within the 30 days: no sheet, straight on.
  await signOutHere(context);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await context.close();
});

test('UX-SI-8: after sign-in, on to where they were going, if it’s a path on this site', async ({
  page,
}) => {
  const email = await signUpOperator(page);
  await page.context().clearCookies();

  await startWithEmail(page, email, '/sign-in?next=%2Fsettings');
  await onCodeScreen(page);
  await expect(page.getByRole('link', { name: 'Use a different email' })).toHaveAttribute(
    'href',
    '/sign-in?next=%2Fsettings',
  );
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await expect(page).toHaveURL(/\/settings$/);

  // Another site is never followed: they land at the start.
  await page.context().clearCookies();
  await startWithEmail(page, email, '/sign-in?next=https%3A%2F%2Fevil.example%2Fsettings');
  await onCodeScreen(page);
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);

  // Someone already signed in doesn't see the sign-in screen again.
  await page.goto('/sign-in?next=%2Fsettings');
  await expect(page).toHaveURL(/\/settings$/);
});

async function fillPaymentAccount(page: Page): Promise<void> {
  await page.goto('/settings/payment');
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
}

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const result = await client.query<T>(sql, params);
    await client.query('commit');
    return result.rows;
  } finally {
    await client.end();
  }
}

/** The account tenants pay into, for the organisation of the person with this email. */
async function savedIban(email: string): Promise<string | null> {
  const found = await asSystem<{ payment_iban: string | null }>(
    `select o.payment_iban from organisations o join memberships m on m.organisation_id = o.id
     join users u on u.id = m.user_id where u.email = $1`,
    [email],
  );
  return found[0]?.payment_iban ?? null;
}

test('UX-SI-10: changing the account tenants pay into asks to confirm it’s you, by email code', async ({
  page,
}) => {
  const email = await signUpOperator(page);
  for (const width of widths) {
    await page.setViewportSize(viewport(width));
    await fillPaymentAccount(page);

    // Whatever the age of the session: they signed in seconds ago, and are still asked.
    const sheet = page.getByRole('dialog', { name: 'Confirm it’s you' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText('Before you change the account tenants pay into, we check it’s really you.'),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshotOfSheet(page, `ux-si-confirm-${width}`);
    // Nothing is saved until they have.
    if (width === 390) expect(await savedIban(email)).toBeNull();

    // Closing the sheet saves nothing, and what was typed is still there.
    if (width === 390) {
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByLabel('IBAN')).toHaveValue('IE29 AIBK 9311 5212 3456 78');
      await page.getByRole('button', { name: 'Save the account' }).click();
      await expect(sheet).toBeVisible();
    }
    // One form, however many times it has asked.
    await expect(page.locator('input[name="iban"]')).toHaveCount(1);

    await sheet.getByRole('button', { name: 'Email me a code' }).click();
    const input = sheet.getByLabel('Six-digit code');
    await expect(input).toBeVisible();
    await expect(sheet.getByText(`We sent a code to ${email}.`)).toBeVisible();
    const code = await latestCodeFor(email, 'confirm');
    await input.fill(wrongCodeFor(code));
    await expect(
      sheet.getByText('That code isn’t right. Check the email and try again.'),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshotOfSheet(page, `ux-si-confirm-code-${width}`);
    await sheet.getByLabel('Six-digit code').fill(code);
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByLabel('IBAN')).toHaveValue('IE29 AIBK 9311 5212 3456 78');
  }
  expect(await savedIban(email)).toBe('IE29AIBK93115212345678');

  // A confirmation works once: the next change asks again.
  await fillPaymentAccount(page);
  await expect(page.getByRole('dialog', { name: 'Confirm it’s you' })).toBeVisible();
  await confirmItsYou(page);
  await expect(page.getByText('Saved.')).toBeVisible();
});

test('UX-SI-10: a person with a passkey confirms it’s them with it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: viewport(390), locale: 'en-IE' });
  const page = await context.newPage();
  await withVirtualAuthenticator(page);

  // They take the passkey when it's offered, then set up.
  const email = uniqueEmail('admin');
  await startWithEmail(page, email);
  await onCodeScreen(page);
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await page
    .getByRole('dialog', { name: 'Sign in faster next time' })
    .getByRole('button', { name: 'Turn it on' })
    .click();
  await expect(page).toHaveURL(/\/welcome$/);
  await setUpAgency(page, email);

  await fillPaymentAccount(page);
  const sheet = page.getByRole('dialog', { name: 'Confirm it’s you' });
  await expect(sheet.getByRole('button', { name: 'Use your passkey' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Email me a code instead' })).toBeVisible();
  await expectAccessible(page);
  await screenshotOfSheet(page, 'ux-si-confirm-passkey-390');
  await sheet.getByRole('button', { name: 'Use your passkey' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(await savedIban(email)).toBe('IE29AIBK93115212345678');
  // How they confirmed is in the record, and nothing else about it.
  const logged = await asSystem<{ data: Record<string, unknown> }>(
    `select e.data from events e join memberships m on m.organisation_id = e.organisation_id
     join users u on u.id = m.user_id where u.email = $1 and e.type = 'settings.payment_account'`,
    [email],
  );
  expect(logged.map((event) => event.data)).toEqual([{ changed: true, confirmedBy: 'passkey' }]);
  // Still the same person, still signed in.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await context.close();
});

test('UX-SI-12: private links need no account, as before', async ({
  page,
  browser,
}: {
  page: Page;
  browser: Browser;
}) => {
  // Signed out, a private link's page answers for itself (a made-up token: the link's own
  // "This link has ended" page), and never sends anyone to the sign-in screen. The renter, owner
  // and referee journeys (r9, r27, slice2) open real links with no account.
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/r/${'a'.repeat(43)}`);
  await expect(visitor.getByRole('heading', { name: 'This link has ended' })).toBeVisible();
  expect(visitor.url()).not.toContain('/sign-in');
  await expect(visitor.getByRole('heading', { name: 'Sign in or sign up' })).toHaveCount(0);
  await context.close();
  // And the workspace still needs a sign-in.
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('UX-SI-17: “Sign in” in the header comes back to the page the person was on', async ({
  page,
}: {
  page: Page;
}) => {
  const email = uniqueEmail('roisin');
  // Whatever page it is, with whatever was in its address.
  await page.goto('/help?topic=viewings');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
    'href',
    '/sign-in?next=%2Fhelp%3Ftopic%3Dviewings',
  );
  await page.goto('/help');
  await header.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhelp$/);
  await page.getByLabel('Email or mobile number').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await onCodeScreen(page);
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await page.waitForURL((url) => url.pathname === '/help');
  // Signed in, on the page they left: the avatar is where "Sign in" was.
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
});

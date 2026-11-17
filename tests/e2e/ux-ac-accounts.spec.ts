import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, E2E_STAFF_EMAIL } from '../../playwright.config';
import {
  answerName,
  answerPurpose,
  aRegisterEntry,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  latestCodeFor,
  openAccountMenu,
  screenshot,
  signIn,
  signOut,
  signUpOperator,
  signUpRenter,
  toGoLiveThroughUi,
  uniqueEmail,
} from './support';

/**
 * Work package WP-5: accounts and first run (UX-AC-1 to UX-AC-14, UX-AG-1 to UX-AG-7). Each
 * journey runs at 390px and at 1280px: the same steps and the same words at both (UX-DS-25).
 */
const widths = [
  [390, { width: 390, height: 844 }],
  [1280, { width: 1280, height: 900 }],
] as const;

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

/** The organisations a person belongs to, as the database holds them. */
const organisationsOf = (email: string) =>
  asSystem<{
    kind: string;
    name: string;
    licence: string | null;
    confirmed: boolean;
    slug: string;
  }>(
    `select o.kind, o.name, o.psra_licence_number as licence, o.confirmed_at is not null as confirmed,
       o.inbound_slug as slug
     from organisations o join memberships m on m.organisation_id = o.id
     join users u on u.id = m.user_id where u.email = $1 order by m.created_at`,
    [email],
  );

/** Signs in through the stand-in for Google, which supplies the person's name (UX-SI-1). */
async function signInWithGoogle(page: Page, person: { name: string; email: string }) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Stand-in for Google' })).toBeVisible();
  await page.getByLabel('Their name').fill(person.name);
  await page.getByLabel('Their Google email').fill(person.email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/sign-in') && !url.pathname.startsWith('/dev'),
  );
}

test('UX-AC-6: a renter reaches Search after one question, at 390px and 1280px', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    const email = uniqueEmail('aoife');
    // Google supplies her name, so "What's your name?" is skipped: one question is left.
    await signInWithGoogle(page, { name: 'Aoife Byrne', email });
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Let’s get you started. What brings you to Gaff?',
      }),
    ).toBeVisible();
    // Three large choices, and nothing about Gaff: no tagline, no description (UX-SI-7).
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: 'I’m looking for a home' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'I’m letting a home I own' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'I work at a letting agency' })).toBeVisible();
    await expect(page.getByLabel('First and last name')).toHaveCount(0);
    // One question, so there is no progress bar to show one step of one.
    await expect(page.getByRole('list', { name: 'Getting started' })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ac-first-run-purpose-${width}`);

    // Pressing Continue with nothing chosen says so at the question, with no box at the top.
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText('Choose the one that fits best. You can add the others later.'),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ac-first-run-purpose-error-${width}`);

    await page.getByRole('radio', { name: 'I’m looking for a home' }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    // She lands on Search, on the renting side.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
      'Search',
      'Saved',
      'Enquiries',
    ]);
    // A renter has no organisation: nothing was made for her.
    expect(await organisationsOf(email)).toEqual([]);

    // UX-AC-12: one context, so no switcher. UX-AC-8: the other roles are one tap away.
    const menu = await openAccountMenu(page);
    await expect(page.getByRole('dialog', { name: 'Account' }).getByText('Renting')).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Let a home I own',
      'Join or set up an agency',
      'Profile',
      'Help',
      'Sign out',
    ]);
    await expectAccessible(page);
    await screenshot(page, `ux-ac-renter-menu-${width}`);
    await page.keyboard.press('Escape');

    // First run is shown once: opening Gaff again goes straight to Search.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/$/);
    await context.close();
  }
});

test('UX-AC-6, UX-AC-4, UX-AC-7: a private landlord reaches "Add your home" after one question', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    const email = uniqueEmail('mary');
    await signInWithGoogle(page, { name: 'Mary Byrne', email });
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByRole('radio', { name: 'I’m letting a home I own' }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Straight into adding the home: no business name, no licence, no workspace to set up.
    await expect(page).toHaveURL(/\/lettings\/new$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tell Gaff about the home' }),
    ).toBeVisible();
    await expect(page.getByText(/licence|business name|workspace/i)).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-ac-landlord-add-your-home-${width}`);

    // UX-AC-4: her organisation of one was made silently. UX-AC-9: renters see her first name.
    const [own, ...others] = await organisationsOf(email);
    expect(others).toEqual([]);
    expect(own).toMatchObject({ kind: 'private_landlord', name: 'Mary', licence: null });
    expect(own!.slug).toMatch(/^home-[a-z0-9]{8}$/);

    // The home is hers: it goes live with no confirmation to wait for.
    await createLettingThroughUi(page, `${width} Sandymount Avenue`);
    await page.goto('/today');
    const account = await openAccountMenu(page);
    await expect(
      page.getByRole('dialog', { name: 'Account' }).getByText('My own homes'),
    ).toBeVisible();
    // Her settings are hers, not an agency's; and the other roles are still there (UX-AC-8).
    await expect(account.getByRole('menuitem')).toHaveText([
      'Find a home to rent',
      'Join or set up an agency',
      'Profile',
      'Settings',
      'Help',
      'Sign out',
    ]);
    await page.keyboard.press('Escape');
    await context.close();
  }
});

test('UX-AC-6, UX-AC-10: with an email code, first run asks the name first, and opens where it was left', async ({
  page,
}) => {
  test.slow();
  const email = uniqueEmail('ann');
  await signIn(page, email);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/welcome');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Let’s get you started. What’s your name?' }),
    ).toBeVisible();
    // Two questions for now: the progress shows both, and which one this is.
    const progress = page.getByRole('list', { name: 'Getting started' });
    await expect(progress.getByRole('listitem')).toHaveText(['You', 'What you need']);
    await expect(progress.locator('[aria-current="step"]')).toHaveText('You');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ac-first-run-name-${width}`);
    // An empty name is marked at the field (UX-FL-3).
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByLabel('First and last name')).toBeFocused();
    await expectAccessible(page);
  }

  await answerName(page, 'Ann Power');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Thanks, Ann. What brings you to Gaff?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Getting started' }).locator('[aria-current="step"]'),
  ).toHaveText('What you need');
  await expectAccessible(page);
  await screenshot(page, 'ux-ac-first-run-purpose-after-name-1280');

  // UX-AC-10: she leaves. Nothing is chosen for her, and she can look around.
  await page.getByRole('link', { name: 'Back', exact: true }).first().click();
  await expect(page.getByLabel('First and last name')).toHaveValue('Ann Power');
  await page.goto('/');
  // Back at Gaff, first run opens at the question she hadn't answered: her name is kept.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
  await expect(page.getByLabel('First and last name')).toHaveCount(0);

  // She says she works at an agency, and leaves again at "Which agency?".
  await answerPurpose(page, 'I work at a letting agency');
  await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
  // The way out of first run is the public site, to look around; she signs out from there.
  await page.goto('/?rent=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await signOut(page);
  await signIn(page, email);
  // Signed in again, even on another day: straight back to "Which agency?".
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
  // UX-AC-8: and nothing was fixed. She can still change her answer.
  await page.getByRole('link', { name: 'Back', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
});

test('UX-AG-1 to UX-AG-4: an agency person finds their agency by typing its name, and go-live is held until Gaff confirms', async ({
  browser,
}) => {
  test.slow();
  const staffContext = await browser.newContext({ locale: 'en-IE' });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);

  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    // An agency of this journey's own, in the made-up register, found by its name.
    const agency = `Glenmore ${width} Lettings ${String(Date.now()).slice(-5)}`;
    const licence = await aRegisterEntry(agency, 'Kildare');
    const email = uniqueEmail('ann');
    await signIn(page, email);
    await answerName(page, 'Ann Power');
    await answerPurpose(page, 'I work at a letting agency');

    // "Which agency?": the third question of four.
    await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Getting started' }).getByRole('listitem'),
    ).toHaveText(['You (done)', 'What you need (done)', 'Your agency', 'Check']);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-which-agency-${width}`);

    // UX-AG-1: it is found as she types. Only businesses licensed to let are offered.
    const search = page.getByLabel('Agency name');
    await search.pressSequentially('Halc', { delay: 30 });
    const results = page.getByRole('main').getByRole('list').first();
    await expect(results.getByRole('link', { name: /Halcyon Lettings/ }).first()).toBeVisible();
    await expect(
      results.getByText('Registered as Halcyon Lettings Limited · Dublin · PSRA licence 001234'),
    ).toBeVisible();
    // UX-AG-2: when it isn't there, two ways on.
    await expect(
      page.getByRole('link', { name: 'Enter the licence number instead' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'We’re applying for a licence' })).toBeVisible();
    // Q39: the PSRA is credited for its register.
    await expect(
      page.getByText(/from the PSRA’s register of licensed property services providers/),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-agency-results-${width}`);

    // People's own licences, and businesses not licensed to let, are never in the list.
    await search.fill('');
    await search.pressSequentially('Slaney', { delay: 30 });
    await expect(
      page.getByText('We can’t find “Slaney” among the agencies licensed to let.'),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-agency-not-found-${width}`);

    await search.fill('');
    await search.pressSequentially(agency.slice(0, 12), { delay: 30 });
    const mine = page.getByRole('link', { name: new RegExp(agency) });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText(`Kildare · PSRA licence ${licence}`);
    await mine.click();

    // "Is this your agency?": the fourth and last question. Nobody typed a licence number.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Is this your agency?' }),
    ).toBeVisible();
    const card = page.getByRole('main').locator('dl');
    await expect(card.getByText(`${agency} Limited`)).toBeVisible();
    await expect(card.getByText(licence, { exact: true })).toBeVisible();
    await expect(card.getByText('Company', { exact: true })).toBeVisible();
    await expect(card.getByText('Kildare', { exact: true })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-is-this-your-agency-${width}`);
    await page.getByRole('button', { name: 'Yes, that’s us' }).click();

    // She lands on Today, in the agency, after four questions and no more (UX-AC-6).
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await organisationsOf(email)).toMatchObject([
      { kind: 'agency', name: agency, licence, confirmed: false },
    ]);
    await openAccountMenu(page);
    await expect(page.getByRole('dialog', { name: 'Account' }).getByText(agency)).toBeVisible();
    await page.keyboard.press('Escape');

    // UX-AG-4: being confirmed, she can do everything except put a letting live.
    const address = `${width} Glenmore Road`;
    await createLettingThroughUi(page, address);
    await toGoLiveThroughUi(page);
    await page.getByRole('button', { name: 'Start taking enquiries' }).click();
    const held = `We’re confirming ${agency}. This usually takes under an hour. We’ll email you, and this home will go live then.`;
    await expect(page.getByText(held)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start taking enquiries' })).toHaveCount(0);
    await expect(page.getByText('Gaff is now answering enquiries for this home.')).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-go-live-held-${width}`);
    // It is still held on a second look: nothing went live.
    await page.reload();
    await expect(page.getByText(held)).toBeVisible();

    // Someone at Gaff opens the internal page, finds the agency waiting, and presses Confirm.
    await staffPage.setViewportSize(viewport);
    await staffPage.goto('/internal/agencies');
    await expect(staffPage.getByRole('heading', { level: 1, name: 'Agencies' })).toBeVisible();
    const waiting = staffPage.getByRole('region', { name: agency });
    await expect(waiting.getByText(`${agency} Limited`)).toBeVisible();
    await expect(waiting.getByText(licence, { exact: true })).toBeVisible();
    await expect(waiting.getByText(`Ann Power (${email})`)).toBeVisible();
    await expectNoSidewaysScroll(staffPage);
    await expectAccessible(staffPage);
    await screenshot(staffPage, `ux-ag-internal-agencies-${width}`);
    await waiting.getByRole('button', { name: `Confirm ${agency}` }).click();
    await expect(staffPage.getByText(/^Confirmed\./)).toBeVisible();
    await expect(staffPage.getByRole('region', { name: agency })).toHaveCount(0);
    // The page drawn after the press has arrived whole, title and all, before it's scanned.
    await expect(staffPage).toHaveTitle(/Agencies/);
    await expectAccessible(staffPage);

    // The home is live, on the decision she already made, and she's emailed.
    await page.reload();
    await expect(page.getByText(held)).toHaveCount(0);
    await expect(page.getByText('Finish setting up')).toHaveCount(0);
    expect(await organisationsOf(email)).toMatchObject([{ confirmed: true }]);
    const live = await asSystem<{ status: string; held: boolean }>(
      `select l.status, l.go_live_held_at is not null as held from lettings l
       where l.address_line1 = $1`,
      [address],
    );
    expect(live).toEqual([{ status: 'live', held: false }]);
    await expect
      .poll(async () =>
        (
          await asSystem<{ subject: string }>(
            'select subject from dev_outbox where to_address = $1 order by created_at desc',
            [email],
          )
        ).map((row) => row.subject),
      )
      .toContain(`${agency} is confirmed on Gaff`);

    // The email, as a page of its own: the layout, with one button (UX-PP-10).
    const [mail] = await asSystem<{ html: string; text: string }>(
      'select html, text from dev_outbox where to_address = $1 and subject = $2',
      [email, `${agency} is confirmed on Gaff`],
    );
    expect(mail!.text).toContain('The home you were ready to put live is live now');
    const letter = await context.newPage();
    await letter.setContent(mail!.html);
    await expect(letter.getByRole('link', { name: 'Open Gaff' })).toHaveCount(1);
    await expect(letter.getByRole('img', { name: 'Gaff' })).toBeVisible();
    await expectAccessible(letter);
    await letter.screenshot({
      path: `screenshots/ux-ag-email-confirmed-${width}.png`,
      fullPage: true,
    });
    await letter.close();
    await context.close();
  }

  // Q13: the internal page is for Gaff's own team. An agency's admin gets "not found".
  const admin = await browser.newContext({ locale: 'en-IE' });
  const adminPage = await admin.newPage();
  await signUpOperator(adminPage, 'Halcyon Lettings', { confirmed: false });
  const response = await adminPage.goto('/internal/agencies');
  expect(response?.status()).toBe(404);
  await admin.close();
  await staffContext.close();
});

test('UX-AG-2, UX-AG-3: the licence number instead, applying for a licence, and an agency already on Gaff', async ({
  browser,
}) => {
  test.slow();
  // A confirmed agency that is already on Gaff.
  const first = await browser.newContext({ locale: 'en-IE' });
  const firstPage = await first.newPage();
  const onGaff = `Rathmore Lettings ${String(Date.now()).slice(-5)}`;
  await signUpOperator(firstPage, onGaff);
  await first.close();
  const [held] = await asSystem<{ licence: string }>(
    'select psra_licence_number as licence from organisations where name = $1',
    [onGaff],
  );
  const licence = held!.licence;

  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    const email = uniqueEmail('brian');
    await signIn(page, email);
    await answerName(page, 'Brian Daly');
    await answerPurpose(page, 'I work at a letting agency');
    await page.getByLabel('Agency name').pressSequentially('Rathmore', { delay: 30 });
    // UX-AG-3: the list says it's on Gaff.
    const row = page.getByRole('link', { name: new RegExp(onGaff) });
    await expect(row).toContainText('On Gaff');

    // UX-AG-2: "Enter the licence number instead".
    await page.getByRole('link', { name: 'Enter the licence number instead' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'What’s your agency’s PSRA licence number?' }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Licence number').fill('0000009');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText('We can’t find that number among the agencies licensed to let.'),
    ).toBeVisible();
    await expect(page.getByLabel('Licence number')).toHaveValue('0000009');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-licence-number-${width}`);
    await page.getByLabel('Licence number').fill(licence);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // UX-AG-3: already on Gaff: the screen says so, and offers one action.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Is this your agency?' }),
    ).toBeVisible();
    await expect(page.getByText(`${onGaff} is already on Gaff.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yes, that’s us' })).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-already-on-gaff-${width}`);
    await page.getByRole('button', { name: 'Ask to join' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `We’ve asked ${onGaff}` }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-asked-to-join-${width}`);
    // The request is recorded for that agency's admins. Asking isn't joining.
    const requests = await asSystem<{ agency: string }>(
      `select o.name as agency from join_requests r join organisations o on o.id = r.organisation_id
       join users u on u.id = r.user_id where u.email = $1`,
      [email],
    );
    expect(requests).toEqual([{ agency: onGaff }]);
    expect(await organisationsOf(email)).toEqual([]);
    // UX-AC-10: opening Gaff again shows where things stand.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: `We’ve asked ${onGaff}` }),
    ).toBeVisible();

    // UX-AG-2: "We're applying for a licence": everything can be set up; nothing goes live.
    await page.getByRole('link', { name: 'Something else' }).click();
    await answerPurpose(page, 'I work at a letting agency');
    await page.getByLabel('Agency name').pressSequentially('Zzyzx', { delay: 30 });
    await page.getByRole('link', { name: 'We’re applying for a licence' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'What’s your agency called?' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-applying-${width}`);
    const applying = `Brian Daly Lettings ${width}`;
    await page.getByLabel('Agency name').fill(applying);
    await page.getByRole('button', { name: 'Set up my agency' }).click();
    await expect(page).toHaveURL(/\/today$/);
    expect(await organisationsOf(email)).toMatchObject([
      { kind: 'agency', name: applying, licence: null, confirmed: false },
    ]);
    // He can add a letting and set it up. The go-live step says why it can't go live yet.
    await createLettingThroughUi(page, `${width} Rathmore Park`);
    await toGoLiveThroughUi(page);
    await expect(
      page.getByText(`This home can’t go live yet: ${applying} has no PSRA licence on Gaff.`),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start taking enquiries' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Find our licence' })).toHaveAttribute(
      'href',
      '/welcome?step=agency',
    );
    await expectAccessible(page);
    await screenshot(page, `ux-ag-go-live-no-licence-${width}`);
    await context.close();
  }
});

test('UX-AC-11 to UX-AC-13: one person adds contexts from the account menu and switches between them', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    const nav = page.getByRole('navigation', { name: 'Main' });
    const who = page.getByRole('dialog', { name: 'Account' });
    const email = await signUpRenter(page, 'Aoife Byrne');

    // UX-AC-12: with one context there is no switcher.
    let menu = await openAccountMenu(page);
    await expect(menu.getByRole('menuitem', { name: /^Switch to/ })).toHaveCount(0);

    // UX-AC-13: "Let a home I own" adds a context, reusing her name: she is asked nothing.
    await menu.getByRole('menuitem', { name: 'Let a home I own' }).click();
    await expect(page).toHaveURL(/\/lettings\/new$/);
    expect(await organisationsOf(email)).toMatchObject([
      { kind: 'private_landlord', name: 'Aoife' },
    ]);
    await createLettingThroughUi(page, `${width} Harbour Row`);

    // UX-AC-11: now there are just two, so the menu reads "Switch to renting".
    await page.goto('/today');
    // The letting side's four destinations (Today carries a count: her home needs finishing).
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('link', { name: 'Lettings' })).toBeVisible();
    menu = await openAccountMenu(page);
    await expect(who.getByText('My own homes')).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toHaveText('Switch to renting');
    await expectAccessible(page);
    await screenshot(page, `ux-ac-switch-to-renting-${width}`);
    // One tap switches, and the destinations change to that side's.
    await menu.getByRole('menuitem', { name: 'Switch to renting' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.getByRole('link')).toHaveText(['Search', 'Saved', 'Enquiries']);
    menu = await openAccountMenu(page);
    await expect(who.getByText('Renting')).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toHaveText('Switch to letting');
    await expectAccessible(page);
    await screenshot(page, `ux-ac-switch-to-letting-${width}`);
    await page.keyboard.press('Escape');

    // Gaff reopens the context used last: signed out and in again, she is still renting.
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.getByRole('link')).toHaveText(['Search', 'Saved', 'Enquiries']);
    menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'Switch to letting' }).click();
    await expect(page).toHaveURL(/\/today$/);
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/today$/);

    // UX-AC-13: "Join or set up an agency" starts at the step it needs: finding the agency.
    const agency = `Corrib ${width} Homes ${String(Date.now()).slice(-5)}`;
    const licence = await aRegisterEntry(agency, 'Galway');
    menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'Join or set up an agency' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
    // Her name is on her profile already: she isn't asked it, or what brings her to Gaff.
    await expect(
      page.getByRole('list', { name: 'Getting started' }).getByRole('listitem'),
    ).toHaveText(['Your agency', 'Check']);
    await page.getByLabel('Agency name').pressSequentially(agency.slice(0, 10), { delay: 30 });
    await page.getByRole('link', { name: new RegExp(agency) }).click();
    await page.getByRole('button', { name: 'Yes, that’s us' }).click();
    await expect(page).toHaveURL(/\/today$/);
    expect(await organisationsOf(email)).toMatchObject([
      { kind: 'private_landlord' },
      { kind: 'agency', name: agency, licence },
    ]);

    // UX-AC-11: with more than two, each is listed at the top: the agency by name, "My own
    // homes" and "Renting". The one that's open is marked.
    menu = await openAccountMenu(page);
    await expect(who.getByText(agency).first()).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      `${agency} (open now)`,
      'My own homes',
      'Renting',
      'Profile',
      'Agency settings',
      'Team',
      'Help',
      'Sign out',
    ]);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ac-switcher-${width}`);

    // Each context holds its own lettings: the agency has none; her own homes has hers.
    await page.keyboard.press('Escape');
    await page.goto('/lettings');
    await expect(page.getByText(`${width} Harbour Row`)).toHaveCount(0);
    menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'My own homes' }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/lettings');
    await expect(page.getByText(`${width} Harbour Row`).first()).toBeVisible();
    menu = await openAccountMenu(page);
    await expect(who.getByText('My own homes').first()).toBeVisible();
    // By keyboard: the menu's arrows reach a context, and Enter switches (UX-DS-21).
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Renting' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.getByRole('link')).toHaveText(['Search', 'Saved', 'Enquiries']);
    await context.close();
  }
});

test('UX-AG-5: a founder sets a pilot agency up, and its first admin joins with no questions', async ({
  browser,
}) => {
  test.slow();
  const staffContext = await browser.newContext({ locale: 'en-IE' });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, E2E_STAFF_EMAIL);

  for (const [width, viewport] of widths) {
    const agency = `Shannonside ${width} Lettings ${String(Date.now()).slice(-5)}`;
    const licence = await aRegisterEntry(agency, 'Limerick');
    const admin = uniqueEmail('orla');
    await staffPage.setViewportSize(viewport);
    await staffPage.goto('/internal/agencies');
    const form = staffPage.getByRole('region', { name: 'Set up a pilot agency' });
    // What's wrong is said at the field.
    await form.getByLabel('PSRA licence number').fill('0000008');
    await form.getByLabel('First admin’s email').fill(admin);
    await form.getByRole('button', { name: 'Set up and invite' }).click();
    await expect(
      form.getByText('That number isn’t among the agencies licensed to let.'),
    ).toBeVisible();
    await expectAccessible(staffPage);
    await screenshot(staffPage, `ux-ag-pilot-agency-${width}`);
    await form.getByLabel('PSRA licence number').fill(licence);
    await form.getByRole('button', { name: 'Set up and invite' }).click();
    await expect(staffPage.getByText(/its first admin has been invited by email/)).toBeVisible();

    // The invitation arrives by email, with one button.
    await expect
      .poll(async () =>
        (
          await asSystem<{ subject: string }>(
            'select subject from dev_outbox where to_address = $1',
            [admin],
          )
        ).map((row) => row.subject),
      )
      .toEqual([`Join ${agency} on Gaff`]);
    const [mail] = await asSystem<{ html: string; text: string }>(
      'select html, text from dev_outbox where to_address = $1',
      [admin],
    );
    const link = mail!.text.match(/https?:\/\/\S+/)![0];
    // UX-AG-11: the link names the invite, and holds no address.
    expect(new URL(link).pathname).toMatch(/^\/join\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);

    // The invited person opens it, signs in with that address, and lands in the agency.
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    const letter = await context.newPage();
    await letter.setContent(mail!.html);
    await expect(letter.getByRole('link', { name: `Join ${agency}` })).toHaveCount(1);
    await expectAccessible(letter);
    await letter.screenshot({
      path: `screenshots/ux-ag-email-invite-${width}.png`,
      fullPage: true,
    });
    await letter.close();

    await page.goto(new URL(link).pathname);
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjoin%2F/);
    // UX-AG-11: sign-in says "Join {agency}", with the invited address filled in.
    await expect(page.getByRole('heading', { level: 1, name: `Join ${agency}` })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(admin);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
    await page.getByLabel('Six-digit code').fill(await latestCodeFor(admin));
    // No questions: straight to Today, in the agency, which is already confirmed.
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await organisationsOf(admin)).toMatchObject([
      { kind: 'agency', name: agency, licence, confirmed: true },
    ]);
    await openAccountMenu(page);
    await expect(page.getByRole('dialog', { name: 'Account' }).getByText(agency)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-invited-admin-today-${width}`);
    // The invite worked once, and its address is gone with it.
    expect(await asSystem('select 1 from organisation_invites where email = $1', [admin])).toEqual(
      [],
    );
    await context.close();
  }
  await staffContext.close();
});

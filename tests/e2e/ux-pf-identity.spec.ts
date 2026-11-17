import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import { chooseApplicant, chooseWhoViews } from './journeys';
import { applyThroughUi, bookFirstTime, expectReadable } from './renter';
import {
  addHomeThroughUi,
  confirmItsYou,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signIn,
  signUpLandlord,
  signUpOperator,
  startViewingsNow,
  toGoLiveThroughUi,
  uniqueEmail,
} from './support';

/**
 * Work package WP-24: a verified identity (UX-PF-8 to UX-PF-14, UX-TS-1, UX-TS-2). A private
 * landlord confirms it's them once, at their first go-live, and their home's page says
 * "Identity verified"; later, chosen for an agency's home, they aren't checked again. A chosen
 * renter keeps their ID check, and at the next home's checks says yes to it, which is the
 * moment the operator sees it; a renter who says no does the check again. Deleting the profile
 * removes it. Screenshots are screenshots/ux-pf-id-<screen>-<width>.png.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

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

/** What Gaff keeps of this person's ID check, read as the system. */
const keptFor = (email: string) =>
  asSystem<Record<string, unknown>>(
    `select v.* from verified_identities v join users u on u.id = v.user_id where u.email = $1`,
    [email],
  );

/** A Daft enquiry from a made-up renter about one of the operator's homes. */
function enquiryFrom(email: string, name: string, address: string) {
  const swap = (text: string) =>
    text
      .replaceAll('aoife.byrne@example.ie', email)
      .replaceAll('Aoife Byrne', name)
      .replaceAll('Aoife', name.split(' ')[0]!)
      .replaceAll('12 Ranelagh Road', address)
      .replaceAll('12-ranelagh-road', address.toLowerCase().replaceAll(' ', '-'))
      .replaceAll('123456', address.startsWith('12') ? '123456' : '123457');
  return {
    from: daftEnquiry.from,
    replyTo: swap(daftEnquiry.replyTo),
    subject: swap(daftEnquiry.subject),
    text: swap(daftEnquiry.text),
  };
}

/** The screen at both widths, phone first: axe, nothing sideways, a screenshot of each. */
async function atBothWidths(page: Page, name: string): Promise<void> {
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, `ux-pf-id-${name}-${viewport.width}`);
  }
  await page.setViewportSize(PHONE);
}

async function aPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: PHONE,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  return { context, page: await context.newPage() };
}

/** The stand-in ID service: the name it found, and the result. */
async function standInId(
  page: Page,
  outcome: 'The ID and selfie match' | 'The selfie doesn’t match',
) {
  await expect(page.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await page.getByRole('button', { name: outcome }).click();
}

/**
 * An agency's homes, live, with each renter enquiring about each, invited, booked, there, and
 * applied (signed out, on their phones). Returns each home's letting address and each renter's
 * own link to it.
 */
async function applicantsAt(
  browser: Browser,
  page: Page,
  homes: readonly string[],
  renters: ReadonlyArray<{ email: string; name: string; page: Page }>,
) {
  const operator = await signUpOperator(page);
  const lettings: string[] = [];
  for (const home of homes) {
    await createLettingThroughUi(page, home);
    await goLiveThroughUi(page);
    lettings.push(page.url().replace(/\?.*$/, ''));
  }
  const to = await gaffAddress(page);
  for (const renter of renters) {
    for (const home of homes) {
      await sendTestEmail(page, { to, ...enquiryFrom(renter.email, renter.name, home) });
    }
  }
  for (const letting of lettings) {
    await chooseWhoViews(page, letting, {
      waitFor: renters.at(-1)!.name,
      tick: renters.map((renter) => renter.name),
    });
  }
  const links = new Map<string, string>();
  for (const renter of renters) {
    for (const home of homes) {
      let link = '';
      await expect(async () => {
        link = await linkInEmail(renter.email, `Book a viewing: ${home}`);
      }).toPass({ timeout: 20_000 });
      links.set(`${renter.email} ${home}`, link);
      await renter.page.goto(link);
      await bookFirstTime(renter.page);
    }
  }
  for (const [index, home] of homes.entries()) {
    await startViewingsNow(home, operator);
    await page.goto(`${lettings[index]}/attendance`);
    for (const renter of renters) {
      const group = page.getByRole('group', { name: `Did ${renter.name} come?` });
      await group.getByRole('button', { name: 'Came' }).click();
      await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  }
  for (const renter of renters) {
    for (const home of homes) {
      await renter.page.goto(links.get(`${renter.email} ${home}`)!);
      await applyThroughUi(renter.page, { earning: 'From a job', income: '5,200' });
    }
  }
  return { lettings, links };
}

/** The renter's checks link for a home, from the email that says they were chosen. */
async function checksLink(email: string, home: string): Promise<string> {
  let link = '';
  await expect(async () => {
    link = await linkInEmail(email, `${home}: a few checks before an offer`);
  }).toPass({ timeout: 20_000 });
  return link;
}

test('UX-TS-1, UX-TS-2, UX-PF-11, UX-PF-12: a private landlord confirms it’s them once, at go-live; later chosen as a renter, they aren’t checked again, and a renter who says no does the check', async ({
  browser,
  page,
}) => {
  test.setTimeout(420_000);

  // Mary lets her own home: no ID check until the go-live step, and then one.
  const mary = await aPhone(browser);
  const maryEmail = await signUpLandlord(mary.page, 'Mary Byrne', { verified: false });
  await addHomeThroughUi(mary.page, '3 Castle Street');
  await mary.page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(mary.page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  const lettingId = homeIdIn(mary.page.url());
  expect(await keptFor(maryEmail)).toEqual([]);
  await toGoLiveThroughUi(mary.page, 'Confirm it’s you');
  await expect(
    mary.page.getByText(
      'One check before your home goes live: confirm it’s you. About two minutes, once.',
    ),
  ).toBeVisible();
  await expect(
    mary.page.getByText(
      'Gaff keeps only that it passed, your name and the date, on your own profile. Never the photos.',
    ),
  ).toBeVisible();
  // UX-TS-1: it can't go live from anywhere else meanwhile.
  await expect(mary.page.getByRole('button', { name: 'Start taking enquiries' })).toHaveCount(0);
  await atBothWidths(mary.page, 'confirm-its-you');

  // A check that doesn't pass says so in "warning", and she tries again.
  await mary.page.getByRole('button', { name: 'Confirm it’s you' }).click();
  await standInId(mary.page, 'The selfie doesn’t match');
  await expect(mary.page.getByText('That didn’t work this time')).toBeVisible();
  await expect(mary.page.locator('[data-tone="danger"]')).toHaveCount(0);
  await expectAccessible(mary.page);
  await screenshot(mary.page, 'ux-pf-id-confirm-not-passed-390');
  await mary.page.getByRole('button', { name: 'Confirm it’s you' }).click();
  await standInId(mary.page, 'The ID and selfie match');

  // Back at the go-live step, which is now the usual one.
  await expect(mary.page.getByRole('heading', { name: 'Ready to go live' })).toBeVisible();
  await mary.page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(
    mary.page.getByRole('heading', { level: 1, name: '3 Castle Street is live' }),
  ).toBeVisible();
  const [kept] = await keptFor(maryEmail);
  expect(Object.keys(kept!).sort()).toEqual(['user_id', 'verified_at', 'verified_name']);
  expect(kept!.verified_name).toBe('Mary Byrne');

  // UX-TS-1, Q47: her home's page says "Identity verified" beside her first name.
  const [{ ref } = { ref: '' }] = await asSystem<{ ref: string }>(
    `select public_ref as ref from lettings where id = $1`,
    [lettingId],
  );
  const visitor = await aPhone(browser);
  await visitor.page.goto(`/homes/${ref}`);
  const letBy = visitor.page.getByRole('region', { name: 'Let by' });
  await expect(letBy.getByText('Mary', { exact: true })).toBeVisible();
  await expect(letBy.getByText('Identity verified')).toBeVisible();
  await atBothWidths(visitor.page, 'home-identity-verified');
  await visitor.context.close();

  // Never asked again: her second home goes straight to "Ready to go live".
  await addHomeThroughUi(mary.page, '5 Castle Street');
  await toGoLiveThroughUi(mary.page);

  // An agency's home: Mary and Niamh both apply, and are chosen, Mary first.
  const niamh = await aPhone(browser);
  const niamhEmail = uniqueEmail('niamh');
  await signIn(niamh.page, niamhEmail);
  await asSystem(
    `insert into verified_identities (user_id, verified_name, verified_at)
     select id, 'Niamh Walsh', now() - interval '30 days' from users where email = $1`,
    [niamhEmail],
  );
  const maryAsRenter = await aPhone(browser);
  const { lettings } = await applicantsAt(
    browser,
    page,
    ['12 Ranelagh Road'],
    [
      { email: maryEmail, name: 'Mary Byrne', page: maryAsRenter.page },
      { email: niamhEmail, name: 'Niamh Walsh', page: niamh.page },
    ],
  );
  // Rule 2, UX-PF-12: nothing in People says who is verified, before choosing.
  await page.goto(`${lettings[0]}?view=people`);
  await expect(page.getByText('Mary Byrne').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/verified|identity/i);
  await chooseApplicant(page, lettings[0]!, { preferred: 'Mary Byrne', backup: 'Niamh Walsh' });
  await page.goto(`${lettings[0]}/checks`);
  expect(await page.locator('body').innerText()).not.toContain('Verified:');

  // UX-PF-11: Mary, signed in, is asked whether to use the check she did at go-live.
  await mary.page.goto(await checksLink(maryEmail, '12 Ranelagh Road'));
  await expect(
    mary.page.getByRole('heading', { name: /^Use the ID check you did on \d{1,2} \w+\?$/ }),
  ).toBeVisible();
  await expectReadable(mary.page);
  await atBothWidths(mary.page, 'use-kept');
  await mary.page.getByRole('button', { name: 'Yes, use it' }).click();
  await expect(mary.page.getByRole('heading', { name: 'Your income' })).toBeVisible();
  await page.goto(`${lettings[0]}/checks`);
  await expect(page.getByText('Verified: Mary Byrne.')).toBeVisible();

  // UX-PF-12: Niamh says no, and does the check with the provider.
  await niamh.page.goto(await checksLink(niamhEmail, '12 Ranelagh Road'));
  await expect(
    niamh.page.getByRole('heading', { name: /^Use the ID check you did on / }),
  ).toBeVisible();
  await niamh.page.getByRole('link', { name: 'No, I’ll do it again' }).click();
  await expect(niamh.page.getByRole('button', { name: 'Check my ID' })).toBeVisible();
  await niamh.page.getByRole('button', { name: 'Check my ID' }).click();
  await standInId(niamh.page, 'The ID and selfie match');
  // The new one is offered to keep; "Not now" leaves the one she kept as it was.
  await expect(
    niamh.page.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  const before = await keptFor(niamhEmail);
  await niamh.page.getByRole('link', { name: 'Not now' }).click();
  await expect(niamh.page.getByRole('heading', { name: 'Your income' })).toBeVisible();
  expect(await keptFor(niamhEmail)).toEqual(before);

  await mary.context.close();
  await maryAsRenter.context.close();
  await niamh.context.close();
});

test('UX-PF-8, UX-PF-12, UX-PF-9: a chosen renter keeps their ID check, says yes to it at the next home, which is when the operator sees it, and deleting the profile removes it', async ({
  browser,
  page,
}) => {
  test.setTimeout(420_000);
  const homes = ['12 Ranelagh Road', '14 Ranelagh Road'] as const;
  const aoife = await aPhone(browser);
  const email = uniqueEmail('aoife');
  const { lettings } = await applicantsAt(browser, page, homes, [
    { email, name: 'Aoife Byrne', page: aoife.page },
  ]);

  // The first home: chosen, she does the ID check, and is asked once whether to keep it.
  await chooseApplicant(page, lettings[0]!, { preferred: 'Aoife Byrne', backup: null });
  await signIn(aoife.page, email);
  await aoife.page.goto(await checksLink(email, homes[0]));
  // UX-PF-13: nothing kept, nothing offered: the check itself.
  await expect(aoife.page.getByRole('heading', { name: /^Use the ID check/ })).toHaveCount(0);
  await aoife.page.getByRole('button', { name: 'Check my ID' }).click();
  await standInId(aoife.page, 'The ID and selfie match');
  await expect(
    aoife.page.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  // Kept only when she chooses.
  expect(await keptFor(email)).toEqual([]);
  await expectReadable(aoife.page);
  await atBothWidths(aoife.page, 'keep-this');
  await aoife.page.getByRole('button', { name: 'Keep it' }).click();
  await expect(aoife.page.getByText('Your ID check is kept on your profile')).toBeVisible();
  await expect(aoife.page.getByRole('heading', { name: 'Your income' })).toBeVisible();
  expect(await keptFor(email)).toHaveLength(1);

  // The second home: chosen too. Its operator sees nothing of it yet.
  await chooseApplicant(page, lettings[1]!, { preferred: 'Aoife Byrne', backup: null });
  await page.goto(`${lettings[1]}/checks`);
  await expect(page.getByText('Not started yet.').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('Verified:');

  await aoife.page.goto(await checksLink(email, homes[1]));
  await expect(
    aoife.page.getByRole('heading', { name: /^Use the ID check you did on \d{1,2} \w+\?$/ }),
  ).toBeVisible();
  await expect(aoife.page.getByText(/It’s in the name Aoife Byrne\./)).toBeVisible();
  await aoife.page.getByRole('button', { name: 'Yes, use it' }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Your income' })).toBeVisible();
  // Only now, with her yes, does the operator see it.
  await page.goto(`${lettings[1]}/checks`);
  await expect(page.getByText('Verified: Aoife Byrne.')).toBeVisible();

  // Profile: the ID check, with "My name has changed". No expiry is shown, because there isn't one.
  await aoife.page.goto('/profile');
  const row = aoife.page.getByRole('region', { name: 'ID check' });
  await expect(row.getByText(/^Aoife Byrne, checked on /)).toBeVisible();
  await expect(row.getByRole('button', { name: 'My name has changed' })).toBeVisible();
  await atBothWidths(aoife.page, 'profile');
  const download = await aoife.page.request.get('/profile/download');
  expect(((await download.json()) as { idCheck: unknown }).idCheck).toMatchObject({
    passed: true,
    name: 'Aoife Byrne',
  });

  // Deleting the profile removes it at once.
  await aoife.page.getByRole('button', { name: 'Delete my profile' }).click();
  const sheet = aoife.page.getByRole('dialog', { name: 'Delete your profile?' });
  await sheet.getByRole('button', { name: 'Delete my profile' }).click();
  await confirmItsYou(aoife.page);
  await expect(
    aoife.page.getByRole('heading', { level: 1, name: 'Your profile is deleted' }),
  ).toBeVisible();
  expect(
    await asSystem(
      `select 1 from verified_identities v where not exists (select 1 from users u where u.id = v.user_id)`,
      [],
    ),
  ).toEqual([]);
  const [{ count } = { count: -1 }] = await asSystem<{ count: number }>(
    `select count(*)::int as count from verified_identities v
     join users u on u.id = v.user_id where u.email = $1`,
    [email],
  );
  expect(count).toBe(0);
  await aoife.context.close();
});

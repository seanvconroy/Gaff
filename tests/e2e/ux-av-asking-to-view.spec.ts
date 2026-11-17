import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import {
  addHomeThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  signUpRenter,
  uniqueEmail,
} from './support';

/**
 * Work package WP-22: asking to view (UX-AV-1 to UX-AV-9). A renter finds a home on Gaff and
 * asks to view it with no account, confirms by email, and is in the operator's letting with
 * "Gaff" as their source; with a profile it is two taps; what they told search is carried in to
 * confirm; someone who enquired on Daft and then on Gaff is one person; and nothing beyond a
 * name, an email and the answers is collected. Screenshots are screenshots/wp22-<screen>-<width>.png.
 */

const widths = [
  ['390', { width: 390, height: 844 }],
  ['1280', { width: 1280, height: 900 }],
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

const SUBJECT = (address: string) => `Your enquiry about ${address}`;

/** A live home on gaff.ie, put live through the real screens. Up to 3 people, no pets. */
async function aLiveHomeOnGaff(page: Page, address: string) {
  await addHomeThroughUi(page, address);
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  const lettingId = homeIdIn(page.url());
  await goLiveThroughUi(page);
  const [row] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  return { ref: row!.ref, homePath: `/homes/${row!.ref}`, lettingPath: `/lettings/${lettingId}` };
}

async function visitor(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  return { context, page: await context.newPage() };
}

/** The renter's application to the letting, as stored. */
async function stored(lettingPath: string, email: string) {
  return asSystem<Record<string, unknown>>(
    `select full_name, email, phone, earning, monthly_income_cents, answers, sources
     from applications where letting_id = $1 and email_normalised = lower($2)`,
    [lettingPath.split('/').at(-1), email],
  );
}

/** The link in the first email, once the job has sent it. */
async function firstEmailLink(email: string, address: string): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      link = await linkInEmail(email, SUBJECT(address)).catch(() => '');
      return link;
    })
    .toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);
  return link;
}

/** Every field the asking form can send, across its screens: what it collects (UX-AV-4). */
async function fieldNames(page: Page): Promise<string[]> {
  return page
    .locator('form')
    .first()
    .evaluate((form) =>
      [
        ...new Set(
          [...form.querySelectorAll('input, textarea, select')].map(
            (f) => (f as HTMLInputElement).name,
          ),
        ),
      ]
        .filter((name) => name && name !== 'attempt' && !name.startsWith('$'))
        .sort(),
    );
}

/** UX-AV-8: everyone who enquired, on the letting's People view. */
async function theLettingsEnquiries(page: Page, lettingPath: string) {
  await page.goto(`${lettingPath}?view=people`);
  return page.getByRole('region', { name: 'Everyone who enquired' });
}

test('UX-AV-1, UX-AV-4 to UX-AV-8: a renter with no account asks to view, confirms by email, and is in the letting from Gaff', async ({
  browser,
  page,
}) => {
  test.slow();
  const agency = `Halcyon Lettings ${String(Date.now()).slice(-5)}`;
  await signUpOperator(page, agency);
  const address = '14 Ranelagh Road';
  const home = await aLiveHomeOnGaff(page, address);

  for (const [width, viewport] of widths) {
    const renter = uniqueEmail(`renter${width}`);
    const name = width === '390' ? 'Ciara Walsh' : 'Orla Nolan';
    const { context, page: phone } = await visitor(browser, viewport);
    await phone.goto(home.homePath);
    await phone
      .getByRole('complementary', { name: 'Ask to view' })
      .getByRole('link', { name: 'Ask to view' })
      .click();

    // 1. Who should we reply to? A name and an email are enough (UX-AV-1).
    await expect(
      phone.getByRole('heading', { level: 1, name: 'Who should we reply to?' }),
    ).toBeVisible();
    await expect(phone.getByText('You don’t need an account.')).toBeVisible();
    // UX-AV-4, UX-AV-5: the form holds a name, an email, the home's questions and one question
    // about the home. No phone number, no work or income, no documents, no "about me".
    expect(await fieldNames(phone)).toEqual(
      ['email', 'fullName', 'hasPets', 'occupants', 'question'].sort(),
    );
    await expect(phone.locator('input[type="file"]')).toHaveCount(0);
    await expectAccessible(phone);
    await screenshot(phone, `wp22-01-who-${width}`);

    // Errors are at the field (UX-FL-3).
    await phone.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(phone.getByText('Enter your first and last name.')).toBeVisible();
    await phone.getByLabel('Your name').fill(name);
    await phone.getByLabel('Your email').fill(renter);
    await phone.getByRole('button', { name: 'Next', exact: true }).click();

    // 2. The home's questions, one per screen.
    await expect(
      phone.getByRole('heading', { name: 'How many people would live here, including you?' }),
    ).toBeVisible();
    await expectAccessible(phone);
    await screenshot(phone, `wp22-02-question-${width}`);
    await phone.getByRole('radio', { name: '2', exact: true }).check();
    await phone.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(phone.getByRole('heading', { name: 'Do you have any pets?' })).toBeVisible();
    await phone.getByRole('radio', { name: 'No', exact: true }).check();
    await phone.getByRole('button', { name: 'Next', exact: true }).click();

    // 4. Anything to ask about the home? One box, and Skip beside the button.
    await expect(
      phone.getByRole('heading', { name: 'Anything to ask about the home?' }),
    ).toBeVisible();
    await expect(phone.getByRole('button', { name: 'Skip' })).toBeVisible();
    await phone.getByLabel(/Your question/).fill('Is there somewhere to keep a bike?');
    await expectAccessible(phone);
    await screenshot(phone, `wp22-03-anything-to-ask-${width}`);
    await phone.getByRole('button', { name: 'Send', exact: true }).click();

    // 5. Sent: the assistant replies, a person decides, and check your email (UX-AV-6, UX-PP-3).
    await expect(phone.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
    await expect(phone.getByText(/Check your email to confirm it’s you/)).toBeVisible();
    await expect(
      phone.getByText(`${agency}’s AI assistant will reply, and a person there decides who views.`),
    ).toBeVisible();
    expect(phone.url()).not.toContain(encodeURIComponent(renter));
    await expectAccessible(phone);
    await screenshot(phone, `wp22-04-sent-${width}`);

    // UX-AV-6: nothing reaches the letting until the link in the first email is opened.
    expect(await stored(home.lettingPath, renter)).toEqual([]);
    await page.goto(`${home.lettingPath}?view=people`);
    await expect(page.getByRole('main')).not.toContainText(name);

    // UX-AV-7: the first email is the fixed first reply, with the link to the same private page.
    const link = await firstEmailLink(renter, address);
    await phone.goto(link);
    await expect(phone.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
    await expectAccessible(phone);
    await screenshot(phone, `wp22-05-confirmed-${width}`);
    await context.close();

    // UX-AV-8: in the letting now, with Gaff as where they came from. No forwarding needed.
    const table = await theLettingsEnquiries(page, home.lettingPath);
    const row = table.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('Gaff');
    // UX-AV-4: what's stored is a name, an email and the answers, and nothing else.
    expect(await stored(home.lettingPath, renter)).toEqual([
      {
        full_name: name,
        email: renter,
        phone: null,
        earning: null,
        monthly_income_cents: null,
        answers: { occupants: 2, hasPets: false },
        sources: ['gaff'],
      },
    ]);
  }
});

test('UX-AV-2: a renter with a profile and kept answers asks in two taps', async ({
  browser,
  page,
}) => {
  test.slow();
  const agency = `Halcyon Lettings ${String(Date.now()).slice(-5)}`;
  await signUpOperator(page, agency);
  const address = '16 Ranelagh Road';
  const home = await aLiveHomeOnGaff(page, address);

  for (const [width, viewport] of widths) {
    const { context, page: phone } = await visitor(browser, viewport);
    const email = await signUpRenter(phone, 'Aoife Byrne');
    // What their profile keeps from an earlier enquiry (UX-PF-2): the four answers only.
    await asSystem(
      `insert into renter_profiles (user_id, keeps_details, answers, answers_at, last_used_at)
       select id, true, $2::jsonb, now(), now() from users where email = $1
       on conflict (user_id) do update set answers = excluded.answers, answers_at = now()`,
      [email, JSON.stringify({ occupants: 2, hasPets: false })],
    );
    await phone.goto(home.homePath);

    // Tap 1.
    await phone
      .getByRole('complementary', { name: 'Ask to view' })
      .getByRole('link', { name: 'Ask to view' })
      .click();
    await expect(
      phone.getByRole('heading', { level: 1, name: `Send this to ${agency}?` }),
    ).toBeVisible();
    // Exactly what will be sent: who they are, and their answers (UX-PF-3: offered back).
    await expect(phone.getByText('Aoife Byrne')).toBeVisible();
    await expect(phone.getByText(email)).toBeVisible();
    await expect(phone.getByText('2 people')).toBeVisible();
    await expect(phone.getByText('From your profile.')).toBeVisible();
    await expectAccessible(phone);
    await screenshot(phone, `wp22-06-two-taps-${width}`);

    // Tap 2.
    await phone.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(phone.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
    // A verified address needs no wait (UX-AV-6).
    await expect(phone.getByText(/Check your email/)).toHaveCount(0);
    await expect(phone.getByText(/It’s in your Enquiries/)).toBeVisible();
    await expectAccessible(phone);
    await screenshot(phone, `wp22-07-sent-signed-in-${width}`);

    // UX-AV-8: in the letting at once, from Gaff.
    expect(await stored(home.lettingPath, email)).toMatchObject([
      { full_name: 'Aoife Byrne', answers: { occupants: 2, hasPets: false }, sources: ['gaff'] },
    ]);
    const table = await theLettingsEnquiries(page, home.lettingPath);
    await expect(table.getByRole('row').filter({ hasText: 'Aoife Byrne' })).toContainText('Gaff');

    // UX-AV-9: "Ask to view" again opens their enquiry, not a second one.
    await phone.goto(home.homePath);
    await phone
      .getByRole('complementary', { name: 'Ask to view' })
      .getByRole('link', { name: 'Ask to view' })
      .click();
    await expect(phone).toHaveURL(/\/r\/[A-Za-z0-9_-]{43}/);
    await expect(phone.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
    expect(await stored(home.lettingPath, email)).toHaveLength(1);
    await context.close();
  }
});

test('UX-AV-3: what the renter told search is carried in, and nothing is sent until they confirm', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page, `Halcyon Lettings ${String(Date.now()).slice(-5)}`);
  const address = '18 Ranelagh Road';
  const home = await aLiveHomeOnGaff(page, address);
  const renter = uniqueEmail('niamh');

  const { context, page: phone } = await visitor(browser, widths[0][1]);
  await phone.goto('/?people=2&pets=no');
  // The card links to the home with the search's answers, and nothing else of the search.
  const card = phone.locator(`a[href^="${home.homePath}"]`).first();
  await expect(card).toHaveAttribute('href', `${home.homePath}?people=2&pets=no`);
  await card.click();
  await phone
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await phone.getByLabel('Your name').fill('Niamh Kelly');
  await phone.getByLabel('Your email').fill(renter);
  await phone.getByRole('button', { name: 'Next', exact: true }).click();

  // "Is this right?" with what they searched for, each with "Change". Not asked again.
  await expect(phone.getByRole('heading', { level: 1, name: 'Is this right?' })).toBeVisible();
  await expect(phone.getByText('You searched for 2 people and no pets.')).toBeVisible();
  await expectAccessible(phone);
  await screenshot(phone, 'wp22-08-is-this-right-390');
  await phone.setViewportSize(widths[1][1]);
  await expectAccessible(phone);
  await screenshot(phone, 'wp22-08-is-this-right-1280');
  await phone.setViewportSize(widths[0][1]);

  // Change one: it opens that question, and Done comes back.
  await phone.getByRole('button', { name: 'Change people' }).click();
  await expect(
    phone.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();
  await phone.getByRole('radio', { name: '3', exact: true }).check();
  await phone.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Is this right?' })).toBeVisible();
  await expect(phone.getByText('3 people')).toBeVisible();

  // Nothing has reached the letting, or even waits, until they press Send.
  expect(await stored(home.lettingPath, renter)).toEqual([]);
  expect(await asSystem('select id from waiting_enquiries where email = $1', [renter])).toEqual([]);

  await phone.getByRole('button', { name: 'Next', exact: true }).click();
  await phone.getByRole('button', { name: 'Skip' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
  await phone.goto(await firstEmailLink(renter, address));
  await expect(phone.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
  await context.close();
  expect(await stored(home.lettingPath, renter)).toMatchObject([
    { answers: { occupants: 3, hasPets: false }, sources: ['gaff'] },
  ]);
});

test('UX-AV-9: someone who enquired on Daft and then asked to view on Gaff is one person in the letting', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page, `Halcyon Lettings ${String(Date.now()).slice(-5)}`);
  const address = '12 Ranelagh Road';
  const home = await aLiveHomeOnGaff(page, address);
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect
    .poll(async () => (await stored(home.lettingPath, 'aoife.byrne@example.ie')).length)
    .toBe(1);

  const { context, page: phone } = await visitor(browser, widths[0][1]);
  await phone.goto(`${home.homePath}/ask`);
  await phone.getByLabel('Your name').fill('Aoife Byrne');
  await phone.getByLabel('Your email').fill('aoife.byrne@example.ie');
  await phone.getByRole('button', { name: 'Next', exact: true }).click();
  await phone.getByRole('radio', { name: '1', exact: true }).check();
  await phone.getByRole('button', { name: 'Next', exact: true }).click();
  await phone.getByRole('radio', { name: 'No', exact: true }).check();
  await phone.getByRole('button', { name: 'Next', exact: true }).click();
  await phone.getByRole('button', { name: 'Skip' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
  // The newest first email is Gaff's own; Daft's came first.
  await expect
    .poll(
      async () =>
        (
          await asSystem<{ n: number }>(
            `select count(*)::int as n from dev_outbox where to_address = $1 and subject = $2`,
            ['aoife.byrne@example.ie', SUBJECT(address)],
          )
        )[0]!.n,
    )
    .toBeGreaterThanOrEqual(2);
  await phone.goto(await firstEmailLink('aoife.byrne@example.ie', address));
  await expect(phone.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
  await context.close();

  const people = await stored(home.lettingPath, 'aoife.byrne@example.ie');
  expect(people).toHaveLength(1);
  expect(people[0]).toMatchObject({
    sources: ['gaff', 'daft'],
    answers: { occupants: 1, hasPets: false },
  });
  const table = await theLettingsEnquiries(page, home.lettingPath);
  await expect(table.getByRole('row').filter({ hasText: 'Aoife Byrne' })).toContainText(
    'Gaff and Daft',
  );
  await expect(table.getByRole('row').filter({ hasText: 'Aoife Byrne' })).toHaveCount(1);
  await expectAccessible(page);
  await screenshot(page, 'wp22-09-one-person-1280');
});

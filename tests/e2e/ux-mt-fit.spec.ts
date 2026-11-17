import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import { AOIFE, CIARAN, happeningBlock, onPhone } from './journeys';
import { answerQuestions, expectRenterPageAtBothWidths } from './renter';
import {
  addATime,
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  signUpRenter,
} from './support';

/**
 * Work package WP-25, fit (section 6 of the UX redesign; UX-MT-1 to UX-MT-11, UX-MT-16 to
 * UX-MT-18, UX-LP-15, UX-AI-6, UX-AI-7). CLAUDE.md's rules 1 and 3 made visible: Gaff never
 * recommends a person; it shows who meets what was asked, and a person chooses.
 */

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

/** The page at both widths, phone first: axe, nothing wider than the screen, a screenshot. */
async function atBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-mt-${name}-${width}`);
  }
}

const photo = (name: string, colour: [number, number, number]) => ({
  name,
  mimeType: 'image/png',
  buffer: aPng(colour),
});

test('UX-MT-3 to UX-MT-11, UX-LP-15: letting details everywhere, an unlawful line’s lawful version, fit, the pool and asking about who’s enquired', async ({
  browser,
  page,
}) => {
  test.slow();
  test.setTimeout(300_000);
  await signUpOperator(page);
  // A home that will have a public page: three photos, a BER, a viewing time.
  await addHomeThroughUi(page, '12 Ranelagh Road');
  await page
    .getByLabel('Choose photos')
    .setInputFiles([
      photo('front.png', [36, 99, 168]),
      photo('kitchen.png', [201, 140, 60]),
      photo('garden.png', [90, 140, 90]),
    ]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(3);
  const lettingId = homeIdIn(page.url());
  const lettingUrl = `/lettings/${lettingId}`;
  await page.goto(`${lettingUrl}/viewings`);
  await addATime(page, isoDateInDays(7));
  await goLiveThroughUi(page);

  // UX-MT-3: the letting details are Gaff's fixed words, the same on the letting's page and on
  // the home's public page.
  await page.goto(`${lettingUrl}?view=home`);
  const details = page.getByRole('region', { name: 'Letting details' });
  const onLetting = await details.getByRole('listitem').allInnerTexts();
  expect(onLetting).toEqual(['Up to 3 people', 'No pets (assistance dogs always welcome)']);
  const [row] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  const homePath = `/homes/${row!.ref}`;
  const visitor = await browser.newContext({ locale: 'en-IE' });
  const publicPage = await visitor.newPage();
  await publicPage.goto(homePath);
  const publicDetails = publicPage.getByRole('region', { name: 'Letting details' });
  expect((await publicDetails.getByRole('listitem').allInnerTexts()).slice(1)).toEqual(onLetting);
  await visitor.close();

  // UX-MT-4: wording that says who should live there is left out, with its lawful version.
  await page
    .getByRole('region', { name: 'Description' })
    .getByRole('link', { name: 'Change description' })
    .click();
  await page.getByLabel('About this home').fill('A bright flat. Would suit a working couple.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const problem = page.locator('#field-description-error');
  await expect(problem).toContainText('says who should live there');
  await expect(problem).toContainText('Did you mean “Up to 2 people”? Set it in Letting details.');
  await expectAccessible(page);
  await screenshot(page, 'ux-mt-lawful-version');

  // Two renters enquire and answer: Aoife fits everything; Ciarán is 4 people with a pet.
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });
  await sendTestEmail(page, { to, ...myhomeEnquiry, replyTo: '' });
  for (const [email, answers] of [
    [AOIFE, ['2', 'No']],
    [CIARAN, ['4', 'Yes']],
  ] as const) {
    let link = '';
    await expect(async () => {
      link = await linkInEmail(email, 'Your enquiry about 12 Ranelagh Road');
    }).toPass({ timeout: 20_000 });
    const renter = await onPhone(browser, link);
    await answerQuestions(renter.page, answers);
    // UX-MT-11: "Thanks" shows their answers beside the letting details, without judgement.
    const thanks = renter.page.getByRole('main');
    await expect(renter.page.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
    if (email === CIARAN) {
      await expect(thanks.getByText('You said: 4 people. This home is for up to 3.')).toBeVisible();
      await expect(
        thanks.getByText(
          'You said: you have pets. This home doesn’t take pets. Assistance dogs are always welcome.',
        ),
      ).toBeVisible();
      expect(await thanks.innerText()).not.toMatch(
        /sorry|unfortunately|not suitable|qualify|eligible|doesn’t meet/i,
      );
      await expectRenterPageAtBothWidths(renter.page, { shots: 'ux-mt-renter-thanks' });
    } else {
      await expect(thanks.getByText('You said: 2 people. This home is for up to 3.')).toBeVisible();
    }
    await renter.context.close();
  }

  // UX-MT-7, UX-MT-9: the pool summary from counts, naming criteria and never people, and what
  // each criterion is costing before anyone is invited.
  await page.goto(lettingUrl);
  const happening = happeningBlock(page);
  await expect(
    happening.getByText(
      'Of 2 people who’ve answered, 1 meets everything. The most common miss is the number of people: 1 is more than 3 people.',
    ),
  ).toBeVisible();
  expect(await happening.innerText()).not.toMatch(/Aoife|Ciarán/);
  await happening.getByText('What each one is costing you').click();
  await expect(
    happening.getByText('1 is more than 3 people. Without it, nobody more would meet everything.'),
  ).toBeVisible();
  await expect(happening.getByRole('link', { name: 'Change letting details' })).toBeVisible();
  await atBothWidths(page, 'pool-summary');

  // UX-MT-6, UX-MT-8: People keeps everyone, each with "Meets n of n" and the detail one tap away.
  await page.goto(`${lettingUrl}?view=people`);
  const people = page.getByRole('region', { name: 'Everyone who enquired' });
  await expect(people.getByRole('row')).toHaveCount(3);
  await expect(people.getByRole('row').nth(1)).toContainText('Aoife Byrne');
  await expect(people.getByRole('row').nth(1)).toContainText('Meets 2 of 2');
  await expect(people.getByRole('row').nth(2)).toContainText('Meets 0 of 2');
  await people.getByRole('link', { name: 'Ciarán Ó Súilleabháin' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ciarán Ó Súilleabháin' });
  const fit = sheet.getByRole('region', { name: 'What you asked' });
  await expect(fit.getByText('Said 4 people. Doesn’t meet this.')).toBeVisible();
  await expect(fit.getByText('Said pets. Doesn’t meet this.')).toBeVisible();
  await expect(sheet.getByText(/%|score/i)).toHaveCount(0);
  await atBothWidths(page, 'person-fit');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // UX-LP-15: an allowed question becomes chips on their answers, and filters the list.
  const ask = page.getByLabel('Ask about who’s enquired');
  await ask.fill('Who has no pets?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const answers = page.getByRole('navigation', { name: 'Their answers' });
  await expect(answers.getByRole('link', { name: 'No pets' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(people.getByRole('row')).toHaveCount(2);
  await expect(people.getByRole('row').nth(1)).toContainText('Aoife Byrne');
  await expect(page.getByText(/^Showing 1 of 2\./)).toBeVisible();
  // The question goes nowhere: not into the address.
  expect(decodeURIComponent(page.url())).not.toMatch(/Who|pets\?/);
  await atBothWidths(page, 'ask-filter');
  // The same chips set by tapping: off again, and everyone is back in the same order.
  await answers.getByRole('link', { name: 'No pets' }).click();
  await expect(people.getByRole('row')).toHaveCount(3);
  await answers.getByRole('link', { name: 'Up to 3 people' }).click();
  await expect(people.getByRole('row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Clear', exact: true }).click();
  await expect(people.getByRole('row')).toHaveCount(3);

  // UX-MT-17, UX-MT-18: anything else is declined, in fixed words that name nobody.
  await ask.fill('Who is the best tenant?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const declined = page.getByRole('status').filter({ hasText: 'Gaff can sort people only' });
  await expect(declined).toContainText(
    'Gaff can sort people only by what you asked everyone: move-in date, length of stay, number of people and pets.',
  );
  await expect(declined).toContainText('Tap one of these instead, or ask another way.');
  expect(await declined.innerText()).not.toMatch(/Aoife|Ciarán/);
  await expect(people.getByRole('row')).toHaveCount(3);
  await atBothWidths(page, 'ask-declined');
  await ask.fill('Any families?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(declined).toBeVisible();
  await expect(people.getByRole('row')).toHaveCount(3);

  // UX-MT-6: in the decision flow, "Meets n of n" with the detail on tap.
  await page.goto(`${lettingUrl}/who-views`);
  await expect(page.getByRole('checkbox', { name: 'Aoife Byrne', exact: true })).toBeVisible();
  await expect(page.getByText('Meets 2 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Why here: Ciarán Ó Súilleabháin' }).click();
  await expect(
    page.getByText(/^Meets 0 of 2 criteria \(more than 3 people, has pets\)/),
  ).toBeVisible();
  await atBothWidths(page, 'who-views-fit');

  // UX-MT-10: a signed-in renter's kept answers beside the home's letting details.
  const renting = await browser.newContext({ locale: 'en-IE' });
  const renter = await renting.newPage();
  const email = await signUpRenter(renter, 'Niamh Walsh');
  await asSystem(
    `insert into renter_profiles (user_id, answers, answers_at)
     select id, '{"occupants": 4, "hasPets": false}'::jsonb, now() from users where email = $1
     on conflict (user_id) do update set answers = excluded.answers, answers_at = now()`,
    [email],
  );
  await renter.goto(homePath);
  const kept = renter.getByRole('region', { name: 'Letting details' });
  await expect(kept.getByText('From the answers on your profile:')).toBeVisible();
  await expect(kept.getByText('You said: 4 people. This home is for up to 3.')).toBeVisible();
  await expect(
    kept.getByText('You said: no pets. This home doesn’t take pets.', { exact: false }),
  ).toBeVisible();
  await atBothWidths(renter, 'home-kept-answers');
  await renting.close();
});

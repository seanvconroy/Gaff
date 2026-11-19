import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import {
  AOIFE,
  CIARAN,
  applyOnPhone,
  chooseApplicant,
  chooseWhoViews,
  expectOverview,
  happeningBlock,
  needsYouBlock,
  onPhone,
  openHistory,
  openLettingMenu,
  recordComparablesThroughUi,
  sendTheOffer,
} from './journeys';
import { bookFirstTime } from './renter';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  startViewingsNow,
} from './support';

/**
 * WP-15, a letting's page (section 4, "A letting's page"): the header and four parts, Overview's
 * three blocks at each of the nine stages, People with its chips and sheet, Home with its Change
 * links, and History. Each screen at 390px and 1280px, with an axe check.
 */

/** Two made-up enquiries that ask nothing, so no answer waits to be approved. */
const aoifeEnquires = {
  ...daftEnquiry,
  text: daftEnquiry.text.replace(
    'Hi, is the apartment still available? Is there parking?',
    'Hi, I’d love to see it.',
  ),
};
const ciaranEnquires = {
  ...myhomeEnquiry,
  replyTo: '',
  text: myhomeEnquiry.text.replace(' When is it available from?', ''),
};

/** The page at both widths, phone first: axe, nothing wider than the screen, a screenshot. */
async function atBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lp-${name}-${width}`);
  }
}

/** Test-only time travel on a tenancy: every step done but finishing. The app can't do this. */
async function everyTenancyStepDone(lettingUrl: string) {
  const lettingId = /\/lettings\/([0-9a-f-]{36})/.exec(lettingUrl)![1];
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    await client.query(
      `update tenancies set agreement_status = 'signed_on_paper', agreement_sent_at = now(),
         payment_requested_at = now(), payment_received_at = now(), rtb_registered_at = now(),
         move_in_completed_at = now(), inventory_shared_at = now()
       where letting_id = $1`,
      [lettingId],
    );
    await client.query('commit');
  } finally {
    await client.end();
  }
}

test('UX-LP-1, UX-LP-2, UX-LP-3: one letting through all nine stages, with the task and three blocks at each', async ({
  browser,
  page,
}) => {
  test.slow();
  test.setTimeout(400_000);
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  const lettingUrl = page
    .url()
    .replace(/\/viewings.*$/, '')
    .replace(/\?.*$/, '');
  const progress = page.getByRole('list', { name: 'How far it’s got' });

  // 1 Set up.
  await page.goto(lettingUrl);
  await expectOverview(page, {
    task: 'Continue',
    says: /Finish setting up\. \d steps left\./,
    figures: [],
    next: 'When it’s live, Gaff answers every enquiry within minutes.',
  });
  await expect(progress.getByRole('listitem')).toHaveText(['Set up', 'Find', 'Choose', 'Sign']);
  await expect(page.getByText(/Step \d of 9/)).toHaveCount(0);
  await atBothWidths(page, 'stage-1-setup');

  // 2 Enquiries: live, and nobody yet. Nothing needs you.
  await goLiveThroughUi(page);
  await expectOverview(page, {
    says: 'Gaff is answering enquiries.',
    figures: ['Enquiries', 'Answered the questions', 'Meet everything you asked'],
    next: 'Next, you choose who views. Do it whenever you’re ready.',
  });
  await expect(progress).toContainText('Find · Enquiries');
  await atBothWidths(page, 'stage-2-enquiries');

  // 3 Shortlist: two have enquired, and the task is Today's, in Today's words.
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...aoifeEnquires });
  await sendTestEmail(page, { to, ...ciaranEnquires });
  await expect(async () => {
    await page.goto(lettingUrl);
    await expect(needsYouBlock(page).getByText(/2 people are waiting to hear/)).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await expectOverview(page, {
    task: 'Choose who views',
    figures: ['Enquiries', 'Answered the questions', 'Meet everything you asked'],
    next: 'Gaff invites the people you choose and tells everyone else where they stand.',
  });
  await expect(happeningBlock(page).getByRole('definition').first()).toHaveText('2');
  await atBothWidths(page, 'stage-3-shortlist');
  await page.goto('/today');
  await expect(
    page.getByRole('link', { name: /^Choose who views · 12 Ranelagh Road/ }),
  ).toContainText('2 people are waiting to hear');
  // The task leads to the same flow Today's row does.
  await page.goto(lettingUrl);
  await needsYouBlock(page).getByRole('link', { name: 'Choose who views' }).click();
  await expect(page).toHaveURL(`${lettingUrl}/who-views`);

  // 4 Viewings: before the day, nothing needs you.
  await chooseWhoViews(page, lettingUrl, {
    waitFor: 'Ciarán Ó Súilleabháin',
    tick: ['Aoife Byrne', 'Ciarán Ó Súilleabháin'],
  });
  const links: Record<string, string> = {};
  for (const email of [AOIFE, CIARAN]) {
    await expect(async () => {
      links[email] = await linkInEmail(email, 'Book a viewing: 12 Ranelagh Road');
    }).toPass({ timeout: 20_000 });
    const renter = await onPhone(browser, links[email]!);
    await bookFirstTime(renter.page);
    await renter.context.close();
  }
  await page.goto(lettingUrl);
  await expectOverview(page, {
    says: 'Gaff is booking viewings and sending the reminders.',
    figures: ['Places booked', 'On the waiting list', 'Next viewing'],
    next: 'After each viewing, Gaff invites the people who came to apply.',
  });
  await expect(progress).toContainText('Find · Viewings');
  await atBothWidths(page, 'stage-4-viewings');

  // On the day: Mark who came.
  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto(lettingUrl);
  await expectOverview(page, { task: 'Mark who came', says: /2 people to mark/ });
  await atBothWidths(page, 'stage-4-on-the-day');
  await needsYouBlock(page).getByRole('link', { name: 'Mark who came' }).click();
  for (const name of ['Aoife Byrne', 'Ciarán Ó Súilleabháin']) {
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  // 5 Applications: both apply; choose an applicant.
  await applyOnPhone(browser, links[AOIFE]!, '5,200');
  await applyOnPhone(browser, links[CIARAN]!, '4,800');
  await page.goto(lettingUrl);
  await expectOverview(page, {
    task: 'Choose an applicant',
    says: '2 people have applied.',
    figures: ['Came to view', 'Applied'],
    next: 'Gaff checks only the person you choose and one backup.',
  });
  await expect(progress).toContainText('Choose · Applications');
  await atBothWidths(page, 'stage-5-applications');

  // 6 Checks: under way, so nothing needs you.
  await chooseApplicant(page, lettingUrl, {
    preferred: 'Aoife Byrne',
    backup: 'Ciarán Ó Súilleabháin',
  });
  await page.goto(lettingUrl);
  await expectOverview(page, {
    says: /Checks under way for Aoife and Ciarán/,
    figures: ['Aoife’s checks', 'Ciarán’s checks'],
    next: 'When the checks are back, you make the offer.',
  });
  await expect(progress).toContainText('Choose · Checks');
  await atBothWidths(page, 'stage-6-checks');

  // 7 Offer: the owner has approved and the comparables are in: make the offer.
  await recordComparablesThroughUi(page, lettingUrl);
  await page.goto(`${lettingUrl}/approval`);
  await page.getByRole('button', { name: 'The owner has already approved' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recorded: the owner has approved' }),
  ).toBeVisible();
  await page.goto(lettingUrl);
  await expectOverview(page, { task: 'Make the offer', figures: ['Owner’s answer', 'Offer'] });
  await expect(progress).toContainText('Choose · Offer');
  await atBothWidths(page, 'stage-7-offer');
  await needsYouBlock(page).getByRole('link', { name: 'Make the offer' }).click();
  await sendTheOffer(page, { withoutChecks: true });
  await page.goto(lettingUrl);
  await expectOverview(page, {
    says: /The offer is with Aoife until /,
    figures: ['Owner’s answer', 'Offer'],
    next: 'When Aoife accepts, Gaff tells everyone else and prepares the tenancy.',
  });
  await atBothWidths(page, 'stage-7-offer-out');

  // 8 Tenancy: Aoife accepts; the next tenancy step, one at a time.
  let offerLink = '';
  await expect(async () => {
    offerLink = await linkInEmail(AOIFE, 'An offer: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, offerLink);
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(aoife.page.getByText(/You’ve accepted the offer/)).toBeVisible();
  await aoife.context.close();
  await page.goto(lettingUrl);
  await expectOverview(page, {
    task: 'Send the tenancy agreement',
    // UX-LP-4: the task already says when it starts, so no figure says it again.
    says: /The tenancy starts on /,
    figures: ['Steps done'],
    next: /After that: /,
  });
  await expect(progress).toContainText('Sign · Tenancy');
  await expect(page.getByRole('link', { name: 'The tenancy, step by step' })).toBeVisible();
  await atBothWidths(page, 'stage-8-tenancy');

  // 9 Close: every step done, then finished.
  await everyTenancyStepDone(lettingUrl);
  await page.goto(lettingUrl);
  await expectOverview(page, {
    task: 'Finish and close the letting',
    figures: ['Days to let', 'Time saved'],
  });
  await expect(progress).toContainText('Sign · Close');
  await atBothWidths(page, 'stage-9-close');
  await needsYouBlock(page).getByRole('link', { name: 'Finish and close the letting' }).click();
  await expect(page).toHaveURL(`${lettingUrl}/finish`);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/\/(finish\/usual|let)$/);
  await page.goto(lettingUrl);
  await expectOverview(page, {
    says: 'This letting is closed.',
    figures: ['Days to let', 'Time saved'],
  });
  await atBothWidths(page, 'stage-9-finished');
});

test('UX-LP-8, UX-LP-9, UX-LP-10: People lists everyone, with the stage’s chips and a sheet for each person, at both widths', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...aoifeEnquires });
  await sendTestEmail(page, { to, ...ciaranEnquires });

  const people = page.getByRole('region', { name: 'Everyone who enquired' });
  await expect(async () => {
    await page.goto(`${lettingUrl}?view=people`);
    await expect(people.getByRole('row')).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const chips = page.getByRole('navigation', { name: 'Show' });
  // UX-LP-8: the chips for enquiries, opening on everyone, in the ranking's order.
  await expect(chips.getByRole('link')).toHaveText(['All', 'Answered', 'Not yet']);
  await expect(chips.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'true');
  await expect(people.getByRole('row').nth(1)).toContainText('Aoife Byrne');
  await expect(people.getByRole('row').nth(1)).toContainText('Hasn’t answered the questions yet');
  await expect(people.getByRole('row').nth(2)).toContainText('Ciarán Ó Súilleabháin');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    // UX-LP-10: a table on a desktop and a card each on a phone, the same words, never sideways.
    const row = people.getByRole('row').nth(1);
    await expect
      .poll(() => row.evaluate((element) => getComputedStyle(element).display))
      .toBe(width === 1280 ? 'table-row' : 'grid');
    // UX-LP-10: each card reads the name with where they came from under it, one line on where
    // they stand, then the status. Where they came from starts under the name, not beside it.
    const name = row.getByRole('link', { name: 'Aoife Byrne' });
    const via = row.getByText('Through Daft');
    const [nameBox, viaBox] = [await name.boundingBox(), await via.boundingBox()];
    expect(viaBox!.x).toBe(nameBox!.x);
    expect(viaBox!.y).toBeGreaterThan(nameBox!.y);
    if (width === 390) {
      const stand = row.getByText('Hasn’t answered the questions yet');
      const standBox = await stand.boundingBox();
      expect(standBox!.x).toBe(nameBox!.x);
      await expect(row.getByRole('cell').first()).not.toHaveAttribute('data-label');
    }
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lp-people-${width}`);
  }
  await chips.getByRole('link', { name: 'Answered' }).click();
  await expect(page.getByText('Nobody here just now. Choose All to see everyone.')).toBeVisible();
  await chips.getByRole('link', { name: 'Not yet' }).click();
  await expect(people.getByRole('row')).toHaveCount(3);

  // UX-LP-9: a person's sheet: what they've told Gaff, what's happened, and their conversation.
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await people.getByRole('link', { name: 'Aoife Byrne' }).click();
    const sheet = page.getByRole('dialog', { name: 'Aoife Byrne' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Daft', { exact: true })).toBeVisible();
    await expect(sheet.getByText(/^Enquired \w+day \d+ \w+/)).toBeVisible();
    // Rule 2: before applying, nothing about money or identity has been collected or shown.
    await expect(sheet.getByText(/Income|Checks/)).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: 'Open the conversation' })).toHaveAttribute(
      'href',
      /^\/inbox\/renter-[0-9a-f-]{36}$/,
    );
    await expectAccessible(page);
    await screenshot(page, `ux-lp-person-sheet-${width}`);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(people.getByRole('link', { name: 'Aoife Byrne' })).toBeVisible();
  }

  // Once people are invited, the chips are the viewing stage's: nobody is left out.
  await chooseWhoViews(page, lettingUrl, {
    waitFor: 'Aoife Byrne',
    tick: ['Aoife Byrne'],
    untick: ['Ciarán Ó Súilleabháin'],
  });
  await page.goto(`${lettingUrl}?view=people`);
  await expect(chips.getByRole('link')).toHaveText(['All', 'Invited', 'Waiting list', 'Others']);
  await expect(people.getByRole('row')).toHaveCount(3);
  await chips.getByRole('link', { name: 'Invited' }).click();
  await expect(people.getByRole('row')).toHaveCount(2);
  await expect(people.getByRole('row').nth(1)).toContainText('Invited, not booked yet');
  await expectAccessible(page);
});

test('UX-LP-11, UX-LP-12, UX-LP-13: Home changes a fact that Gaff answers from next, and locks letting details once people are invited', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  // UX-LP-11: every part with its own Change.
  for (const part of [
    'Photos',
    'Description',
    'Facts',
    'Letting details',
    'Viewing times',
    'Rent check',
    'Comparable rents',
    'Where it’s advertised',
    'The owner',
  ]) {
    await expect(page.getByRole('region', { name: part })).toBeVisible();
  }
  await atBothWidths(page, 'home');
  const facts = page.getByRole('region', { name: 'Facts' });
  await expect(facts.getByText('A parking space')).toHaveCount(0);

  // UX-LP-12: a live home's facts can change, and the next answer comes from them.
  await facts.getByRole('link', { name: 'Change facts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The home' })).toBeVisible();
  await page
    .getByRole('group', { name: /^Parking/ })
    .getByRole('radio', { name: 'A parking space' })
    .check();
  await expectAccessible(page);
  await screenshot(page, 'ux-lp-change-facts');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Facts saved. Gaff answers renters from them from now on.'),
  ).toBeVisible();
  await expect(facts.getByText('A parking space')).toBeVisible();

  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });
  const row = page.getByRole('link', { name: /Approve 1 answer · 12 Ranelagh Road/ });
  await expect(async () => {
    await page.goto('/today');
    await expect(row).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await row.click();
  const reply = page.getByRole('region', { name: 'Reply to Aoife' });
  await expect(reply.getByText(/You asked: Is there parking\?/)).toBeVisible();
  await expect(reply.getByLabel('Gaff doesn’t know: Is there parking?')).toHaveCount(0);

  // UX-LP-13: letting details change until people are invited; then the page says why not.
  await page.goto(`${lettingUrl}?view=home`);
  const details = page.getByRole('region', { name: 'Letting details' });
  await expect(details.getByRole('link', { name: 'Change letting details' })).toBeVisible();
  await chooseWhoViews(page, lettingUrl, { waitFor: 'Aoife Byrne', tick: ['Aoife Byrne'] });
  await page.goto(`${lettingUrl}?view=home`);
  await expect(details.getByRole('link')).toHaveCount(0);
  await expect(
    details.getByText(
      'You’ve invited people on these, so they can’t change now. That keeps it fair.',
    ),
  ).toBeVisible();
  await atBothWidths(page, 'home-locked');
});

test('UX-LP-5, UX-LP-6: the menu holds the rare actions, and History is the full record with a decisions filter', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  await sendTestEmail(page, { to: await gaffAddress(page), ...aoifeEnquires });
  await chooseWhoViews(page, lettingUrl, { waitFor: 'Aoife Byrne', tick: ['Aoife Byrne'] });

  await page.goto(lettingUrl);
  const menu = await openLettingMenu(page);
  // UX-LP-5: "See it on Gaff" waits for a home's public page (WP-20); the rest are here.
  // "Add test enquiries" is there only because these runs have the development tools on (BA-1).
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Change the home’s details',
    'Share with the owner',
    'Share with a colleague',
    'Change lead',
    'Add test enquiries',
    'History',
    'Close this letting',
  ]);
  await expectAccessible(page);
  await page.keyboard.press('Escape');

  await openHistory(page);
  const record = page.getByRole('list', { name: 'History' }).getByRole('listitem');
  // Newest first: the invitations were the last thing a person did.
  await expect(record.first()).toContainText(/Invitation/);
  await expect(page.getByText('Set-up confirmed: Gaff started answering enquiries')).toBeVisible();
  const everything = await record.count();
  await atBothWidths(page, 'history');
  await page.getByRole('link', { name: 'Decisions only' }).click();
  await expect(page).toHaveURL(/\/history\?show=decisions$/);
  expect(await record.count()).toBeLessThan(everything);
  await expect(page.getByText('Set-up confirmed: Gaff started answering enquiries')).toBeVisible();
  await expect(record.filter({ hasText: 'First reply sent' })).toHaveCount(0);
  await atBothWidths(page, 'history-decisions');

  // "See everything" under What's happening opens the same record.
  await page.goto(lettingUrl);
  await page.getByRole('link', { name: 'See everything' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
});

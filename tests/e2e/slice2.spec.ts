import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
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

const AOIFE = 'aoife.byrne@example.ie';
const CIARAN = 'ciaran.os@example.ie';

async function onPhone(browser: Browser, link: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const page = await context.newPage();
  await page.goto(link);
  return { context, page };
}

/**
 * Stages 1 to 4 through the real screens: two renters enquire, both are invited, both book,
 * the viewings start, and the operator marks both as having come.
 */
async function twoPeopleWhoCame(browser: Browser, page: Page) {
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });
  await sendTestEmail(page, { to, ...myhomeEnquiry, replyTo: '' });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Ciarán Ó Súilleabháin')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel('Invite Ciarán Ó Súilleabháin').check();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('2 invited to book a viewing')).toBeVisible();

  const links: Record<string, string> = {};
  for (const email of [AOIFE, CIARAN]) {
    await expect(async () => {
      links[email] = await linkInEmail(email, 'Book a viewing: 12 Ranelagh Road');
    }).toPass({ timeout: 20_000 });
    const renter = await onPhone(browser, links[email]!);
    await renter.page.getByRole('radio').first().check();
    await renter.page.getByRole('button', { name: 'Book this time' }).click();
    await expect(renter.page.getByText('You’re booked')).toBeVisible();
    await renter.context.close();
  }

  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto(`${lettingUrl}/attendance`);
  for (const name of ['Aoife Byrne', 'Ciarán Ó Súilleabháin']) {
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  return { operator, lettingUrl, links };
}

test('R16: someone who came applies on their phone, with two questions and no documents', async ({
  browser,
  page,
}) => {
  test.slow();
  const { links } = await twoPeopleWhoCame(browser, page);
  const aoife = await onPhone(browser, links[AOIFE]!);
  await expect(
    aoife.page.getByRole('heading', { name: 'Apply for 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(aoife.page.getByText('Aoife Byrne', { exact: true })).toBeVisible();
  await expect(
    aoife.page.getByText(/looks for at least 2\.5 times the rent: €4,625 a month/),
  ).toBeVisible();
  await expectAccessible(aoife.page);
  await expectNoSidewaysScroll(aoife.page);
  await screenshot(aoife.page, '35-renter-apply');

  await aoife.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(aoife.page.getByText('Choose how you earn most of your income.')).toBeVisible();
  await aoife.page.getByLabel('From a job').check();
  await aoife.page.getByLabel('Your household’s take-home income each month').fill('5,200');
  await aoife.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(aoife.page.getByText('Thanks, Aoife')).toBeVisible();
  await expect(aoife.page.getByText('we’ll email you either way')).toBeVisible();
  await expectAccessible(aoife.page);
  await aoife.context.close();
});

async function applyOnPhone(browser: Browser, link: string, income: string) {
  const renter = await onPhone(browser, link);
  await renter.page.getByLabel('From a job').check();
  await renter.page.getByLabel('Your household’s take-home income each month').fill(income);
  await renter.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(renter.page.getByText('Your application is with')).toBeVisible();
  await renter.context.close();
}

test('R17: the operator compares applicants side by side and chooses a preferred applicant and a backup', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, links } = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, links[AOIFE]!, '5,200');
  await applyOnPhone(browser, links[CIARAN]!, '4,000');

  await page.goto('/');
  await page
    .getByRole('link', { name: '12 Ranelagh Road: choose who to offer it to (2 applied)' })
    .click();
  await expect(page.getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible();
  await expect(page.getByText('€5,200 a month, 2.8 times the rent')).toBeVisible();
  await expect(page.getByText('Below your income rule')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '36-applicants-side-by-side');

  await page.getByRole('button', { name: 'Confirm my choice' }).click();
  await expect(page.getByText('Choose your preferred applicant.')).toBeVisible();
  await page.getByLabel('Preferred: Aoife Byrne').check();
  await page.getByLabel('Backup: Ciarán Ó Súilleabháin').check();
  await page.getByRole('button', { name: 'Confirm my choice' }).click();
  await expect(page.getByText('Choice saved')).toBeVisible();
  await expect(page.getByText('Step 6 of 9 · Checks')).toBeVisible();

  await page.setViewportSize({ width: 412, height: 915 });
  await expectNoSidewaysScroll(page);
  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByText('Preferred applicant and backup chosen')).toBeVisible();
});

/** Both apply; the operator chooses Aoife as preferred and Ciarán as backup. */
async function twoChosen(browser: Browser, page: Page) {
  const setup = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, setup.links[AOIFE]!, '5,200');
  await applyOnPhone(browser, setup.links[CIARAN]!, '4,800');
  await page.goto(`${setup.lettingUrl}/applications`);
  await page.getByLabel('Preferred: Aoife Byrne').check();
  await page.getByLabel('Backup: Ciarán Ó Súilleabháin').check();
  await page.getByRole('button', { name: 'Confirm my choice' }).click();
  await expect(page.getByText('Choice saved')).toBeVisible();
  return setup;
}

test('R18: the chosen renters do their checks, a referee answers, and the operator sees the results', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl } = await twoChosen(browser, page);
  let checksLink = '';
  await expect(async () => {
    checksLink = await linkInEmail(AOIFE, '12 Ranelagh Road: a few checks before an offer');
  }).toPass({ timeout: 20_000 });

  const aoife = await onPhone(browser, checksLink);
  const renter = aoife.page;
  await expect(renter.getByRole('heading', { name: 'A few checks before an offer' })).toBeVisible();
  await expect(renter.getByText('Gaff keeps only whether it worked')).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, '37-renter-checks');

  // ID: through the stand-in provider, back to a page that shows nothing private.
  await renter.getByRole('button', { name: 'Check my ID' }).click();
  await expect(renter.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await renter.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(
    renter.getByRole('heading', { name: 'Thanks, that’s your ID check done' }),
  ).toBeVisible();

  // Income: the first try doesn't work, and that's said kindly, then it's confirmed.
  await renter.goto(checksLink);
  await renter.getByRole('button', { name: 'Check my income' }).click();
  await renter.getByRole('button', { name: 'No regular income found' }).click();
  await renter.goto(checksLink);
  await expect(renter.getByText('That didn’t work this time')).toBeVisible();
  await expectAccessible(renter);
  await renter.getByRole('button', { name: 'Try again' }).click();
  await renter.getByRole('button', { name: 'Confirm this income' }).click();

  // References: a previous landlord, and no employer to ask.
  await renter.goto(checksLink);
  await renter.getByLabel('Your last landlord’s name').fill('Mary Kelly');
  await renter.getByLabel('Your last landlord’s email').fill('mary.kelly@example.ie');
  await renter.getByLabel('I don’t have an employer to ask').check();
  await renter.getByRole('button', { name: 'Ask for my references' }).click();
  await expect(renter.getByText('We’ve asked for your references.')).toBeVisible();
  await expect(renter.getByText(/Your last landlord, Mary Kelly:/)).toBeVisible();
  await aoife.context.close();

  // The referee answers on their phone, with no account.
  let referenceLink = '';
  await expect(async () => {
    referenceLink = await linkInEmail('mary.kelly@example.ie', 'Reference for Aoife Byrne');
  }).toPass({ timeout: 20_000 });
  const mary = await onPhone(browser, referenceLink);
  await expect(
    mary.page.getByRole('heading', { name: 'A reference for Aoife Byrne' }),
  ).toBeVisible();
  await expectAccessible(mary.page);
  await screenshot(mary.page, '38-referee-form');
  const answer = async (question: string, option: string) =>
    mary.page.getByRole('group', { name: question }).getByLabel(option, { exact: true }).check();
  await answer('Did they rent a home from you?', 'Yes');
  await answer('Was the rent paid on time?', 'Always');
  await answer('Did they look after the home?', 'Yes');
  await answer('Would you rent to them again?', 'Yes');
  await mary.page.getByRole('button', { name: 'Send my reference' }).click();
  await expect(mary.page.getByText('Your reference is with Halcyon Lettings.')).toBeVisible();
  await mary.context.close();

  // The operator sees each result in words.
  await page.goto(`${lettingUrl}/applications`);
  const card = page.getByRole('listitem').filter({ hasText: 'Aoife Byrne' });
  await expect(card.getByText('Verified: Aoife Byrne.')).toBeVisible();
  await expect(
    card.getByText(/Confirmed €5,200 a month, 2\.8 times the rent: meets your rule\./),
  ).toBeVisible();
  await expect(
    card.getByText(/Mary Kelly answered\. Rented from them\. Rent always on time\./),
  ).toBeVisible();
  await expect(card.getByText('Not needed: no employer to ask.')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '39-operator-check-results');
});

test('R19: the landlord approves the chosen tenant and the backup from a one-page summary, with no account', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl } = await twoChosen(browser, page);
  await page.goto(`${lettingUrl}/applications`);
  await expect(page.getByRole('heading', { name: 'The landlord’s approval' })).toBeVisible();
  await page.getByLabel('Landlord’s name').fill('Tom Walsh');
  await page.getByLabel('Landlord’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save the landlord’s details' }).click();
  await page.getByRole('button', { name: 'Ask the landlord to approve' }).click();
  await expect(page.getByText('Waiting for their answer.')).toBeVisible();

  let approvalLink = '';
  await expect(async () => {
    approvalLink = await linkInEmail(
      'tom.walsh@example.ie',
      '12 Ranelagh Road: please approve a tenant',
    );
  }).toPass({ timeout: 20_000 });
  const tom = await onPhone(browser, approvalLink);
  const landlord = tom.page;
  await expect(landlord.getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible();
  await expect(landlord.getByRole('heading', { name: 'Ciarán Ó Súilleabháin' })).toBeVisible();
  await expect(landlord.getByText('2.8 times the rent').first()).toBeVisible();
  expect(await landlord.content()).not.toMatch(/5,200|4,800|aoife\.byrne@|ciaran\.os@/);
  await expectAccessible(landlord);
  await expectNoSidewaysScroll(landlord);
  await screenshot(landlord, '40-landlord-approval');

  await landlord.getByRole('button', { name: 'Send my answer' }).click();
  await expect(landlord.getByText('Choose approve or decline for each person.')).toBeVisible();
  await landlord
    .getByRole('group', { name: 'Aoife Byrne, the preferred tenant' })
    .getByLabel('Approve')
    .check();
  await landlord
    .getByRole('group', { name: 'Ciarán Ó Súilleabháin, the backup' })
    .getByLabel('Approve')
    .check();
  await landlord.getByRole('button', { name: 'Send my answer' }).click();
  await expect(landlord.getByText('Thanks for your answer')).toBeVisible();
  await tom.context.close();

  await page.goto(`${lettingUrl}/applications`);
  await expect(page.getByText('Approved Aoife Byrne', { exact: true })).toBeVisible();
  await expect(page.getByText('Approved Ciarán Ó Súilleabháin as backup')).toBeVisible();
});

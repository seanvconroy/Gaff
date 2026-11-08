import { expect, test } from '@playwright/test';
import { identityExplained } from '../../src/copy/identity';
import {
  checkIdWithSelfie,
  expectAccessible,
  expectNoSidewaysScroll,
  latestCodeFor,
  linkInEmail,
  screenshot,
  subjectsSentTo,
} from './support';

const identityOnce = identityExplained.once;
import { AOIFE, CIARAN, applyOnPhone, onPhone, twoChosen, twoPeopleWhoCame } from './journeys';

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
  await expectAccessible(renter);
  await screenshot(renter, '37-renter-checks');

  // P15, P16: she confirms the email she enquired with, which sets up her Gaff profile.
  await renter.getByRole('button', { name: 'Email me a code' }).click();
  // The code field appears once the email has gone.
  await expect(renter.getByLabel('The code from the email')).toBeVisible();
  await renter.getByLabel('The code from the email').fill(await latestCodeFor(AOIFE));
  await renter.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(renter.getByText(identityOnce)).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, '37b-renter-identity');

  // P17, P18: the ID check, with a selfie after a clear yes, back to a page with nothing private.
  await checkIdWithSelfie(renter);
  await expect(renter.getByRole('heading', { name: 'Thanks, your ID is checked' })).toBeVisible();
  await renter.goto(checksLink);
  await expect(
    renter.getByText(/Checked on \w+day \d+ \w+, and kept on your Gaff profile/),
  ).toBeVisible();

  // Income: the first try doesn't work, and that's said kindly, then it's confirmed.
  await renter.goto(checksLink);
  await renter.getByRole('button', { name: 'Check my income' }).click();
  await renter.getByRole('button', { name: 'No regular income found' }).click();
  await renter.waitForURL(/\/checks\/done/);
  await renter.goto(checksLink);
  await expect(renter.getByText('That didn’t work this time')).toBeVisible();
  await expectAccessible(renter);
  await renter.getByRole('button', { name: 'Try again' }).click();
  await renter.getByRole('button', { name: 'Confirm this income' }).click();
  await renter.waitForURL(/\/checks\/done/);

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
  await expect(card.getByText(/^Checked by Gaff on .+: Aoife Byrne\.$/)).toBeVisible();
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

test('R20, R21: the offer goes out with a deadline, the renter accepts on their phone, and everyone else hears', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, links } = await twoChosen(browser, page);
  // The operator confirms the landlord's approval themselves (no landlord email, Q22).
  await page.goto(`${lettingUrl}/applications`);
  await expect(page.getByRole('heading', { name: 'The offer' })).toBeVisible();
  await page.getByLabel('Deposit').fill('2,000');
  await page.getByLabel(/The landlord has approved Aoife Byrne/).check();
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(
    page.getByText('The deposit can’t be more than one month’s rent: €1,850.'),
  ).toBeVisible();
  await page.getByLabel('Deposit').fill('1,850');
  await page.getByLabel(/The landlord has approved Aoife Byrne/).check();
  await expect(page.getByLabel(/Offer it to Ciarán Ó Súilleabháin, my backup/)).toBeChecked();
  await expectAccessible(page);
  await screenshot(page, '41-make-offer');
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(page.getByText('Offer sent.')).toBeVisible();
  await expect(page.getByText(/it goes to your backup automatically/)).toBeVisible();

  let offerLink = '';
  await expect(async () => {
    offerLink = await linkInEmail(AOIFE, 'An offer: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, offerLink);
  await expect(
    aoife.page.getByRole('heading', { name: 'An offer for 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(aoife.page.getByText(/^Please answer by \w+day \d+ \w+, /)).toBeVisible();
  await expect(aoife.page.getByText('nothing is paid through Gaff')).toBeVisible();
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '42-renter-offer');
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    aoife.page.getByText('You’ve accepted the offer, and your tenancy starts on'),
  ).toBeVisible();
  await expectAccessible(aoife.page);
  await aoife.context.close();

  // Ciarán, the backup, hears straight away, with when his details go.
  await expect(async () => {
    expect(await subjectsSentTo(CIARAN)).toContain(
      '12 Ranelagh Road: an update on your application',
    );
  }).toPass({ timeout: 20_000 });
  const ciaran = await onPhone(browser, links[CIARAN]!);
  await expect(ciaran.page.getByText('The home has been let')).toBeVisible();
  await expect(
    ciaran.page.getByText(/We’ll delete your details from Gaff by \w+day \d+ \w+\./),
  ).toBeVisible();
  await expectAccessible(ciaran.page);
  await ciaran.context.close();

  await page.goto(`${lettingUrl}/applications`);
  await expect(
    page.getByRole('region', { name: 'The offer' }).getByText('Accepted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Step 8 of 9 · Tenancy')).toBeVisible();
  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByText('Offer accepted: the home is let')).toBeVisible();
  await expect(page.getByText('Everyone else told')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  expectNoSidewaysScroll,
  linkInEmail,
  screenshot,
  subjectsSentTo,
} from './support';
import { AOIFE, CIARAN, applyOnPhone, onPhone, twoChosen, twoPeopleWhoCame } from './journeys';
import { enterLinkCode, expectRenterPageAtBothWidths } from './renter';

test('R16: someone who came applies on their phone, with two questions and no documents', async ({
  browser,
  page,
}) => {
  test.slow();
  const { links } = await twoPeopleWhoCame(browser, page);
  const aoife = await onPhone(browser, links[AOIFE]!);
  const renter = aoife.page;
  // Rule 2 (staged data): no page of the application takes a document.
  const noDocuments = () => expect(renter.locator('input[type=file]')).toHaveCount(0);
  await expect(
    renter.getByRole('heading', { name: 'Thanks for coming. Would you like to apply?' }),
  ).toBeVisible();
  await expect(renter.getByText('you don’t need any documents')).toBeVisible();
  await noDocuments();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-after-viewing' });
  await renter.getByRole('link', { name: 'Apply', exact: true }).click();

  // UX-RN-11: two questions, one per screen.
  const next = renter.getByRole('button', { name: 'Next', exact: true });
  await expect(
    renter.getByRole('heading', { name: 'How do you earn most of your income?' }),
  ).toBeVisible();
  await noDocuments();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, '35-renter-apply');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-apply-earning' });
  await next.click();
  await expect(renter.getByText('Choose how you earn most of your income.')).toBeVisible();
  await renter.getByRole('radio', { name: 'From a job', exact: true }).check();
  await next.click();

  // The income rule is shown before they answer, and it's the same for everyone (UX-RN-12).
  await expect(
    renter.getByRole('heading', { name: 'What’s your household’s take-home income each month?' }),
  ).toBeVisible();
  await expect(
    renter.getByText('Halcyon Lettings looks for 2.5 times the rent. Everyone is asked the same.'),
  ).toBeVisible();
  // Rule 3: housing support counts as income, and nothing asks whether they receive it.
  await expect(renter.getByText('Include any housing support, such as HAP.')).toBeVisible();
  await expect(renter.getByRole('checkbox')).toHaveCount(0);
  await noDocuments();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-apply-income' });
  await renter.getByLabel('Take-home income each month').fill('5,200');
  await next.click();

  // The check screen: her name and email, each with "Change", then one button.
  await expect(renter.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await expect(renter.getByText('Aoife Byrne', { exact: true })).toBeVisible();
  await expect(renter.getByText(AOIFE, { exact: true })).toBeVisible();
  await expect(renter.getByText('€5,200 a month')).toBeVisible();
  await expect(renter.getByRole('button', { name: 'Change name' })).toBeVisible();
  await expect(renter.getByRole('button', { name: 'Change email' })).toBeVisible();
  await noDocuments();
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-apply-check' });
  await renter.getByRole('button', { name: 'Send my application' }).click();
  await expect(renter.getByRole('heading', { name: 'Your application is in' })).toBeVisible();
  await expect(renter.getByText('We’ll email you either way.')).toBeVisible();
  await expectAccessible(renter);
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-applied' });
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

  await page.goto('/today');
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
  // UX-RN-14: the link alone shows that there are checks, and nothing about where each stands.
  const list = renter.getByRole('list', { name: 'Your checks' }).getByRole('listitem');
  await expect(list).toHaveText([
    /Your ID.*To come/,
    /Your income.*To come/,
    /Your references.*To come/,
  ]);
  await expect(renter.getByRole('button', { name: /Check my/ })).toHaveCount(0);
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-checks-start' });
  await enterLinkCode(renter, AOIFE, 'Start');

  // UX-RN-15: one at a time: the three as a short list, and only the next one's task and button.
  await expect(list).toHaveText([
    /Your ID.*Next/,
    /Your income.*To come/,
    /Your references.*To come/,
  ]);
  await expect(renter.getByRole('button', { name: 'Check my income' })).toHaveCount(0);
  // UX-RN-16: what's kept, who sees it and when it goes, said before the check starts.
  await expect(renter.locator('[data-notice="check"]')).toContainText(
    'Gaff keeps only the result and the name on your ID, never the photos. Only Halcyon Lettings sees it',
  );
  await expectAccessible(renter);
  await screenshot(renter, '37-renter-checks');
  await expectRenterPageAtBothWidths(renter, { notices: ['check'], shots: 'wp12-live-checks-id' });

  // ID: through the stand-in provider, which is never given her link. This browser remembers
  // the way back, so she lands on her own page, at the next check (UX-RN-17).
  await renter.getByRole('button', { name: 'Check my ID' }).click();
  await expect(renter.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  expect(renter.url()).not.toContain(checksLink.split('/r/')[1]!);
  await renter.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(renter).toHaveURL(checksLink);
  await expect(list).toHaveText([/Your ID.*Done/, /Your income.*Next/, /Your references.*To come/]);

  // Income: the first try doesn't work, and that's said kindly, then it's confirmed.
  await renter.getByRole('button', { name: 'Check my income' }).click();
  await renter.getByRole('button', { name: 'No regular income found' }).click();
  await expect(renter).toHaveURL(checksLink);
  // A check that didn't work is shown in "warning", never "danger", with a plain reason.
  const failed = renter.locator('[data-box="notice"]').filter({ hasText: 'That didn’t work' });
  await expect(failed).toContainText('The check couldn’t find a regular income in your account.');
  await expect(failed).toHaveAttribute('data-tone', 'warning');
  await expect(renter.locator('[data-tone="danger"]')).toHaveCount(0);
  await expectAccessible(renter);
  await expectRenterPageAtBothWidths(renter, {
    notices: ['check'],
    shots: 'wp12-live-checks-income-failed',
  });
  await renter.getByRole('button', { name: 'Try again' }).click();
  await renter.getByRole('button', { name: 'Confirm this income' }).click();
  await expect(renter).toHaveURL(checksLink);

  // References, one referee per screen: a previous landlord, and no employer to ask.
  await expect(list).toHaveText([/Your ID.*Done/, /Your income.*Done/, /Your references.*Next/]);
  const next = renter.getByRole('button', { name: 'Next', exact: true });
  await expect(renter.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
  await expectRenterPageAtBothWidths(renter, {
    notices: ['check'],
    shots: 'wp12-live-checks-references',
  });
  await renter.getByRole('radio', { name: 'Yes', exact: true }).check();
  await next.click();
  await renter.getByLabel('Their name').fill('Mary Kelly');
  await renter.getByLabel('Their email').fill('mary.kelly@example.ie');
  await next.click();
  // UX-RN-18: "No" is an answer like any other. Nothing is called missing.
  await expect(
    renter.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await renter.getByRole('radio', { name: 'No', exact: true }).check();
  await renter.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(renter.getByRole('heading', { name: 'That’s everything from you' })).toBeVisible();
  await expect(list).toHaveText([/Your ID.*Done/, /Your income.*Done/, /Your references.*Done/]);
  await expect(renter.getByText(/Your last landlord, Mary Kelly: asked on/)).toBeVisible();
  expect(await renter.getByRole('main').innerText()).not.toMatch(/missing|incomplete/i);
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-checks-done' });
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
  // UX-RN-19: the terms, one total with what makes it up, one line of caution, and the deadline.
  await expect(aoife.page.getByText(/^Answer by \w+day \d+ \w+, .+\.$/)).toBeVisible();
  await expect(
    aoife.page.getByRole('heading', { name: 'To pay before you move in' }),
  ).toBeVisible();
  await expect(aoife.page.getByText('€3,700', { exact: true })).toBeVisible();
  // Rules 4 and 5: no fee of any kind, and the money goes to the lister, never to Gaff.
  await expect(aoife.page.locator('[data-notice="fees"]')).toHaveText(
    'No other fees. You pay Halcyon Lettings directly.',
  );
  expect(await aoife.page.getByRole('main').innerText()).not.toMatch(
    /booking fee|admin fee|holding deposit|pay gaff/i,
  );
  await expect(aoife.page.getByRole('link', { name: 'Decline', exact: true })).toBeVisible();
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '42-renter-offer');
  await expectRenterPageAtBothWidths(aoife.page, { notices: ['fees'], shots: 'wp12-live-offer' });
  // UX-RN-20: declining is one screen that asks for no reason. She goes back and accepts.
  await aoife.page.getByRole('link', { name: 'Decline', exact: true }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Decline the offer?' })).toBeVisible();
  await expect(
    aoife.page.getByRole('main').locator('input:not([type=hidden]), textarea, select'),
  ).toHaveCount(0);
  await expectRenterPageAtBothWidths(aoife.page, { shots: 'wp12-live-decline' });
  await aoife.page.getByRole('link', { name: 'Back to the offer' }).click();
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    aoife.page.getByText('You’ve accepted the offer. Your tenancy starts on'),
  ).toBeVisible();
  // UX-RN-26: her three steps, with the first one next.
  await expect(
    aoife.page.getByRole('list', { name: 'Your tenancy, step by step' }).getByRole('listitem'),
  ).toHaveText([/Sign your agreement.*Next/, /Pay.*To come/, /inventory.*To come/]);
  await expectAccessible(aoife.page);
  await expectRenterPageAtBothWidths(aoife.page, { shots: 'wp12-live-tenancy-agreement-coming' });
  await aoife.context.close();

  // Ciarán, the backup, hears straight away, with when his details go.
  await expect(async () => {
    expect(await subjectsSentTo(CIARAN)).toContain(
      '12 Ranelagh Road: an update on your application',
    );
  }).toPass({ timeout: 20_000 });
  const ciaran = await onPhone(browser, links[CIARAN]!);
  await expect(
    ciaran.page.getByRole('heading', { name: '12 Ranelagh Road has been let' }),
  ).toBeVisible();
  await expect(
    ciaran.page.getByText(/We’ll delete your details from Gaff by \w+day \d+ \w+\./),
  ).toBeVisible();
  await expectAccessible(ciaran.page);
  // UX-PP-6: the one notice on a closed home is when their details will be deleted.
  await expectRenterPageAtBothWidths(ciaran.page, {
    notices: ['deletion'],
    shots: 'wp12-live-let-to-someone-else',
  });
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

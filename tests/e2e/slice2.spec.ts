import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  expectNoSidewaysScroll,
  linkInEmail,
  screenshot,
  subjectsSentTo,
} from './support';
import {
  AOIFE,
  CIARAN,
  applyOnPhone,
  flowAtBothWidths,
  onPhone,
  recordComparablesThroughUi,
  twoChosen,
  twoPeopleWhoCame,
} from './journeys';
import {
  aPayslipFile,
  addDocumentThroughUi,
  enterLinkCode,
  expectFramePageAtBothWidths,
  expectRenterPageAtBothWidths,
} from './renter';

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

test('R17, UX-DC-7 to UX-DC-9: from Today, the operator chooses a preferred applicant and a backup in a focused flow', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, links } = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, links[AOIFE]!, '5,200');
  await applyOnPhone(browser, links[CIARAN]!, '4,000');

  await page.goto('/today');
  // UX-HM-3: the row says the task and the home, then why now. It opens the flow.
  await page
    .getByRole('link', { name: /Choose an applicant · 12 Ranelagh Road\s*2 people have applied/ })
    .click();
  await expect(page).toHaveURL(/\/lettings\/[0-9a-f-]+\/choose$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose an applicant' })).toBeVisible();
  // UX-FL-1: a focused task, with no navigation.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  // UX-DC-7: only what applications collect. UX-DC-8: below the rule is said on the card, in
  // the warning style, and nobody is hidden or moved down for it.
  const aoife = page.locator('label').filter({ hasText: 'Aoife Byrne' });
  const ciaran = page.locator('label').filter({ hasText: 'Ciarán Ó Súilleabháin' });
  await expect(aoife).toContainText('€5,200 a month, 2.8 times the rent');
  await expect(aoife).toContainText('Meets your income rule');
  await expect(ciaran).toContainText('€4,000 a month, 2.1 times the rent');
  await expect(ciaran).toContainText('Your rule is 2.5 times the rent. Below your income rule');
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByText(/Didn’t answer the questions/)).toHaveCount(0);
  await flowAtBothWidths(page, 'choose');
  await screenshot(page, '36-applicants-side-by-side');

  // Errors at the field: nobody is chosen for the person.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Choose an applicant.')).toBeVisible();
  await page.getByRole('radio', { name: 'Choose Aoife Byrne' }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a backup?' })).toBeVisible();
  // "No backup" is an equal choice.
  await expect(page.getByRole('radio', { name: 'No backup' })).toBeVisible();
  await flowAtBothWidths(page, 'choose-backup');
  await page.getByRole('radio', { name: 'Ciarán Ó Súilleabháin', exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
  await expect(
    page.getByText(
      'Gaff will ask Aoife and Ciarán for an ID check, work and income documents and references. It tells them what each is for. Neither is told who’s first.',
    ),
  ).toBeVisible();
  await flowAtBothWidths(page, 'choose-check');
  await page.getByRole('button', { name: 'Start the checks' }).click();
  // UX-FL-4: what was done, and what Gaff does next.
  await expect(page.getByRole('heading', { name: 'Checks started' })).toBeVisible();
  await flowAtBothWidths(page, 'choose-started');
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('list', { name: 'How far it’s got' })).toContainText(
    'Choose · Checks',
  );
  // UX-DC-10: while checks run, there's nothing to do, and the letting says so.
  await expect(page.getByText(/Checks under way for Aoife and Ciarán/)).toBeVisible();

  // UX-DC-9: the choice can change until an offer is made: the cards remember it.
  await page.goto(`${lettingUrl}/choose`);
  await expect(page.getByRole('radio', { name: 'Choose Aoife Byrne' })).toBeChecked();
  await expect(aoife).toContainText('Your choice now');

  await page.setViewportSize({ width: 412, height: 915 });
  await expectNoSidewaysScroll(page);
  await page.goto(`${lettingUrl}/history`);
  await expect(page.getByText('Preferred applicant and backup chosen')).toBeVisible();
});

test('R18: the chosen renters do their checks, a referee answers, and the operator sees the results', async ({
  browser,
  page,
}) => {
  test.slow();
  await twoChosen(browser, page);
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
    /Your references.*To come/,
    /Your work and income.*To come/,
  ]);
  await expect(renter.getByRole('button', { name: /Check my/ })).toHaveCount(0);
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-checks-start' });
  await enterLinkCode(renter, AOIFE, 'Start');

  // UX-RN-15: one at a time: the three as a short list, and only the next one's task and button.
  await expect(list).toHaveText([
    /Your ID.*Next/,
    /Your references.*To come/,
    /Your work and income.*To come/,
  ]);
  // Rule 2: nothing about documents is asked until it's their turn.
  await expect(renter.getByLabel('Document', { exact: true })).toHaveCount(0);
  // UX-RN-16: what's kept, who sees it and when it goes, said before the check starts.
  await expect(renter.locator('[data-notice="check"]')).toContainText(
    'Gaff keeps only the result and the name on your ID, never the photos. Only Halcyon Lettings sees it',
  );
  await expectAccessible(renter);
  await screenshot(renter, '37-renter-checks');
  await expectRenterPageAtBothWidths(renter, { notices: ['check'], shots: 'wp12-live-checks-id' });

  // ID: through the stand-in provider, which is never given her link. This browser remembers
  // the way back, so she lands on her own page (UX-RN-17), which asks once whether to keep the
  // check (UX-PF-8). "Not now" goes on to the next check.
  await renter.getByRole('button', { name: 'Check my ID' }).click();
  await expect(renter.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  expect(renter.url()).not.toContain(checksLink.split('/r/')[1]!);
  await renter.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(renter).toHaveURL(`${checksLink}?q=keep_id`);
  await expect(
    renter.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  await renter.getByRole('link', { name: 'Not now' }).click();
  await expect(renter).toHaveURL(checksLink);
  await expect(list).toHaveText([
    /Your ID.*Done/,
    /Your references.*Next/,
    /Your work and income.*To come/,
  ]);

  // References, one referee per screen: a previous landlord, and no employer to ask.
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

  // BA-16 (P30 to P39): work and income, with the documents asked for by how she earns.
  await expect(list).toHaveText([
    /Your ID.*Done/,
    /Your references.*Done/,
    /Your work and income.*Next/,
  ]);
  await expect(renter.getByRole('heading', { name: 'Your work and income' })).toBeVisible();
  await expect(renter.getByText(/^Add your three most recent payslips/)).toBeVisible();
  await expect(renter.locator('[data-notice="check"]')).toContainText(
    'Only Halcyon Lettings sees your documents',
  );
  await expectRenterPageAtBothWidths(renter, { notices: ['check'], shots: 'ba16-documents' });
  // P38: a payslip in another name is flagged at once, in "warning", and never refused.
  await addDocumentThroughUi(renter, aPayslipFile('Aoife Brennan'));
  const flagged = renter.locator('[data-flag="name_differs"]');
  await expect(flagged).toContainText('The name on it isn’t Aoife Byrne, the name on your ID.');
  await expect(flagged.locator('[data-pill="warning"]')).toBeVisible();
  await expect(renter.locator('[data-tone="danger"]')).toHaveCount(0);
  await expectRenterPageAtBothWidths(renter, {
    notices: ['check'],
    shots: 'ba16-documents-flagged',
  });
  await renter.getByRole('button', { name: 'Remove' }).click();
  await expect(flagged).toHaveCount(0);
  // P37: the right one, read by AI, with no PPS number anywhere on the page.
  await addDocumentThroughUi(renter, aPayslipFile('Aoife Byrne'));
  await expect(
    renter.getByText(
      /^Acme Ltd, €1,480 take-home every two weeks, dated .*, in the name Aoife Byrne\./,
    ),
  ).toBeVisible();
  await expect(renter.getByText('Read by AI')).toBeVisible();
  expect(await renter.content()).not.toContain('1234567T');
  await expectRenterPageAtBothWidths(renter, { notices: ['check'], shots: 'ba16-documents-read' });
  // P39: exactly what will be shared, then one step that shares it all.
  await renter.getByRole('link', { name: 'Check and share' }).click();
  await expect(renter.getByRole('heading', { name: 'Share with Halcyon Lettings' })).toBeVisible();
  await expect(
    renter.getByText(
      'Your last landlord, Mary Kelly (mary.kelly@example.ie). We’ll email them a short form now.',
    ),
  ).toBeVisible();
  await expect(renter.getByText('Halcyon Lettings can open this document.')).toBeVisible();
  await expectRenterPageAtBothWidths(renter, { shots: 'ba16-share' });
  await renter.getByRole('button', { name: 'Share with Halcyon Lettings' }).click();
  await expect(renter.getByRole('heading', { name: 'That’s everything from you' })).toBeVisible();
  await expect(list).toHaveText([
    /Your ID.*Done/,
    /Your references.*Done/,
    /Your work and income.*Done/,
  ]);
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
  const referee = mary.page;
  await expect(referee.getByRole('heading', { name: 'A reference for Aoife Byrne' })).toBeVisible();
  // UX-RF-1, UX-RF-5: one line on who's asking and why, one on who sees it; nothing about Mary.
  await expect(
    referee.getByText(
      'Aoife Byrne has applied to rent a home through Halcyon Lettings, and gave your name as a previous landlord.',
    ),
  ).toBeVisible();
  await expect(referee.getByText(/^Your answers go only to Halcyon Lettings/)).toBeVisible();
  // UX-RF-3 (rule 3): no free text anywhere; every answer is a tap.
  const noFreeText = async () => {
    await expect(
      referee.locator('textarea, input:not([type=radio]):not([type=hidden])'),
    ).toHaveCount(0);
    await expect(referee.getByRole('textbox')).toHaveCount(0);
  };
  await noFreeText();
  await expect(referee.getByRole('group')).toHaveCount(4);
  await expectFramePageAtBothWidths(referee, 'referee', 'wp13-referee-form');
  await screenshot(referee, '38-referee-form');
  const answer = async (question: string, option: string) =>
    referee.getByRole('group', { name: question }).getByLabel(option, { exact: true }).check();
  // UX-RF-2: a no to the first question hides the rest, and the button reads "Send".
  await answer('Did Aoife rent a home from you?', 'No');
  await expect(referee.getByRole('group')).toHaveCount(1);
  await expect(referee.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expectAccessible(referee);
  await screenshot(referee, 'wp13-referee-form-no');
  await answer('Did Aoife rent a home from you?', 'Yes');
  await expect(referee.getByRole('group')).toHaveCount(4);
  // A question left out is said at that question, and nothing has gone.
  await referee.getByRole('button', { name: 'Send my reference' }).click();
  await expect(
    referee
      .getByRole('group', { name: 'Was the rent paid on time?' })
      .getByText('Choose an answer.'),
  ).toBeVisible();
  await noFreeText();
  await answer('Was the rent paid on time?', 'Always');
  await answer('Did Aoife look after the home?', 'Yes');
  await answer('Would you rent to Aoife again?', 'Yes');
  // UX-RF-4: "I can't give this reference" is one tap, under the form.
  await expect(referee.getByRole('button', { name: 'I can’t give this reference' })).toBeVisible();
  await referee.getByRole('button', { name: 'Send my reference' }).click();
  await expect(referee.getByRole('heading', { name: 'Thanks' })).toBeVisible();
  await expect(
    referee.getByText('That’s everything. Your answers have gone to Halcyon Lettings only.'),
  ).toBeVisible();
  await expectFramePageAtBothWidths(referee, 'referee', 'wp13-referee-thanks');
  await mary.context.close();

  // UX-DC-11: every check for Aoife is back: one task on Today opens one screen.
  await expect(async () => {
    await page.goto('/today');
    await page
      .getByRole('link', { name: /The checks are back for Aoife · 12 Ranelagh Road/ })
      .click({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/checks$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'The checks are back for Aoife' }),
  ).toBeVisible();
  // UX-DC-10: each result in words.
  const results = page.getByRole('region', { name: 'Aoife Byrne' });
  await expect(results.getByText('Verified: Aoife Byrne.')).toBeVisible();
  // BA-16 (P44): documents shared, never a figure against the rule.
  await expect(results.getByText(/Documents shared on /)).toBeVisible();
  await expect(
    results.getByText(/Mary Kelly answered\. Rented from them\. Rent always on time\./),
  ).toBeVisible();
  await expect(results.getByText('Not needed: no employer to ask.')).toBeVisible();
  // The backup's checks are under way, and nothing is a refusal or in danger.
  await expect(
    page.getByRole('region', { name: 'Ciarán Ó Súilleabháin, your backup' }),
  ).toBeVisible();
  await expect(page.locator('[data-tone="danger"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue to the offer' })).toBeVisible();
  await flowAtBothWidths(page, 'checks-back');
  await screenshot(page, '39-operator-check-results');

  // BA-16 (P44 to P47): what her documents show, in words, beside the income she gave.
  await results.getByRole('link', { name: 'See what they shared' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aoife Byrne’s checks' })).toBeVisible();
  await expect(
    page.getByText(
      'The decision is yours, and the same standard applies to everyone. Refusing someone because they get HAP, rent supplement or any other social welfare payment is against the law.',
    ),
  ).toBeVisible();
  await expect(page.getByText(/^Verified by Gaff, in the name Aoife Byrne, on /)).toBeVisible();
  await expect(page.getByText('€5,200 a month, after tax')).toBeVisible();
  await expect(
    page.getByText(/^Acme Ltd, €1,480 take-home every two weeks, .* About €3,207 a month\.$/),
  ).toBeVisible();
  await expect(page.getByText('Read by AI')).toBeVisible();
  expect(await page.content()).not.toMatch(/times the rent|1234567T/);
  await expect(page.locator('[data-tone="danger"]')).toHaveCount(0);
  await flowAtBothWidths(page, 'ba16-letter-pack');
  // P45: the payslip opens on Gaff's own address, uncached; each opening is recorded.
  const open = page.getByRole('link', { name: 'Open', exact: true });
  const href = await open.getAttribute('href');
  const opened = await page.request.get(href!);
  expect(opened.status()).toBe(200);
  expect(opened.headers()['content-type']).toBe('application/pdf');
  expect(opened.headers()['cache-control']).toContain('no-store');
});

test('R19, UX-DC-14, UX-DC-16: the owner is asked from a focused flow, and approves the chosen tenant and the backup with no account', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl } = await twoChosen(browser, page);
  await page.goto(`${lettingUrl}/approval`);
  // UX-DC-14: the owner's details are asked here, because Gaff doesn't have them.
  await expect(page.getByRole('heading', { level: 1, name: 'Who owns this home?' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Enter the owner’s name.')).toBeVisible();
  await flowAtBothWidths(page, 'owner-details');
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Tom to approve' })).toBeVisible();
  // What Tom will see: the two people chosen, by name, with their results in words.
  await expect(page.getByRole('heading', { name: 'What Tom will see' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aoife Byrne, the tenant you chose' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ciarán Ó Súilleabháin, your backup' }),
  ).toBeVisible();
  // UX-OP-7: the agent is warned while checks are still under way.
  await expect(page.getByText(/checks? (aren’t|isn’t) back yet/)).toBeVisible();
  // UX-DC-15: a quiet way to record that the owner has already approved.
  await expect(page.getByRole('button', { name: 'Tom has already approved' })).toBeVisible();
  await flowAtBothWidths(page, 'owner-ask');
  await page.getByRole('button', { name: 'Send to Tom' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  await expect(page.getByText('Gaff tells you on Today as soon as Tom answers.')).toBeVisible();
  await flowAtBothWidths(page, 'owner-sent');

  // UX-DC-16: while Gaff waits, the letting says so, with "Remind Tom".
  await page.goto(lettingUrl);
  await expect(page.getByText(/^Waiting for Tom · sent (just now|\d+ minutes? ago)/)).toBeVisible();
  await page.getByRole('button', { name: 'Remind Tom' }).click();
  await expect(page.getByText('Reminder sent. The owner has a new link.')).toBeVisible();
  await page.goto(`${lettingUrl}/approval`);
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for Tom' })).toBeVisible();
  await flowAtBothWidths(page, 'owner-waiting');

  let approvalLink = '';
  await expect(async () => {
    approvalLink = await linkInEmail(
      'tom.walsh@example.ie',
      '12 Ranelagh Road: please approve a tenant',
    );
  }).toPass({ timeout: 20_000 });
  const tom = await onPhone(browser, approvalLink);
  const landlord = tom.page;
  // UX-OP-6: one person per screen, the chosen tenant first: their card, then the answer on it.
  await expect(landlord.getByRole('heading', { name: 'Approve a tenant' })).toBeVisible();
  await expect(landlord.getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible();
  await expect(landlord.getByText('2.8 times the rent').first()).toBeVisible();
  // UX-OP-7: a check that isn't finished says so.
  await expect(landlord.getByText('Still under way').first()).toBeVisible();
  // Income as a multiple of the rent, never the amount; no contact details.
  expect(await landlord.content()).not.toMatch(/5,200|4,800|aoife\.byrne@|ciaran\.os@/);
  // UX-OP-8 (Q42): declining asks for no reason in writing.
  await expect(landlord.getByRole('textbox')).toHaveCount(0);
  await expect(landlord.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expectFramePageAtBothWidths(landlord, 'owner', 'wp13-approve-tenant');
  await screenshot(landlord, '40-landlord-approval');
  await landlord.getByRole('button', { name: 'Approve Aoife' }).click();

  // Then the backup, the same way, with one sentence on what a backup is for.
  await expect(landlord.getByRole('heading', { name: 'And a backup?' })).toBeVisible();
  await expect(landlord.getByRole('heading', { name: 'Ciarán Ó Súilleabháin' })).toBeVisible();
  await expect(
    landlord.getByText('If Aoife doesn’t take the home, Halcyon Lettings offers it to Ciarán.'),
  ).toBeVisible();
  expect(await landlord.content()).not.toMatch(/5,200|4,800|aoife\.byrne@|ciaran\.os@/);
  await expect(landlord.getByRole('textbox')).toHaveCount(0);
  await expectFramePageAtBothWidths(landlord, 'owner', 'wp13-approve-backup');
  await landlord.getByRole('button', { name: 'Approve Ciarán' }).click();
  await expect(landlord.getByRole('heading', { name: 'Thanks, Tom' })).toBeVisible();
  await expect(
    landlord.getByText(
      'Halcyon Lettings will make the offer to Aoife and tell you when there’s an answer.',
    ),
  ).toBeVisible();
  await expectFramePageAtBothWidths(landlord, 'owner', 'wp13-approve-thanks');
  await tom.context.close();

  // UX-DC-16: Tom's answer arrives on Today, and opens the offer.
  await page.goto('/today');
  await page.getByRole('link', { name: /Make the offer · 12 Ranelagh Road/ }).click();
  await expect(page).toHaveURL(/\/offer$/);
  await page.goto(`${lettingUrl}/approval`);
  await expect(
    page.getByRole('heading', { name: 'Tom approved Aoife, and Ciarán as backup' }),
  ).toBeVisible();
});

test('R20, R21, UX-DC-15, UX-DC-17 to UX-DC-20: the offer goes out with a deadline, the renter accepts on their phone, and everyone else hears', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, links } = await twoChosen(browser, page);
  // UX-DC-19: until the owner approves, three rents are in and the checks are back, the offer's
  // first screen names what's missing, at its place, with a link to it.
  await page.goto(`${lettingUrl}/offer`);
  await expect(page.getByRole('heading', { level: 1, name: 'The offer' })).toBeVisible();
  await expect(page.getByText('The owner hasn’t approved yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ask the owner' })).toBeVisible();
  await expect(
    page.getByText(/Three comparable rents are needed before the offer\. 0 of 3/),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add comparable rents' })).toBeVisible();
  await expect(page.getByText(/checks aren’t back yet/)).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('This is needed before the offer can go.').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check and send' })).toHaveCount(0);
  await flowAtBothWidths(page, 'offer-waiting-for');

  await recordComparablesThroughUi(page, lettingUrl);
  // UX-DC-15 (Q22): no email for the owner, so the operator records that they've approved.
  await page.goto(`${lettingUrl}/approval`);
  await page.getByRole('button', { name: 'The owner has already approved' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recorded: the owner has approved' }),
  ).toBeVisible();
  await flowAtBothWidths(page, 'owner-recorded');
  await page.getByRole('link', { name: 'Continue to the offer' }).click();

  // UX-DC-17: the offer opens filled in. UX-DC-20: offering to the backup is on, as a choice.
  await expect(page.getByText('€1,850, one month’s rent, the most allowed')).toBeVisible();
  await expect(page.getByText('48 hours')).toBeVisible();
  await expect(
    page.getByRole('checkbox', {
      name: 'If Aoife says no or doesn’t answer, offer it to Ciarán',
    }),
  ).toBeChecked();
  // The owner's approval isn't asked again as a tick here.
  await expect(page.getByText(/has approved/)).toHaveCount(0);
  // UX-DC-18 (rule 4): the deposit can't be more than a month's rent.
  await page.getByRole('link', { name: 'Change Deposit' }).click();
  await page.getByLabel('Deposit').fill('2,000');
  await page.getByRole('checkbox', { name: 'Go ahead without waiting for them' }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('The deposit can’t be more than one month’s rent: €1,850.'),
  ).toBeVisible();
  await expect(page.getByLabel('Deposit')).toBeFocused();
  // Typed with a euro sign and a comma, it is read as an amount.
  await page.getByLabel('Deposit').fill('€1,850');
  await expect(
    page.getByRole('checkbox', { name: 'Go ahead without waiting for them' }),
  ).toBeChecked();
  await flowAtBothWidths(page, 'offer');
  await screenshot(page, '41-make-offer');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // UX-DC-6, rule 7: the message in its fixed wording, with the terms in it.
  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible();
  await expect(
    page.getByText(/you’d pay a deposit of €1,850 and the first month’s rent of €1,850/),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await flowAtBothWidths(page, 'offer-check');
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(page.getByRole('heading', { name: 'Offer sent' })).toBeVisible();
  await expect(
    page.getByText(/^Aoife has until \w+day \d+ \w+, .+\. Gaff will tell you/),
  ).toBeVisible();
  await expect(
    page.getByText('If it isn’t accepted in time, it goes to Ciarán, as you decided.'),
  ).toBeVisible();
  await flowAtBothWidths(page, 'offer-sent');

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

  await page.goto(`${lettingUrl}/offer`);
  await expect(page.getByRole('heading', { name: 'Aoife accepted' })).toBeVisible();
  await page.goto(lettingUrl);
  await expect(page.getByRole('list', { name: 'How far it’s got' })).toContainText(
    'Sign · Tenancy',
  );
  await page.goto(`${lettingUrl}/history`);
  await expect(page.getByText('Offer accepted: the home is let')).toBeVisible();
  await expect(page.getByText('Everyone else told')).toBeVisible();
});

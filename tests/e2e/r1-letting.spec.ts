import { expect, test } from '@playwright/test';
import { daysFromToday } from '../fixtures/lettings';
import {
  addATime,
  createLettingThroughUi,
  expectAccessible,
  homeIdIn,
  pickDate,
  pickTime,
  screenshot,
  signUpOperator,
  toGoLiveThroughUi,
  afterGoingLive,
} from './support';
import { expectOverview, openHistory } from './journeys';

/**
 * Stage 1 through the real screens. Adding a letting has journeys of its own, at both widths
 * (ux-lt-adding-a-letting.spec.ts); these hold the PRD's requirements to the same screens.
 */
test('R1: an operator creates a letting with viewing times', async ({ page }) => {
  await signUpOperator(page);
  await page.getByRole('link', { name: 'Add a letting' }).click();
  await expect(page.getByRole('heading', { name: 'Tell Gaff about the home' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Fill it in myself' }).click();

  // The address. Nothing can be skipped: an empty step says what it needs. UX-FL-3: the errors
  // are at their fields, with no box at the top; focus goes to the first, and a screen reader
  // hears how many there are.
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'another look' })).toHaveText(
    '3 things need another look',
  );
  await expect(page.getByText('That didn’t save yet')).toHaveCount(0);
  await expect(page.getByText('Enter the first line of the address')).toBeVisible();
  await expect(page.getByLabel('Address', { exact: true })).toBeFocused();
  await page.getByLabel('Address', { exact: true }).fill('12 Ranelagh Road');
  await page.getByLabel('Town or area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  await page.getByRole('textbox', { name: 'Eircode (optional)' }).fill('d06 f2x3');
  await screenshot(page, '05-new-letting');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByLabel('Rent a month').fill('1,850');
  await pickDate(page, 'Available from', daysFromToday(30));
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // The home. A fact that says "No HAP" is explained in plain words before moving on (rule 3).
  await page
    .getByRole('group', { name: 'Type of home' })
    .getByRole('radio', { name: 'Apartment' })
    .check();
  await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
  await page.getByRole('group', { name: 'Bathrooms' }).getByRole('radio', { name: '1' }).check();
  await page.getByLabel('BER rating').selectOption('C1');
  await page
    .getByLabel('Anything else renters often ask?')
    .fill('Gas central heating\nBins collected on Tuesdays\nNo HAP');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'another look' })).toHaveText(
    '1 thing needs another look',
  );
  await expect(page.getByText('touches on housing assistance')).toBeVisible();
  await expect(page.getByLabel('Anything else renters often ask?')).toBeFocused();
  await expectAccessible(page);
  await screenshot(page, '06-new-letting-errors');
  await page
    .getByLabel('Anything else renters often ask?')
    .fill('Gas central heating\nBins collected on Tuesdays');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // It is a letting in set-up now. Back keeps what was answered.
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByLabel('BER rating')).toHaveValue('C1');
  await expect(page.getByLabel('Anything else renters often ask?')).toHaveValue(
    'Gas central heating\nBins collected on Tuesdays',
  );

  // Viewing times aren't part of adding a letting (UX-LT-14): they're on the letting's own
  // calendar (UX-VW-1), added with one sheet (UX-VW-3).
  await page.goto(`/lettings/${homeIdIn(page.url())}/viewings`);
  await expect(
    page.getByText('No viewings yet. Add a time and renters book themselves.'),
  ).toBeVisible();
  await addATime(page, daysFromToday(7), async (sheet) => {
    // The common case: pick a day, press Add. The line says what it makes.
    await expect(sheet.getByText(/^4 places, \w+day \d+ \w+, 6pm to 7pm$/)).toBeVisible();
  });

  // Only the setting for the chosen way of viewing shows.
  await addATime(page, daysFromToday(9), async (sheet) => {
    await pickTime(page, 'From', '11am', sheet);
    await pickTime(page, 'Until', '11:30am', sheet);
    await expect(sheet.getByLabel('Most people at once')).toHaveCount(0);
    await sheet.getByRole('radio', { name: 'Open viewing' }).check();
    await expect(sheet.getByLabel('Length of each visit')).toHaveCount(0);
    await sheet.getByLabel('Most people at once').selectOption('10');
    await expect(sheet.getByText(/^10 places, \w+day \d+ \w+, 11am to 11:30am$/)).toBeVisible();
    await expectAccessible(page);
  });
  await expect(
    page.getByRole('link', { name: /^11am to 11:30am · 12 Ranelagh Road/ }),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '07-viewing-times');

  await page.getByRole('link', { name: 'Continue setting up' }).click();
  await expect(page.getByRole('heading', { name: '12 Ranelagh Road', level: 1 })).toBeVisible();
  // UX-LP-1, UX-LP-3: one thing to do, with one button: carry on where they left off. The four
  // parts say where it is; nothing says "Step 1 of 9".
  await expectOverview(page, {
    task: 'Continue',
    says: 'Finish setting up. 4 steps left.',
    figures: [],
    next: 'When it’s live, Gaff answers every enquiry within minutes.',
  });
  await expect(page.getByRole('list', { name: 'How far it’s got' })).toContainText('Set up');
  await expectAccessible(page);
  await screenshot(page, '08-letting-overview');
  // The home itself, as renters will see it, is under Home.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText('€1,850 a month')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Viewing times' })).toContainText(
    '15-minute slots',
  );

  await page.getByRole('link', { name: 'Lettings', exact: true }).first().click();
  await expect(page.getByRole('link', { name: '12 Ranelagh Road', exact: true })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '09-dashboard-with-letting');
});

test('R2: an operator sets criteria from the fixed list', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  const overview = `/lettings/${homeIdIn(page.url())}`;
  await page.goto(`${overview}/setup/details`);
  await expect(page.getByRole('heading', { name: 'Letting details', level: 1 })).toBeVisible();
  await expect(page.getByText('Why only these?')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('checkbox', { name: 'Most people' }).check();
  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByRole('checkbox', { name: 'Length of stay' }).check();
  await page
    .getByRole('group', { name: 'Plans to stay at least' })
    .getByRole('radio', { name: 'A year' })
    .check();
  await page.getByRole('checkbox', { name: 'No pets' }).check();
  await screenshot(page, '10-criteria');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Has this home been let before?' })).toBeVisible();

  await page.goto(`${overview}?view=home`);
  const details = page.getByRole('region', { name: 'Letting details' });
  await expect(details.getByText('Up to 3 people')).toBeVisible();
  await expect(details.getByText('Plans to stay at least a year')).toBeVisible();
  await expect(details.getByText('No pets (assistance dogs are always welcome)')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '11-overview-with-criteria');

  // They can change until people are invited: from the letting's page, on their own.
  await details.getByRole('link', { name: 'Change letting details' }).click();
  await expect(page.getByRole('checkbox', { name: 'Most people' })).toBeChecked();
  await page.getByLabel('Most people who can live there').selectOption('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Letting details saved.')).toBeVisible();
  await expect(details.getByText('Up to 2 people')).toBeVisible();
});

test('R3: an operator checks the rent, and Gaff catches a rent over the cap', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  const overview = `/lettings/${homeIdIn(page.url())}`;
  await page.goto(`${overview}/setup/rent-check`);
  await expect(
    page.getByRole('heading', { name: 'Has this home been let before?', level: 1 }),
  ).toBeVisible();
  await expectAccessible(page);

  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.getByLabel('Yes, and the last tenancy began before 1 March 2026').check();
  await next.click();
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await next.click();
  await page.getByLabel('Last rent a month').fill('1,700');
  await pickDate(page, 'Date that rent was set', '2025-10-31');
  await screenshot(page, '12-rent-check');
  await next.click();

  await expect(page.getByRole('heading', { name: 'The rent cap applies' })).toBeVisible();
  await expect(page.getByText(/You’re asking €1,850 a month\./)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '13-rent-over-cap');

  // The letting's page says so too, under Home, until the rent is inside the rules.
  await page.goto(`${overview}?view=home`);
  await expect(page.getByText('The rent is more than the cap allows')).toBeVisible();
  await page.getByRole('link', { name: 'Check again' }).click();
  // The answers given before are there; nothing is asked twice.
  await expect(
    page.getByLabel('Yes, and the last tenancy began before 1 March 2026'),
  ).toBeChecked();
  await next.click();
  await next.click();
  await expect(page.getByLabel('Last rent a month')).toHaveValue('1,700');
  await next.click();
  await expect(page.getByRole('heading', { name: 'The rent cap applies' })).toBeVisible();
  await page.getByLabel('Rent a month', { exact: true }).fill('1,720');
  await page.getByRole('button', { name: 'Change the rent' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Rent check saved.')).toBeVisible();
  await expect(page.getByText('The rent is more than the cap allows')).toHaveCount(0);
  await expect(page.getByText('€1,720 a month').first()).toBeVisible();
});

test('R4, UX-LP-14: an operator enters three comparable rents, one home at a time, started from this home', async ({
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  const lettingId = homeIdIn(page.url());
  await page.goto(`/lettings/${lettingId}/comparables`);
  await expect(page).toHaveURL(new RegExp(`/lettings/${lettingId}/comparables/1$`));
  for (const [n, rent, type] of [
    [1, '1,800', null],
    [2, '1,950', null],
    [3, '2,100', 'house'],
  ] as const) {
    await page.setViewportSize(
      n === 2 ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await expect(
      page.getByRole('heading', { level: 1, name: `Comparable rent ${n} of 3` }),
    ).toBeVisible();
    // OQ-2: Gaff doesn't read the register itself; it opens in a new tab for the person.
    const register = page.getByRole('link', { name: /Open the RTB’s Rent Register/ });
    await expect(register).toHaveAttribute('target', '_blank');
    await expect(register).toHaveAttribute('href', /^https:\/\/rtb\.ie\//);
    // The area, type and bedrooms start from this home; the person types the rent.
    await expect(page.getByLabel('Area')).not.toHaveValue('');
    await expect(page.getByLabel('Type of home')).toHaveValue('apartment');
    await expect(page.getByLabel('Bedrooms')).toHaveValue('2');
    await expect(page.getByLabel('Rent a month')).toHaveValue('');
    if (type) await page.getByLabel('Type of home').selectOption(type);
    if (n === 1) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Enter the monthly rent in euro, like 1,800')).toBeVisible();
      await expect(page.getByLabel('Rent a month')).toBeFocused();
    }
    await page.getByLabel('Area').fill('Dublin 6');
    await page.getByLabel('Rent a month').fill(rent);
    await expectAccessible(page);
    await screenshot(page, `ux-lp-14-comparable-${n === 2 ? 390 : 1280}${n === 3 ? '-last' : ''}`);
    if (n === 1) await screenshot(page, '14-comparables');
    await page
      .getByRole('button', { name: n < 3 ? 'Next' : 'Save comparables', exact: true })
      .click();
  }
  await expect(page.getByText('Comparables saved for the rent-setting pack.')).toBeVisible();
  await expect(page.getByText('The middle rent is €1,950 a month.')).toBeVisible();
  await expect(page.getByText('Comparable 3 is a different type of home (house).')).toBeVisible();
  await expectAccessible(page);
  // Changing one opens the first, as it was entered.
  await page.goto(`/lettings/${lettingId}/comparables`);
  await expect(page.getByLabel('Rent a month')).toHaveValue('1800');
  // Opened from the offer, where they're needed (Q41), they go back to it.
  await page.goto(`/lettings/${lettingId}/comparables?from=offer`);
  await expect(page).toHaveURL(new RegExp(`/comparables/1\\?from=offer$`));
  await expect(page.getByRole('link', { name: 'Close' })).toHaveAttribute(
    'href',
    `/lettings/${lettingId}/offer`,
  );
});

test('Stage 1 and R27: the operator confirms set-up, and the timeline shows every step', async ({
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await toGoLiveThroughUi(page);

  await expect(page.getByRole('button', { name: 'Start taking enquiries' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '15-ready-to-go-live');
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByRole('heading', { name: '12 Ranelagh Road is live' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // UX-GR-3: a first letting ends with its test enquiry, watched being answered.
  await afterGoingLive(page);
  await expect(page.getByRole('list', { name: 'How far it’s got' })).toContainText(
    'Find · Enquiries',
  );

  await openHistory(page);
  await expect(page.getByText('Set-up confirmed: Gaff started answering enquiries')).toBeVisible();
  await expect(page.getByText('Up to 3 people')).toBeVisible();
  // Every step of adding it reads in plain words: never an event's code.
  await expect(page.getByText('Started adding the home')).toBeVisible();
  await expect(page.getByText('Address saved')).toBeVisible();
  await expect(
    page.getByText(/\b(letting|organisation|criteria|rent_check)\.[a-z_]+\b/),
  ).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, '16-timeline');
});

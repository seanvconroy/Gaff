import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { aPng } from '../fixtures/photos';
import {
  addHomeThroughUi,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  pickDate,
  screenshot,
  signUpLandlord,
  signUpOperator,
  toGoLiveThroughUi,
} from './support';

/**
 * Work package WP-9: adding a letting (UX-LT-1, UX-LT-4, UX-LT-5, UX-LT-8 to UX-LT-16, UX-LT-22
 * to UX-LT-24; the flow rules UX-FL-1 to UX-FL-4). Each journey runs at 390px and at 1280px:
 * the same steps and the same words at both (UX-DS-25).
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

/** A made-up photo: a square of one colour, as a PNG. Never a real home. */
const aPhoto = (name: string, colour: [number, number, number]) => ({
  name,
  mimeType: 'image/png',
  buffer: aPng(colour),
});

/** UX-FL-3: errors are at the fields. Nothing in the step is an alert or a notice above it. */
const expectNoErrorBox = (page: Page) =>
  expect(page.locator('main [role="alert"], main [class*="Notice-module"]')).toHaveCount(0);
const problems = (page: Page) => page.getByRole('status').filter({ hasText: 'another look' });
const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });
const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;

test('UX-LT-1, UX-LT-8 to UX-LT-15, UX-LT-22: a letting goes live from scratch, a question at a time, with errors only at fields', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    const address = width === 390 ? '12 Ranelagh Road' : '14 Ranelagh Road';
    const eircode = width === 390 ? 'd06 f2x3' : 'D06 F2X5';

    // Step 1 (UX-LT-1): one box, one primary button, and the quiet way round it.
    await page.getByRole('link', { name: 'Add a letting' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tell Gaff about the home' }),
    ).toBeVisible();
    const about = page.getByLabel('Paste your advert, or describe the home in your own words.');
    await expect(about).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    // UX-FL-1: a focused task has no navigation, and Close on the left.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    expect((await box(page.getByRole('link', { name: 'Close' }))).x).toBeLessThan(
      viewport.width / 2,
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-01-start-${width}`);

    // Reading an advert is work package WP-10. Until then the box says so, at the field, and
    // keeps what was typed.
    await about.fill('Bright two-bed apartment near the Luas.');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#field-about-error')).toContainText('Gaff can’t read adverts yet.');
    await expect(about).toHaveValue('Bright two-bed apartment near the Luas.');
    await expectNoErrorBox(page);

    // UX-LT-8 (Q31): a Daft link is kept to match enquiries, and never fetched.
    await about.fill('https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText(
        'Got it. Gaff will use this link to match enquiries. Paste the advert’s text too, and Gaff will fill in the details.',
      ),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-01-start-link-kept-${width}`);
    await page.getByRole('link', { name: 'Fill it in myself' }).click();

    // Step 3, "Where is it?" (UX-LT-9): one search field. UX-FL-3: pressing Next with nothing
    // marks the field, and there is no box at the top.
    await expect(page.getByRole('heading', { level: 1, name: 'Where is it?' })).toBeVisible();
    const progress = page.getByRole('list', { name: 'Add a letting' });
    await expect(progress.getByRole('listitem')).toHaveCount(7);
    await expect(progress.locator('[aria-current="step"]')).toContainText('Address');
    await next(page).click();
    await expect(problems(page)).toHaveText('1 thing needs another look');
    await expect(page.locator('#field-addressSearch-error')).toContainText(
      'Choose an address from the list, or enter it yourself',
    );
    await expectNoErrorBox(page);
    const search = page.getByRole('combobox', { name: 'Eircode or address' });
    await expect(search).toBeFocused();
    // An address that isn't found says what to do, under the field.
    await search.fill('Zzyzx Boulevard');
    await expect(
      page.getByText('We can’t find that. Check the Eircode, or enter the address yourself.'),
    ).toBeVisible();
    // An Eircode finds the full postal address.
    await search.fill(eircode);
    const found = page.getByRole('option', { name: new RegExp(`^${address}`) });
    await expect(found).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-03-address-search-${width}`);
    await found.click();
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue(address);
    await expect(page.getByLabel('Town or area')).toHaveValue('Ranelagh, Dublin 6');
    await expect(page.getByLabel('County')).toHaveValue('Dublin');
    await expect(page.getByRole('textbox', { name: 'Eircode (optional)' })).toHaveValue(
      eircode.toUpperCase(),
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-03-address-${width}`);
    await next(page).click();

    // Step 4, "Rent and date". Both are needed, and each says so at its own field.
    await expect(page.getByRole('heading', { level: 1, name: 'Rent and date' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    await next(page).click();
    await expect(problems(page)).toHaveText('2 things need another look');
    await expect(page.locator('#field-rent-error')).toBeVisible();
    await expect(page.locator('#field-availableFrom-error')).toBeVisible();
    await expect(page.getByLabel('Rent a month')).toBeFocused();
    await expectNoErrorBox(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-04-rent-errors-${width}`);
    await page.getByLabel('Rent a month').fill('1,850');
    await pickDate(page, 'Available from', isoDateInDays(30));
    await expect(page.locator('#field-rent-error')).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-04-rent-${width}`);
    await next(page).click();

    // Step 5, "The home": type and bedrooms as taps; the rest offered (UX-LT-14). A
    // description that says who should live there is stopped at its field (rule 3).
    await expect(page.getByRole('heading', { level: 1, name: 'The home' })).toBeVisible();
    await next(page).click();
    await expect(problems(page)).toHaveText('2 things need another look');
    await expect(page.getByText('Choose the type of home')).toBeVisible();
    await expect(page.getByText('Choose the number of bedrooms')).toBeVisible();
    await page
      .getByRole('group', { name: 'Type of home' })
      .getByRole('radio', { name: 'Apartment' })
      .check();
    await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
    const description = page.getByLabel('About this home');
    await description.fill('A bright apartment. Would suit a professional couple. No HAP.');
    await next(page).click();
    await expect(problems(page)).toHaveText('1 thing needs another look');
    await expect(page.locator('#field-description-error')).toBeVisible();
    await expect(description).toBeFocused();
    await expectNoErrorBox(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-05-home-errors-${width}`);
    await description.fill('A bright apartment on the first floor, five minutes from the Luas.');
    await page.getByLabel('Anything else renters often ask?').fill('Gas central heating');
    await expectAccessible(page);
    await screenshot(page, `ux-lt-05-home-${width}`);
    await next(page).click();

    // Step 6, "Photos" (UX-LT-10): Gaff keeps its own copies; the first is the cover; they
    // reorder from each photo's menu as well as by dragging. No line about rights (Q46).
    await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
    await expect(page.getByText(/rights|permission to use/i)).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-06-photos-empty-${width}`);
    await page
      .getByLabel('Choose photos')
      .setInputFiles([aPhoto('front.png', [36, 99, 168]), aPhoto('kitchen.png', [201, 140, 60])]);
    const photos = page.getByRole('list', { name: 'Photos' });
    await expect(photos.getByRole('img')).toHaveCount(2);
    await expect(photos.getByRole('listitem').first()).toContainText('Cover');
    const first = await photos.getByRole('img').first().getAttribute('src');
    expect(first).toMatch(/^\/media\/homes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
    // The second photo moves earlier, from its menu, and becomes the cover.
    await page.getByRole('button', { name: 'Photo 2 of 2' }).click();
    await page.getByRole('menuitem', { name: 'Move earlier' }).click();
    await expect(photos.getByRole('img').nth(1)).toHaveAttribute('src', first!);
    await expect(next(page)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-06-photos-${width}`);
    // Gaff serves its own copy.
    expect((await page.request.get(first!)).headers()['content-type']).toBe('image/jpeg');
    await next(page).click();

    // Step 7, "Letting details" (UX-LT-11): the four fixed criteria, each off until tapped,
    // and the one house rule. No free text, and nothing is called "who it suits".
    await expect(page.getByRole('heading', { level: 1, name: 'Letting details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nothing to add' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(5);
    await expect(page.locator('main textarea, main input[type="text"]')).toHaveCount(0);
    await expect(page.getByText(/who it suits|would suit|ideal tenant/i)).toHaveCount(0);
    await expect(
      page.getByText('Nothing asked. Everyone who enquires is ranked by when they enquired.'),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: 'Most people' }).check();
    await page.getByLabel('Most people who can live there').selectOption('3');
    await page.getByRole('checkbox', { name: 'No pets' }).check();
    await page.getByRole('checkbox', { name: 'No smoking indoors' }).check();
    await expect(
      page.getByText(
        'Up to 3 people · No pets (assistance dogs always welcome) · No smoking indoors',
      ),
    ).toBeVisible();
    await page.getByText('Why only these?').click();
    await expect(page.getByText(/Equality law says a home can’t be advertised/)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-07-letting-details-${width}`);
    await next(page).click();

    // Step 8 (UX-LT-12): the rent check never asks for the rent, and a first letting is one tap.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Has this home been let before?' }),
    ).toBeVisible();
    await expect(page.getByLabel(/Rent you’re asking|Rent a month/)).toHaveCount(0);
    await next(page).click();
    await expect(
      page.getByText('Choose whether the home has been let before, and when'),
    ).toBeVisible();
    await expectNoErrorBox(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-08-rent-check-${width}`);
    await page.getByLabel('No, this is its first letting').check();
    await next(page).click();

    // UX-LT-13: the result is its own screen, with one sentence of why.
    await expect(
      page.getByRole('heading', { level: 1, name: 'You can set the rent at market level' }),
    ).toBeVisible();
    await expect(
      page.getByText('This is the home’s first letting, so there’s no earlier rent to cap it.'),
    ).toBeVisible();
    await page.getByText('About these rules').click();
    await expect(page.getByText(/Rules version ie-2026-03-v1\./)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-08-rent-result-${width}`);
    await next(page).click();

    // Step 9, "Ready to go live": the home as renters will see it (UX-LT-22), "On gaff.ie",
    // and what's asked once: a number renters can call. None of it is needed (UX-LT-14): the
    // home has no BER, and it can still go live.
    await expect(page.getByRole('heading', { level: 1, name: 'Ready to go live' })).toBeVisible();
    const preview = page.getByRole('article', { name: address });
    await expect(
      preview.getByRole('heading', { name: `${address}, Ranelagh, Dublin 6` }),
    ).toBeVisible();
    await expect(preview.getByText('€1,850 a month · 2-bed apartment')).toBeVisible();
    await expect(preview.getByText('Let by Halcyon Lettings')).toBeVisible();
    await expect(
      preview.getByText(
        'Up to 3 people · No pets (assistance dogs always welcome) · No smoking indoors',
      ),
    ).toBeVisible();
    await expect(preview.getByText('Gas central heating')).toBeVisible();
    await expect(preview.getByRole('img', { name: 'The cover photo' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'On gaff.ie' })).toBeChecked();
    await expect(page.getByLabel('BER rating')).toBeVisible();
    await expect(
      page.getByText('It will show on gaff.ie once it has a BER. It can go live now.'),
    ).toBeVisible();
    // An agency isn't asked to confirm who it is: its licence does that (Q47).
    await expect(page.getByText('Confirm it’s you')).toHaveCount(0);
    const phone = page.getByLabel('A number renters can call');
    await phone.fill('not a number');
    await page.getByRole('button', { name: 'Start taking enquiries' }).click();
    await expect(page.locator('#field-phone-error')).toContainText(
      'Enter a phone number, like 01 234 5678',
    );
    await expectNoErrorBox(page);
    await phone.fill('01 234 5678');
    await page.getByLabel('BER rating').selectOption('C1');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-09-go-live-${width}`);
    await page.getByRole('button', { name: 'Start taking enquiries' }).click();

    // UX-FL-4: what was done and what Gaff does next. Then the one question that follows.
    await expect(page.getByRole('heading', { level: 1, name: `${address} is live` })).toBeVisible();
    await expect(
      page.getByText(/Gaff answers every enquiry for this home from now on/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('Choose where it’s advertised, or No')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Daft', exact: true }).check();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-10-advertised-${width}`);
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    // The letting's own page: live, and its one task is forwarding (the flow itself is WP-11).
    await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
    await expect(page.getByText('Step 2 of 9 · Enquiries')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Send your Daft enquiries to Gaff' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-11-live-${width}`);

    // What was kept: the link, the choices, the phone number where renters' pages read it, and
    // a person's decision to go live (UX-LT-15).
    const id = homeIdIn(page.url());
    const [kept] = await asSystem<Record<string, unknown>>(
      `select l.status, l.daft_url, l.on_gaff, l.ber_rating, l.advertised_on, l.no_smoking_indoors,
         o.phone, (select count(*)::int from letting_photos p where p.letting_id = l.id) as photos,
         (select count(*)::int from decisions d where d.letting_id = l.id and d.kind = 'confirm_setup') as decisions
       from lettings l join organisations o on o.id = l.organisation_id where l.id = $1`,
      [id],
    );
    expect(kept).toMatchObject({
      status: 'live',
      daft_url: 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234',
      on_gaff: true,
      ber_rating: 'C1',
      advertised_on: ['daft'],
      no_smoking_indoors: true,
      phone: '01 234 5678',
      photos: 2,
      decisions: 1,
    });
    await context.close();
  }
});

test('UX-FL-2: Save and exit keeps what was typed, and Continue comes back to the same step', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    const address = `${width} Sandymount Avenue`;

    // Nothing is kept on the first screen, so nothing there promises "Save and exit".
    await page.goto('/lettings/new?from=/today');
    await expect(page.getByRole('button', { name: 'Save and exit' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Fill it in myself' }).click();
    await page.getByRole('button', { name: 'Enter it myself' }).click();
    await page.getByLabel('Address', { exact: true }).fill(address);
    await page.getByLabel('Town or area').fill('Sandymount, Dublin 4');
    await page.getByLabel('County').selectOption('Dublin');
    await next(page).click();

    // Half way through "Rent and date": the rent is typed, the date isn't chosen.
    await expect(page.getByRole('heading', { level: 1, name: 'Rent and date' })).toBeVisible();
    await page.getByLabel('Rent a month').fill('2,100');
    await page.getByRole('button', { name: 'Save and exit' }).click();
    await expect(page).toHaveURL(/\/today$/);

    // The first screen lists the home that was started. It opens where they left off.
    await page.goto('/lettings/new?from=/today');
    const started = page.getByRole('region', { name: 'Carry on with a home you started' });
    await expect(started.getByRole('link', { name: address })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-resume-drafts-${width}`);
    await started.getByRole('link', { name: address }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Rent and date' })).toBeVisible();
    await expect(page.getByLabel('Rent a month')).toHaveValue('2,100');
    await pickDate(page, 'Available from', isoDateInDays(21));
    await next(page).click();
    await page
      .getByRole('group', { name: 'Type of home' })
      .getByRole('radio', { name: 'House' })
      .check();
    await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '3' }).check();
    await next(page).click();

    // It is a letting now. Photos are skipped, and the person leaves at letting details.
    await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
    const id = homeIdIn(page.url());
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Letting details' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'No pets' }).check();
    await page.getByRole('button', { name: 'Save and exit' }).click();
    await expect(page).toHaveURL(/\/today$/);

    // Its own page says how much is left, with one button: Continue.
    await page.goto(`/lettings/${id}`);
    const setup = page.getByRole('region', { name: 'Finish setting up' });
    await expect(setup.getByText('2 steps left.')).toBeVisible();
    await expect(page.getByText('No pets (assistance dogs are always welcome)')).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-resume-letting-${width}`);
    await setup.getByRole('link', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Has this home been let before?' }),
    ).toBeVisible();
    // Back still works, and shows what was answered.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('checkbox', { name: 'No pets' })).toBeChecked();
    await context.close();
  }
});

test('UX-LT-12, UX-LT-13: a rent above the cap is changed on the result screen, and only then can the home go live', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    await addHomeThroughUi(page, `${width} Harbour Row`);
    const id = homeIdIn(page.url());
    await page.goto(`/lettings/${id}/setup/rent-check`);

    // One question per screen, and each only when an earlier answer makes it apply.
    await page.getByLabel('Yes, and the last tenancy began before 1 March 2026').check();
    await next(page).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Has the home been substantially changed since then?',
      }),
    ).toBeVisible();
    await expect(page.getByText('How did the last tenancy end?')).toHaveCount(0);
    await page.getByRole('radio', { name: 'No', exact: true }).check();
    await next(page).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'What was the last rent?' }),
    ).toBeVisible();
    await next(page).click();
    await expect(page.getByText('Enter the last monthly rent in euro, like 1,700')).toBeVisible();
    await page.getByLabel('Last rent a month').fill('1,700');
    await pickDate(page, 'Date that rent was set', '2025-10-31');
    await expectAccessible(page);
    await screenshot(page, `ux-lt-08-rent-check-last-rent-${width}`);
    await next(page).click();

    // The cap applies, and €1,850 is above it. The screen's one action is to change the rent.
    await expect(
      page.getByRole('heading', { level: 1, name: 'The rent cap applies' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /You’re asking €1,850 a month\. The most the rules allow is €1,7\d\d(\.\d\d)? a month\./,
      ),
    ).toBeVisible();
    await expect(next(page)).toHaveCount(0);
    const rent = page.getByLabel('Rent a month', { exact: true });
    await expectAccessible(page);
    await screenshot(page, `ux-lt-08-rent-over-cap-${width}`);
    await rent.fill('1,800');
    await page.getByRole('button', { name: 'Change the rent' }).click();
    await expect(page.locator('#field-rent-error')).toContainText(
      'That’s the most the rules allow.',
    );
    // UX-LT-14: until then the home can't go live, whatever address is typed: asking for
    // the go-live step comes back here.
    await page.goto(`/lettings/${id}/setup/go-live`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'The rent cap applies' }),
    ).toBeVisible();
    await page.getByLabel('Rent a month', { exact: true }).fill('1,720');
    await page.getByRole('button', { name: 'Change the rent' }).click();
    await expect(next(page)).toBeVisible();
    await expect(page.getByLabel('Rent a month')).toHaveCount(0);
    await next(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ready to go live' })).toBeVisible();
    await expect(page.getByText('€1,720 a month · 2-bed apartment · Furnished')).toBeVisible();
    await context.close();
  }
});

test('UX-LT-14, Q47: a private landlord’s home goes live with the identity step in place, and a number is offered, not required', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpLandlord(page);
    await addHomeThroughUi(page, `${width} Chapel Lane`);
    await toGoLiveThroughUi(page);
    // "Confirm it's you" is shown as coming (work package WP-24), and holds nothing.
    await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
    await expect(
      page.getByText(/That check isn’t open yet, so there’s nothing to do now\./),
    ).toBeVisible();
    await expect(page.getByLabel('A number renters can call')).toBeVisible();
    // The home has no photo: it can go live, and says what showing it on gaff.ie still needs.
    await expect(page.getByText('A home needs one photo to be shown on gaff.ie.')).toBeVisible();
    await expect(page.getByText('Let by Mary')).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-09-go-live-landlord-${width}`);
    await page.getByRole('checkbox', { name: 'On gaff.ie' }).uncheck();
    await page.getByRole('button', { name: 'Start taking enquiries' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `${width} Chapel Lane is live` }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: 'No', exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
    const [kept] = await asSystem<Record<string, unknown>>(
      `select l.status, l.on_gaff, l.advertised_on, o.phone from lettings l
       join organisations o on o.id = l.organisation_id where l.id = $1`,
      [homeIdIn(page.url())],
    );
    expect(kept).toEqual({ status: 'live', on_gaff: false, advertised_on: [], phone: null });
    await context.close();
  }
});

test('UX-LT-24: a live letting has "Send a test enquiry" until its first real enquiry, and it shows what a renter gets', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    const address = `${width} Canal View`;
    await createLettingThroughUi(page, address);
    // Not before it's live.
    await page.goto(`/lettings/${homeIdIn(page.url())}`);
    await expect(page.getByRole('button', { name: `More for ${address}` })).toHaveCount(0);
    await goLiveThroughUi(page);

    await page.getByRole('button', { name: `More for ${address}` }).click();
    await page.getByRole('menuitem', { name: 'Send a test enquiry' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Send a test enquiry' }),
    ).toBeVisible();
    await expect(page.getByText(/Nothing is sent to anyone\./)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-test-enquiry-${width}`);
    await page.getByRole('button', { name: 'Send a test enquiry' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Here’s what a renter gets' }),
    ).toBeVisible();
    const reply = page.getByRole('article');
    await expect(reply.getByText(`Your enquiry about ${address}`, { exact: true })).toBeVisible();
    // Rule 6: the first message says it is from an AI assistant.
    await expect(reply.getByText(/AI assistant/)).toBeVisible();
    await expect(reply.getByText(/^Hello Sam,/)).toBeVisible();
    await expect(
      page.getByText(/Gaff’s first reply to Sam Sample, a made-up renter\./),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-test-enquiry-reply-${width}`);
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page).toHaveURL(/\/lettings\/[0-9a-f-]{36}$/);
    // Nothing was sent, and nobody was made.
    const [made] = await asSystem<{ applications: number }>(
      `select count(*)::int as applications from applications where letting_id = $1`,
      [homeIdIn(page.url())],
    );
    expect(made!.applications).toBe(0);
    await context.close();
  }
});

test('UX-LT-23: a closed letting is let again from the review screen, with everything from last time', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    const address = `${width} Shop Street`;
    await addHomeThroughUi(page, address);
    await page.getByLabel('Choose photos').setInputFiles([aPhoto('front.png', [90, 140, 90])]);
    await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
    await goLiveThroughUi(page);
    const before = homeIdIn(page.url());
    await page.getByText('Close this letting').click();
    await page.getByLabel('We’re not letting it now').check();
    await page.getByRole('button', { name: 'Close the letting' }).click();
    await expect(page.getByText('This letting is withdrawn')).toBeVisible();

    // "Let it again", in the closed letting's menu, opens the review with last time's home.
    await page.getByRole('button', { name: `More for ${address}` }).click();
    await page.getByRole('menuitem', { name: 'Let it again' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Here’s the home from last time' }),
    ).toBeVisible();
    const again = homeIdIn(page.url());
    expect(again).not.toBe(before);
    // UX-LT-4: a preview a part to a row, not a form. What's new each time is marked.
    await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
    await expect(page.getByText('1 thing to check')).toBeVisible();
    const rows = page.getByRole('main').getByRole('listitem');
    await expect(rows.filter({ hasText: 'Address' })).toContainText(
      `${address}, Ranelagh, Dublin 6`,
    );
    await expect(rows.filter({ hasText: 'Rent and date' })).toContainText(
      '€1,850 a month · No date yet',
    );
    await expect(rows.filter({ hasText: 'Rent and date' })).toContainText('Check this');
    await expect(rows.filter({ hasText: 'Photos' })).toContainText('1 photo');
    await expect(rows.filter({ hasText: 'Letting details' })).toContainText(
      'Up to 3 people · No pets (assistance dogs always welcome)',
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-02-review-${width}`);

    // Tapping a part opens it in a sheet. A problem is said at its field; saving closes it.
    await page.getByRole('link', { name: /^Rent and date/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Rent and date' });
    await expect(sheet.getByLabel('Rent a month')).toHaveValue('1,850');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.locator('#field-availableFrom-error')).toBeVisible();
    await sheet.getByLabel('Rent a month').fill('1,950');
    await pickDate(page, 'Available from', isoDateInDays(45), sheet);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-02-review-sheet-${width}`);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();
    await expect(rows.filter({ hasText: 'Rent and date' })).toContainText(
      '€1,950 a month · Available from',
    );
    await expect(page.getByText('Nothing to check')).toBeVisible();

    // UX-LT-5: "Looks right" goes past every step that has its answer, to letting details.
    await page.getByRole('button', { name: 'Looks right' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Letting details' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Most people' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'No pets' })).toBeChecked();
    await next(page).click();
    await page.getByLabel('No, this is its first letting').check();
    await next(page).click();
    await next(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ready to go live' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'The cover photo' })).toBeVisible();
    // Asked once: this lister has gone live before, so no number is asked for again.
    await expect(page.getByLabel('A number renters can call')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start taking enquiries' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `${address} is live` })).toBeVisible();

    // The letting before is as it was; the new one has its own copy of the photo.
    const lettings = await asSystem<{ id: string; status: string; rent: number; photos: number }>(
      `select l.id, l.status, l.monthly_rent_cents as rent,
         (select count(*)::int from letting_photos p where p.letting_id = l.id) as photos
       from lettings l where l.id = any($1::uuid[]) order by l.created_at`,
      [[before, again]],
    );
    expect(lettings).toEqual([
      { id: before, status: 'withdrawn', rent: 185000, photos: 1 },
      { id: again, status: 'live', rent: 195000, photos: 1 },
    ]);
    await context.close();
  }
});

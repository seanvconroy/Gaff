import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry } from '../fixtures/emails';
import {
  confirmThePin,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  pickDate,
  screenshot,
  sendTestEmail,
  settled,
  signUpOperator,
} from './support';

/**
 * Work package WP-10: reading an advert (UX-LT-1 to UX-LT-3, UX-LT-6 to UX-LT-8, UX-LT-16,
 * UX-AI-4, UX-AI-5, UX-AI-9, UX-AI-12, UX-AI-13). The reader in these runs is the local
 * stand-in (AI_PROVIDER=fake); what it hands back is checked by the same code as the model's.
 * Each screen runs at 390px and at 1280px: the same steps and words at both (UX-DS-25).
 */
const widths = [
  [390, { width: 390, height: 844 }],
  [1280, { width: 1280, height: 900 }],
] as const;

const BOX = 'Paste your advert, or describe the home in your own words.';
const main = (page: Page) => page.getByRole('main');
const rows = (page: Page) => main(page).getByRole('listitem');
const READER_OFF = { name: 'gaff-dev-advert-reader', value: 'off' };

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows: found } = await client.query<T>(sql, params);
    await client.query('commit');
    return found;
  } finally {
    await client.end();
  }
}

/** "17 December 2026": a date as an advert writes it. */
const inWords = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A made-up advert that says everything but the BER, with two lines about who should apply. */
const advert = (address: string, eircode: string, availableFrom: string) =>
  [
    `${address}, Ranelagh, Dublin 6, ${eircode}`,
    'Bright two-bed apartment on the first floor, five minutes from the Luas.',
    'Rent: €1,850 per month',
    `Available from ${inWords(availableFrom)}`,
    '2 bedrooms, 1 bathroom. Furnished.',
    'Gas fired central heating.',
    'Would suit a professional couple. No HAP.',
    'Minimum 12 month lease. No pets.',
    'Contact Mary Byrne on 087 123 4567 or mary.byrne@example.ie',
  ].join('\n');

test('UX-LT-2, UX-LT-3, UX-LT-6, UX-AI-4: a pasted advert becomes "Here’s what Gaff found", with each value’s words on tap, lines about who should apply left out with why, and a "Check this" fixed on the way to going live', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    const address = `${width} Ranelagh Road`;
    const eircode = width === 390 ? 'D06 F2X3' : 'D06 F2X5';
    const availableFrom = isoDateInDays(30);

    await page.goto('/lettings/new');
    await page.getByLabel(BOX).fill(advert(address, eircode, availableFrom));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // UX-AI-1, UX-AI-4: the review is titled as Gaff's work, and the AI's part is marked.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Here’s what Gaff found' }),
    ).toBeVisible();
    const id = homeIdIn(page.url());
    await expect(page.getByText('Read by AI')).toBeVisible();
    await expect(
      page.getByText('Gaff filled these in from your advert, and guessed nothing.'),
    ).toBeVisible();
    // UX-LT-4: a preview a part to a row, not a form.
    await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
    await expect(rows(page).filter({ hasText: 'Address' })).toContainText(
      `${address}, Ranelagh, Dublin 6, ${eircode}`,
    );
    await expect(rows(page).filter({ hasText: 'Rent and date' })).toContainText(
      `€1,850 a month · Available from`,
    );
    // UX-LT-3, UX-AI-5: no BER in the advert, so none is guessed: it is to check, as are the
    // photos, and the letting details the advert mentions, which a person switches on.
    await expect(page.getByText('3 things to check')).toBeVisible();
    await expect(rows(page).filter({ hasText: 'The home' })).toContainText('No BER yet');
    await expect(rows(page).filter({ hasText: 'The home' })).toContainText('Check this');
    await expect(rows(page).filter({ hasText: 'Letting details' })).toContainText(
      'Your advert mentions letting details.',
    );
    await expect(rows(page).filter({ hasText: 'Letting details' })).toContainText('Check this');
    // UX-LT-6: said once: the lines about who should apply were left out.
    await expect(
      page.getByText('Gaff left out 2 lines. Adverts can’t say who a home suits.'),
    ).toBeVisible();
    // UX-LT-7: the contact line's name and number went nowhere near what renters see.
    await expect(main(page)).not.toContainText('Mary Byrne');
    expect(await page.getByRole('button', { name: 'Looks right' }).count()).toBe(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-02-found-${width}`);

    // "Why?" shows each line left out, and why, in three sentences.
    await main(page).getByRole('button', { name: 'Why?' }).click();
    const why = page.getByRole('dialog', { name: 'What Gaff left out' });
    await expect(why).toContainText('Equality law says a home can’t be advertised');
    await expect(why).toContainText('“Would suit a professional couple.”');
    await expect(why).toContainText('“No HAP.”');
    await expect(why).toContainText('housing assistance, which equality law protects');
    await settled(page);
    await screenshot(page, `ux-lt-02-left-out-${width}`);
    await expectAccessible(page);
    await why.getByRole('button', { name: 'Done' }).click();
    await expect(why).toBeHidden();

    // UX-LT-3: tapping a part shows the words each value came from, above its fields.
    await page.getByRole('link', { name: /^Address/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Address' });
    await expect(sheet.getByRole('heading', { name: 'From your advert' })).toBeVisible();
    await expect(sheet).toContainText(`“${address}, Ranelagh, Dublin 6, ${eircode}”`);
    await settled(page);
    await screenshot(page, `ux-lt-02-source-${width}`);
    await expectAccessible(page);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();

    // A "Check this" fixed: the BER, in the home's sheet. The rest of the home stays as read.
    await page.getByRole('link', { name: /^The home/ }).click();
    const home = page.getByRole('dialog', { name: 'The home' });
    await expect(home).toContainText('“Bright two-bed apartment on the first floor');
    await home.getByLabel('BER rating').selectOption('C1');
    await home.getByRole('button', { name: 'Save' }).click();
    await expect(home).toBeHidden();
    await expect(rows(page).filter({ hasText: 'The home' })).toContainText('BER C1');
    await expect(rows(page).filter({ hasText: 'The home' })).not.toContainText('Check this');
    await expect(page.getByText('2 things to check')).toBeVisible();

    // Section 6: what the advert says about letting details is switched on, for a person to
    // save. Nothing is asked of renters until they do.
    await page.getByRole('link', { name: /^Letting details/ }).click();
    const details = page.getByRole('dialog', { name: 'Letting details' });
    await expect(details).toContainText('“No pets.”');
    await expect(details).toContainText('“Minimum 12 month lease.”');
    await expect(details.getByRole('checkbox', { name: 'No pets' })).toBeChecked();
    await expect(details.getByRole('checkbox', { name: 'Length of stay' })).toBeChecked();
    await expectAccessible(page);
    await details.getByRole('button', { name: 'Save' }).click();
    await expect(details).toBeHidden();
    await expect(page.getByText('1 thing to check')).toBeVisible();

    // The description and facts are the lister's own words, about the home only.
    await page.getByRole('link', { name: /^About this home/ }).click();
    const about = page.getByRole('dialog', { name: 'About this home' });
    await expect(about.getByLabel('About this home')).toHaveValue(
      'Bright two-bed apartment on the first floor, five minutes from the Luas.',
    );
    await expect(about.getByLabel('Anything else renters often ask?')).toHaveValue(
      'Gas fired central heating',
    );
    await expect(about).toContainText('The description is in your advert’s own words.');
    // UX-AI-8, rule 3: the wording check holds for words typed here too, at the field.
    await about.getByLabel('About this home').fill('Bright two-bed. Would suit a couple.');
    await about.getByRole('button', { name: 'Save' }).click();
    await expect(about.locator('#field-description-error')).toContainText(
      'says who should live there, not what the home is like',
    );
    await about.getByRole('button', { name: 'Close' }).click();

    // UX-LT-5: "Looks right" goes on to what's still missing: here, the photos.
    await page.getByRole('button', { name: 'Looks right' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
    await goLiveThroughUi(page);

    // Nothing the advert said became a criterion on its own, and no line left out did.
    const [letting] = await asSystem<{ criteria: Record<string, unknown>; ber: string }>(
      'select criteria, ber_rating as ber from lettings where id = $1',
      [id],
    );
    expect(letting!.ber).toBe('C1');
    expect(letting!.criteria).toMatchObject({ maxOccupants: 3, minStayMonths: 12, noPets: true });
    // Rule 8: the event of the reading holds counts, never the advert's words.
    const events = await asSystem<{ data: unknown }>(
      "select data from events where type = 'letting.advert_read' and letting_id = $1",
      [id],
    );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toMatch(/Ranelagh|Mary|087|professional|HAP/);
    await context.close();
  }
});

test('Q31, UX-LT-8, UX-AI-12: a pasted link is not opened, words Gaff can’t make out keep what was typed, and the manual route is on the same screen', async ({
  browser,
}) => {
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const page = await context.newPage();
    await signUpOperator(page);
    await page.goto('/lettings/new');
    const box = page.getByLabel(BOX);

    // A link to anywhere is never fetched: the box says so, at the field, and asks for words.
    await box.fill('https://www.example.ie/homes/12-ranelagh-road');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#field-about-error')).toContainText(
      'Gaff doesn’t open links, so it can’t read that page. Paste the advert’s text here, or fill it in yourself.',
    );
    await expect(box).toHaveValue('https://www.example.ie/homes/12-ranelagh-road');
    await expect(page.getByRole('link', { name: 'Fill it in myself' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-01-link-not-opened-${width}`);

    // Words with nothing about a home in them: nothing is guessed, and what was typed stays.
    await box.fill('Hello there.');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#field-about-error')).toContainText('Gaff couldn’t make that out.');
    await expect(box).toHaveValue('Hello there.');
    await context.close();
  }
});

test('UX-AI-12: with the reader switched off, the first screen offers only "Fill it in myself", and the manual route works', async ({
  browser,
  baseURL,
}) => {
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    await context.addCookies([{ ...READER_OFF, url: baseURL! }]);
    const page = await context.newPage();
    await signUpOperator(page);
    await page.goto('/lettings/new');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tell Gaff about the home' }),
    ).toBeVisible();
    await expect(page.getByText('Gaff isn’t reading adverts just now.')).toBeVisible();
    await expect(page.getByLabel(BOX)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-01-reader-off-${width}`);
    await page.getByRole('link', { name: 'Fill it in myself' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Where is it?' })).toBeVisible();
    await page.getByRole('button', { name: 'Enter it myself' }).click();
    await page.getByLabel('Address', { exact: true }).fill(`${width} Leeson Street`);
    await page.getByLabel('Town or area').fill('Dublin 2');
    await page.getByLabel('County').selectOption('Dublin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await confirmThePin(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Rent and date' })).toBeVisible();
    await context.close();
  }
});

test('UX-LT-16: an enquiry Gaff couldn’t match starts a letting from Inbox, filled in from the email, and the enquiry joins it once it exists', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  const to = await gaffAddress(page);
  const tag = randomUUID().slice(0, 8);
  const renter = `aoife.${tag}@example.ie`;
  await sendTestEmail(page, {
    to,
    ...daftEnquiry,
    replyTo: `Aoife Byrne <${renter}>`,
    text: daftEnquiry.text.replace('aoife.byrne@example.ie', renter),
  });
  const list = page.getByRole('list', { name: 'Conversations' }).getByRole('listitem');
  await expect(async () => {
    await page.goto('/inbox');
    await expect(list.filter({ hasText: 'Daft.ie' })).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/inbox');
    await list.filter({ hasText: 'Daft.ie' }).getByRole('link').click();
    await expect(
      page.getByRole('heading', { name: 'Is it about a home that isn’t on Gaff yet?' }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-16-inbox-${width}`);
  }

  await main(page).getByRole('button', { name: 'Start a letting from this enquiry' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Here’s what Gaff found' }),
  ).toBeVisible();
  // A parser read the portal's email, not the AI: no AI mark, and nothing about the renter.
  await expect(page.getByText('Read by AI')).toHaveCount(0);
  await expect(main(page)).not.toContainText('Aoife');
  await expect(rows(page).filter({ hasText: 'Address' })).toContainText(
    '12 Ranelagh Road, Ranelagh, Dublin 6',
  );
  await expect(rows(page).filter({ hasText: 'Rent and date' })).toContainText('No rent yet');
  await page.getByRole('link', { name: /^Address/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Address' });
  await expect(sheet.getByRole('heading', { name: 'From the enquiry' })).toBeVisible();
  await expect(sheet).toContainText('Kept to match enquiries. Gaff doesn’t open it.');
  await settled(page);
  await screenshot(page, `ux-lt-16-found`);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Back in Inbox meanwhile, the email carries on with the same home rather than a second one.
  await page.goto('/inbox');
  await list.filter({ hasText: 'Daft.ie' }).getByRole('link').click();
  await main(page).getByRole('link', { name: 'Carry on with this home' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Here’s what Gaff found' }),
  ).toBeVisible();

  // Only what's missing is asked: the rent and date, then the home.
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rent and date' })).toBeVisible();
  await page.getByLabel('Rent a month').fill('1850');
  await pickDate(page, 'Available from', isoDateInDays(30));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'The home', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Type of home' })
    .getByRole('radio', { name: 'Apartment' })
    .check();
  await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
  await page.getByLabel('BER rating').selectOption('C1');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
  const id = homeIdIn(page.url());

  // Now a letting, it holds the enquiry: the email has left Inbox's list of emails to place.
  await page.goto('/inbox?show=all');
  await expect(list.filter({ hasText: 'Daft.ie' })).toHaveCount(0);
  await page.goto(`/lettings/${id}/setup/photos`);
  await goLiveThroughUi(page);
  // R7: anyone who enquired during set-up hears back when the home goes live.
  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(
      page
        .locator('article')
        .filter({ hasText: `To ${renter}` })
        .filter({
          has: page.getByRole('heading', { name: 'Your enquiry about 12 Ranelagh Road' }),
        }),
    ).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
});

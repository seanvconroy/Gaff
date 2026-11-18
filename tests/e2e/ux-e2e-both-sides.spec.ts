import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { aPng } from '../fixtures/photos';
import {
  chooseTheOnlyApplicant,
  chooseWhoViews,
  needsYouBlock,
  recordComparablesThroughUi,
} from './journeys';
import {
  applyThroughUi,
  bookFirstTime,
  enterLinkCode,
  expectFramePageAtBothWidths,
} from './renter';
import {
  addATime,
  addHomeThroughUi,
  confirmItsYou,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  linkInEmail,
  screenshot,
  signUpLandlord,
  signUpOperator,
  signUpRenter,
  startViewingsNow,
  toGoLiveThroughUi,
  uniqueEmail,
} from './support';

/**
 * Work package WP-28: two journeys that cross both sides of Gaff, end to end, through the real
 * screens. The renter's side runs at 390px and the operator's at 1280px, every page they open
 * has an accessibility check (which also measures control heights and targets), and the key
 * screens are checked at the other width too. Screenshots are screenshots/e2e-<screen>-<width>.png.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

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

async function aPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: PHONE,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  return { context, page: await context.newPage() };
}

/** A page as it stands at its own width: axe (with control sizes), nothing sideways, a shot. */
async function look(page: Page, name: string): Promise<void> {
  // A page that streams in arrives in two parts: check the whole of it, once it has settled.
  await page.waitForLoadState('networkidle');
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await screenshot(page, `e2e-${name}-${page.viewportSize()!.width}`);
}

/** A key screen at both widths, then back to the width it was at. */
async function atBothWidths(page: Page, name: string): Promise<void> {
  const was = page.viewportSize()!;
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await look(page, name);
  }
  await page.setViewportSize(was);
}

/** The link in the newest email to this address with this subject, once the job has sent it. */
async function emailed(to: string, subject: string): Promise<string> {
  let link = '';
  await expect(async () => {
    link = await linkInEmail(to, subject);
  }).toPass({ timeout: 30_000 });
  return link;
}

/** The home's public page, by the letting's ID. */
async function homePathOf(lettingId: string): Promise<string> {
  const [row] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  return `/homes/${row!.ref}`;
}

/** Search for homes in Ranelagh, and open this one from its card. */
async function findInSearch(renter: Page, homePath: string): Promise<void> {
  await renter.goto('/?where=Ranelagh');
  await expect(renter.getByRole('heading', { level: 1 })).toBeVisible();
  await look(renter, 'search');
  await renter.locator(`a[href="${homePath}"]`).first().click();
  await expect(renter).toHaveURL(new RegExp(`${homePath}$`));
}

/** Marks that the one person booked came, on the letting's attendance screen. */
async function markCame(page: Page, lettingUrl: string, name: string): Promise<void> {
  await page.goto(`${lettingUrl}/attendance`);
  const group = page.getByRole('group', { name: `Did ${name} come?` });
  await group.getByRole('button', { name: 'Came' }).click();
  await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute('aria-pressed', 'true');
  await look(page, 'attendance');
}

/** The stand-in ID service: the name it found, and the result. */
async function standInIdPasses(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await page.getByRole('button', { name: 'The ID and selfie match' }).click();
}

/** Income through the stand-in provider, then no previous landlord and no employer to ask. */
async function incomeAndNoReferees(renter: Page): Promise<void> {
  await renter.getByRole('button', { name: 'Check my income' }).click();
  await renter.getByRole('button', { name: 'Confirm this income' }).click();
  await expect(renter.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
  await look(renter, 'checks-references');
  await renter.getByRole('radio', { name: 'No', exact: true }).check();
  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await renter.getByRole('radio', { name: 'No', exact: true }).check();
  await renter.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(renter.getByRole('heading', { name: 'That’s everything from you' })).toBeVisible();
  await look(renter, 'checks-done');
}

/** The offer, from its first screen: Next, then send it to the person by their first name. */
async function sendTheOfferTo(page: Page, lettingUrl: string, first: string): Promise<void> {
  await page.goto(`${lettingUrl}/offer`);
  await expect(page.getByRole('heading', { name: 'The offer', exact: true })).toBeVisible();
  await look(page, 'offer');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await look(page, 'offer-check');
  await page.getByRole('button', { name: `Send the offer to ${first}` }).click();
  await expect(page.getByRole('heading', { name: 'Offer sent' })).toBeVisible();
  await look(page, 'offer-sent');
}

/** The renter accepts the offer on their phone. */
async function acceptTheOffer(renter: Page, link: string): Promise<void> {
  await renter.goto(link);
  await expect(renter.getByRole('button', { name: 'Accept the offer' })).toBeVisible();
  await look(renter, 'offer-renter');
  await renter.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    renter.getByText(/You’ve accepted the offer\. Your tenancy starts on/),
  ).toBeVisible();
  await look(renter, 'offer-accepted');
}

/** UX-TN-5 to UX-TN-7: "Finish this letting", the usual if it isn't known, and the results. */
async function finishTheLetting(page: Page, lettingUrl: string, address: string): Promise<void> {
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Finish this letting', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finish this letting' })).toBeVisible();
  await look(page, 'finish');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const usual = page.getByRole('heading', {
    level: 1,
    name: 'Before Gaff, how long did a letting usually take?',
  });
  const results = page.getByRole('heading', { level: 1, name: `${address} is let` });
  await expect(usual.or(results)).toBeVisible();
  if (await usual.isVisible()) {
    await look(page, 'usual-days');
    await page.getByText('About a month', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'And how many hours of your own time?' }),
    ).toBeVisible();
    await page.getByText('About 10 hours', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(results).toBeVisible();
  await expect(page.locator('[data-results="days"]')).toHaveText(
    /^0 days from first enquiry\. You usually take 30\.$/,
  );
  // UX-TN-6: one action, and only one.
  await expect(page.locator('[data-flow-footer]').getByRole('link')).toHaveCount(1);
}

/** An advert for a home, made up, saying everything Gaff needs and nothing about who it suits. */
const advert = (address: string) =>
  [
    `${address}, Ranelagh, Dublin 6, D06 K7W2`,
    'Bright two-bed apartment on the second floor, beside Ranelagh village.',
    'Rent: €1,850 per month',
    `Available from ${new Date(`${isoDateInDays(30)}T00:00:00Z`).toLocaleDateString('en-IE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })}`,
    '2 bedrooms, 1 bathroom. Furnished. BER C1.',
  ].join('\n');

test('UX-E2E-1: an agency’s home, added from an advert, is found on Gaff and let to a renter with no account, from the first search to the results screen', async ({
  browser,
  page,
}) => {
  test.setTimeout(900_000);
  await page.setViewportSize(DESKTOP);
  const agency = `Halcyon Lettings ${String(Date.now()).slice(-5)}`;
  const address = '21 Elmwood Avenue';
  const operator = await signUpOperator(page, agency);
  await look(page, 'operator-today');

  // The agency pastes its advert; Gaff reads it, and the lister checks it and adds a photo.
  await page.goto('/lettings/new');
  await look(page, 'add-letting');
  await page
    .getByLabel('Paste your advert, or describe the home in your own words.')
    .fill(advert(address));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Here’s what Gaff found' }),
  ).toBeVisible();
  await look(page, 'advert-found');
  const lettingId = homeIdIn(page.url());
  const lettingUrl = `/lettings/${lettingId}`;
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  await look(page, 'photos');
  await page.goto(`${lettingUrl}/viewings`);
  await addATime(page, isoDateInDays(7));
  await look(page, 'viewing-times');
  await goLiveThroughUi(page);
  await look(page, 'letting-live');
  const homePath = await homePathOf(lettingId);

  // A renter with no account searches on their phone, opens the home, and asks to view.
  const renter = await aPhone(browser);
  const email = uniqueEmail('niamh');
  const name = 'Niamh Kelly';
  await findInSearch(renter.page, homePath);
  await expect(
    renter.page.getByRole('heading', { level: 1, name: `${address}, Ranelagh, Dublin 6` }),
  ).toBeVisible();
  await atBothWidths(renter.page, 'home-page');
  await renter.page
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await expect(
    renter.page.getByRole('heading', { level: 1, name: 'Who should we reply to?' }),
  ).toBeVisible();
  await look(renter.page, 'ask-who');
  await renter.page.getByLabel('Your name').fill(name);
  await renter.page.getByLabel('Your email').fill(email);
  await renter.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.page.getByRole('heading', {
      name: 'How many people would live here, including you?',
    }),
  ).toBeVisible();
  await look(renter.page, 'ask-occupants');
  await renter.page.getByRole('radio', { name: '2', exact: true }).check();
  await renter.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(renter.page.getByRole('heading', { name: 'Do you have any pets?' })).toBeVisible();
  await look(renter.page, 'ask-pets');
  await renter.page.getByRole('radio', { name: 'No', exact: true }).check();
  await renter.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.page.getByRole('heading', { name: 'Anything to ask about the home?' }),
  ).toBeVisible();
  await look(renter.page, 'ask-anything');
  await renter.page.getByRole('button', { name: 'Skip' }).click();
  await expect(renter.page.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
  await atBothWidths(renter.page, 'ask-sent');

  // They confirm from the first email, which says it's from an AI assistant (rule 6).
  const first = await emailed(email, `Your enquiry about ${address}`);
  await renter.page.goto(first);
  await expect(renter.page.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
  await look(renter.page, 'renter-confirmed');

  // The operator chooses who views; the renter books, comes, and applies.
  await chooseWhoViews(page, lettingUrl, { waitFor: name, tick: [name] });
  await look(page, 'who-views-sent');
  await renter.page.goto(await emailed(email, `Book a viewing: ${address}`));
  await look(renter.page, 'renter-invited');
  await bookFirstTime(renter.page);
  await look(renter.page, 'renter-booked');
  await startViewingsNow(address, operator);
  await markCame(page, lettingUrl, name);
  await renter.page.reload();
  await applyThroughUi(renter.page, { earning: 'From a job', income: '5,200' });
  await look(renter.page, 'renter-applied');

  // The operator chooses them, with no backup; they do their checks.
  await chooseTheOnlyApplicant(page, lettingUrl, name);
  await look(page, 'checks-started');
  await renter.page.goto(await emailed(email, `${address}: a few checks before an offer`));
  await look(renter.page, 'checks');
  await enterLinkCode(renter.page, email, 'Start');
  await look(renter.page, 'checks-id');
  await renter.page.getByRole('button', { name: 'Check my ID' }).click();
  await standInIdPasses(renter.page);
  await expect(
    renter.page.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  await look(renter.page, 'checks-keep-id');
  await renter.page.getByRole('link', { name: 'Not now' }).click();
  await incomeAndNoReferees(renter.page);
  await expect(async () => {
    await page.goto(`${lettingUrl}/checks`);
    await expect(page.getByText('Verified: Niamh Kelly.')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await atBothWidths(page, 'checks-back');

  // The owner approves on their phone, with no account.
  await page.goto(`${lettingUrl}/approval`);
  await expect(page.getByRole('heading', { level: 1, name: 'Who owns this home?' })).toBeVisible();
  await look(page, 'owner-details');
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Tom to approve' })).toBeVisible();
  await look(page, 'owner-ask');
  await page.getByRole('button', { name: 'Send to Tom' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  const owner = await aPhone(browser);
  await owner.page.goto(
    await emailed('tom.walsh@example.ie', `${address}: please approve a tenant`),
  );
  await expect(owner.page.getByRole('heading', { name: 'Niamh Kelly' })).toBeVisible();
  // The owner sees income as a multiple of the rent, never the amount, and no contact details.
  expect(await owner.page.content()).not.toMatch(/5,200|niamh\./);
  await expectFramePageAtBothWidths(owner.page, 'owner', 'e2e-owner-approve');
  await owner.page.getByRole('button', { name: 'Approve Niamh' }).click();
  await expect(owner.page.getByRole('heading', { name: 'Thanks, Tom' })).toBeVisible();
  await expectFramePageAtBothWidths(owner.page, 'owner', 'e2e-owner-thanks');
  await owner.context.close();

  // The offer, once three comparable rents are in; the renter accepts.
  await recordComparablesThroughUi(page, lettingUrl);
  await sendTheOfferTo(page, lettingUrl, 'Niamh');
  await acceptTheOffer(renter.page, await emailed(email, `An offer: ${address}`));

  // The agreement, signed by both sides.
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'The tenancy, step by step' })).toBeVisible();
  await atBothWidths(page, 'tenancy');
  await page.getByRole('link', { name: 'Send the agreement', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Send the agreement to Niamh' }),
  ).toBeVisible();
  await look(page, 'agreement-send');
  await page.getByRole('button', { name: 'Send to Niamh to sign' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sent to Niamh' })).toBeVisible();
  await renter.page.goto(await emailed(email, `${address}: your tenancy agreement to sign`));
  await expect(
    renter.page.getByRole('heading', { level: 1, name: 'Your tenancy agreement' }),
  ).toBeVisible();
  await look(renter.page, 'agreement-renter');
  await renter.page.getByLabel('Type your full name to sign').fill(name);
  await renter.page
    .getByLabel('I’ve read the agreement, and I agree to sign it electronically')
    .check();
  await renter.page.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(renter.page.getByRole('heading', { name: 'You’ve signed' })).toBeVisible();
  await look(renter.page, 'agreement-signed-renter');
  await page.goto(`${lettingUrl}/tenancy/sign`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign the agreement' })).toBeVisible();
  await look(page, 'agreement-sign');
  await page.getByLabel('Type your full name to sign').fill('Ann Power');
  await page.getByLabel(/I agree to sign this agreement electronically, for the landlord/).check();
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signed by both sides' })).toBeVisible();
  await look(page, 'agreement-signed');

  // The deposit and first month's rent, to the agency's own account (rules 4 and 5).
  await page.goto(`${lettingUrl}/tenancy/payment`);
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await look(page, 'payment-account');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A number Niamh can ring' }),
  ).toBeVisible();
  await page.getByLabel('Phone number').fill('01 234 5678');
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Ask Niamh for the deposit and first month’s rent',
    }),
  ).toBeVisible();
  await look(page, 'payment-ask');
  await page.getByRole('button', { name: 'Ask Niamh to pay' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asked Niamh to pay' })).toBeVisible();
  // The renter's own page says how to pay, and to whom.
  await renter.page.goto(first);
  await look(renter.page, 'payment-renter');
  await page.goto(`${lettingUrl}/tenancy/received`);
  await look(page, 'payment-received');
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Niamh has a receipt.')).toBeVisible();

  // Registered with the RTB.
  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Register with the RTB' }),
  ).toBeVisible();
  await look(page, 'rtb');
  await page.getByLabel('RTB registration number').fill('RT0012345');
  await page.getByRole('button', { name: 'I’ve registered it' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Registered with the RTB' }),
  ).toBeVisible();

  // Move-in: the keys, and an inventory the renter confirms as a fair record.
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Hand over the keys', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hand over the keys' })).toBeVisible();
  await page.getByLabel('Keys handed over').check();
  await look(page, 'move-in');
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  // Saved once the page has come back from the server, not just when the box is ticked.
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Keys handed over')).toBeChecked();
  await page.getByRole('link', { name: 'Add an item' }).click();
  await page.getByLabel('Room').fill('Kitchen');
  await page.getByLabel('Item', { exact: true }).fill('Fridge');
  await page.getByRole('group', { name: 'Condition' }).getByRole('radio', { name: 'Good' }).check();
  await look(page, 'inventory-item');
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText(/Added Fridge, Kitchen\. 1 item so far\./)).toBeVisible();
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Save and share with Niamh' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Keys handed over' })).toBeVisible();
  await look(page, 'keys-handed-over');
  await renter.page.goto(first);
  const pps = renter.page.getByRole('heading', { name: 'Your PPS number' });
  const inventory = renter.page.getByRole('link', { name: 'Check the inventory' });
  await expect(pps.or(inventory)).toBeVisible();
  if (await pps.isVisible()) {
    await look(renter.page, 'pps');
    await renter.page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  await look(renter.page, 'tenancy-renter');
  await inventory.click();
  await expect(renter.page.getByRole('heading', { name: 'Your move-in inventory' })).toBeVisible();
  await look(renter.page, 'inventory-renter');
  await renter.page.getByRole('button', { name: 'This is a fair record' }).click();
  await expect(renter.page.getByRole('heading', { name: 'You’ve confirmed it' })).toBeVisible();
  await look(renter.page, 'inventory-confirmed');
  await renter.page.getByRole('link', { name: 'Back to your tenancy' }).click();
  await expect(renter.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await atBothWidths(renter.page, 'welcome-home');
  await renter.context.close();

  // Finished: the results screen, with one next action.
  await finishTheLetting(page, lettingUrl, address);
  await atBothWidths(page, 'results');
  await page.goto(lettingUrl);
  await expect(needsYouBlock(page)).toContainText('This letting is closed.');
  await look(page, 'letting-closed');
});

test('UX-E2E-2: a private landlord confirms it’s them once, and lets a home to a renter who asks in two taps and reuses a kept identity check, which the landlord sees only at the checks stage', async ({
  browser,
  page,
}) => {
  test.setTimeout(900_000);
  await page.setViewportSize(DESKTOP);
  const address = '9 Belgrave Square';

  // The landlord signs up, lists a home, and confirms it's them at its first go-live.
  const landlord = await signUpLandlord(page, 'Mary Byrne', { verified: false });
  await addHomeThroughUi(page, address);
  await page
    .getByLabel('Choose photos')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) }]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(1);
  const lettingId = homeIdIn(page.url());
  const lettingUrl = `/lettings/${lettingId}`;
  await page.goto(`${lettingUrl}/viewings`);
  await addATime(page, isoDateInDays(7));
  await toGoLiveThroughUi(page, 'Confirm it’s you');
  await expect(page.getByText(/so you’re not asked again\./)).toBeVisible();
  await atBothWidths(page, 'landlord-confirm-its-you');
  await page.getByRole('button', { name: 'Confirm it’s you' }).click();
  await standInIdPasses(page);
  await expect(page.getByRole('heading', { name: 'Ready to go live' })).toBeVisible();
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${address} is live` })).toBeVisible();
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(/\/lettings\/[0-9a-f-]+(\/test-enquiry\?live=1|\?saved=live)$/);
  if (page.url().includes('/test-enquiry')) {
    await look(page, 'landlord-test-enquiry');
    await page.getByRole('button', { name: 'Send a test enquiry' }).click();
    await expect(page.getByRole('heading', { name: 'Here’s what a renter gets' })).toBeVisible();
    await page.getByRole('link', { name: 'Done', exact: true }).click();
  }
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
  await look(page, 'landlord-live');
  const homePath = await homePathOf(lettingId);

  // A renter with a profile that keeps their answers and a verified identity.
  const renter = await aPhone(browser);
  const name = 'Aoife Byrne';
  const email = await signUpRenter(renter.page, name);
  await asSystem(
    `insert into renter_profiles (user_id, keeps_details, answers, answers_at, last_used_at)
     select id, true, $2::jsonb, now(), now() from users where email = $1
     on conflict (user_id) do update set answers = excluded.answers, answers_at = now()`,
    [email, JSON.stringify({ occupants: 2, hasPets: false })],
  );
  await asSystem(
    `insert into verified_identities (user_id, verified_name, verified_at)
     select id, $2, now() - interval '30 days' from users where email = $1`,
    [email, name],
  );

  // They find the home, which says Mary's identity is verified, and ask in two taps.
  await findInSearch(renter.page, homePath);
  await expect(
    renter.page.getByRole('region', { name: 'Let by' }).getByText('Identity verified'),
  ).toBeVisible();
  await look(renter.page, 'home-page-landlord');
  await renter.page
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await expect(
    renter.page.getByRole('heading', { level: 1, name: 'Send this to Mary?' }),
  ).toBeVisible();
  await expect(renter.page.getByText('From your profile.')).toBeVisible();
  await atBothWidths(renter.page, 'ask-two-taps');
  await renter.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(renter.page.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
  await look(renter.page, 'ask-sent-signed-in');

  // Rule 2, UX-PF-12: before the checks stage, nothing about the renter's identity is shown.
  const nothingAboutIdentity = async (where: string) => {
    expect(await page.locator('body').innerText(), where).not.toMatch(/verified|identity/i);
  };
  await expect(async () => {
    await page.goto(`${lettingUrl}?view=people`);
    await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await nothingAboutIdentity('People');
  await look(page, 'landlord-people');
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('dialog', { name })).toBeVisible();
  await nothingAboutIdentity('their sheet');
  await page.keyboard.press('Escape');

  // Chosen to view; they book, come and apply.
  await chooseWhoViews(page, lettingUrl, { waitFor: name, tick: [name] });
  await nothingAboutIdentity('who views');
  await renter.page.goto(await emailed(email, `Book a viewing: ${address}`));
  await bookFirstTime(renter.page);
  await look(renter.page, 'booked-signed-in');
  await startViewingsNow(address, landlord);
  await markCame(page, lettingUrl, name);
  await renter.page.reload();
  await applyThroughUi(renter.page, { earning: 'From a job', income: '5,200' });
  await page.goto(`${lettingUrl}/choose`);
  await nothingAboutIdentity('choosing');
  await chooseTheOnlyApplicant(page, lettingUrl, name);
  await page.goto(`${lettingUrl}/checks`);
  expect(await page.locator('body').innerText()).not.toContain('Verified:');

  // At the checks stage, they say yes to reusing their identity check; only now does Mary see it.
  await renter.page.goto(await emailed(email, `${address}: a few checks before an offer`));
  await expect(
    renter.page.getByRole('heading', { name: /^Use the ID check you did on \d{1,2} \w+\?$/ }),
  ).toBeVisible();
  await atBothWidths(renter.page, 'use-kept-id');
  await renter.page.getByRole('button', { name: 'Yes, use it' }).click();
  await expect(renter.page.getByRole('heading', { name: 'Your income' })).toBeVisible();
  await incomeAndNoReferees(renter.page);
  await expect(async () => {
    await page.goto(`${lettingUrl}/checks`);
    await expect(page.getByText(`Verified: ${name}.`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await look(page, 'landlord-checks-back');

  // Her own home: nobody else to ask. The offer, accepted.
  await recordComparablesThroughUi(page, lettingUrl);
  await sendTheOfferTo(page, lettingUrl, 'Aoife');
  await acceptTheOffer(renter.page, await emailed(email, `An offer: ${address}`));

  // The tenancy's steps, quickly: signed on paper, paid, registered and moved in.
  await page.goto(`${lettingUrl}/tenancy/send`);
  await page.getByText('We signed on paper').click();
  await page.getByRole('button', { name: 'Both sides have signed on paper' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signed on paper' })).toBeVisible();
  await look(page, 'landlord-signed-on-paper');
  await page.goto(`${lettingUrl}/tenancy/payment`);
  await page.getByLabel('Name on the account').fill('Mary Byrne');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  const ring = page.getByRole('heading', { level: 1, name: 'A number Aoife can ring' });
  const ask = page.getByRole('heading', {
    level: 1,
    name: 'Ask Aoife for the deposit and first month’s rent',
  });
  await expect(ring.or(ask)).toBeVisible();
  if (await ring.isVisible()) {
    await page.getByLabel('Phone number').fill('087 765 4321');
    await page.getByRole('button', { name: 'Save the number' }).click();
  }
  await expect(ask).toBeVisible();
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asked Aoife to pay' })).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/received`);
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await page.getByLabel('RTB registration number').fill('RT0054321');
  await page.getByRole('button', { name: 'I’ve registered it' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Registered with the RTB' }),
  ).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/move-in`);
  await page.getByLabel('Keys handed over').check();
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  await expect(page.getByLabel('Keys handed over')).toBeChecked();
  await finishTheLetting(page, lettingUrl, address);
  await atBothWidths(page, 'landlord-results');
  await renter.context.close();

  // Her second home goes live without being asked to confirm it's her again.
  await addHomeThroughUi(page, '11 Belgrave Square');
  await toGoLiveThroughUi(page);
  await look(page, 'landlord-second-home');
});

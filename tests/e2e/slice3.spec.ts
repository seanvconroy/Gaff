import { expect, test, type Page } from '@playwright/test';
import { rentDueDay, rtbDeadline } from '../../src/domain/tenancy/tenancy';
import { formatDate } from '../../src/lib/format';
import { AOIFE, anAcceptedOffer, onPhone } from './journeys';
import { enterLinkCode, expectRenterPageAtBothWidths } from './renter';
import {
  AVAILABLE_IN_DAYS,
  confirmItsYou,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  isoDateInDays,
  linkInEmail,
  screenshot,
  signUpOperator,
} from './support';

test('R22: the tenant reads and signs the agreement on their phone, then the operator signs for the landlord', async ({
  browser,
  page,
}) => {
  test.slow();
  // The offer starts the tenancy when the home is available.
  const startDate = isoDateInDays(AVAILABLE_IN_DAYS);
  const { lettingUrl } = await anAcceptedOffer(browser, page);
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'Tenancy agreement' })).toBeVisible();
  await expect(page.getByText('Step 8 of 9 · Tenancy')).toBeVisible();
  await expectAccessible(page);
  // The agreement must name the landlord: this agency adds them first.
  await page.getByLabel('Landlord’s name').fill('Tom Walsh');
  await page.getByLabel('Landlord’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save the landlord’s details' }).click();
  await page.getByRole('button', { name: 'Send to Aoife to sign' }).click();
  await expect(page.getByText('Waiting for them to sign.')).toBeVisible();

  let agreementLink = '';
  await expect(async () => {
    agreementLink = await linkInEmail(AOIFE, '12 Ranelagh Road: your tenancy agreement to sign');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, agreementLink);
  const tenant = aoife.page;
  await expect(
    tenant.getByRole('heading', { name: 'Tenancy agreement: 12 Ranelagh Road' }),
  ).toBeVisible();
  // Rent falls due on the start date's day of the month (rentDueDay, unit-tested).
  const rentDay = rentDueDay(startDate);
  await expect(
    tenant.getByText(
      new RegExp(`€1,850 a month, paid in advance on the ${rentDay}(st|nd|rd|th) day`),
    ),
  ).toBeVisible();
  // UX-RN-21: the home at the top, links that jump to each section, and a copy to download.
  await expect(
    tenant.getByRole('heading', { level: 1, name: 'Your tenancy agreement' }),
  ).toBeVisible();
  await expect(
    tenant.locator('[data-frame="renter"]').getByText('12 Ranelagh Road').first(),
  ).toBeVisible();
  const contents = tenant.getByRole('navigation', { name: 'In this agreement' });
  const sections = await contents.getByRole('link').allInnerTexts();
  expect(sections.length).toBeGreaterThan(3);
  await contents.getByRole('link').nth(2).click();
  await expect(tenant).toHaveURL(/#section-3$/);
  await expect(tenant.getByRole('heading', { level: 3, name: sections[2]! })).toBeInViewport();
  const download = tenant.getByRole('link', { name: 'Download a copy' });
  const copy = await tenant.request.get((await download.getAttribute('href'))!);
  expect(copy.headers()['content-disposition']).toMatch(/^attachment; filename="/);
  expect(await copy.text()).toContain('Tenancy agreement: 12 Ranelagh Road');
  await expectAccessible(tenant);
  await expectNoSidewaysScroll(tenant);
  await screenshot(tenant, '43-tenant-agreement');
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-agreement' });
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrnes');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(
    tenant.getByText('Type your name as it is on the agreement: Aoife Byrne.'),
  ).toBeVisible();
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrne');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(tenant.getByRole('heading', { name: 'You’ve signed' })).toBeVisible();
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-agreement-signed' });
  // UX-RN-26: her own page says the same as the operator's: she has signed, and they sign next.
  await tenant.getByRole('link', { name: 'Back to your tenancy' }).click();
  await expect(tenant.getByText('You’ve signed. Halcyon Lettings signs next.')).toBeVisible();
  await expect(steps(tenant)).toHaveText([
    /Sign your agreement.*Next/,
    /Pay.*To come/,
    /inventory.*To come/,
  ]);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-countersign' });
  await tenant.goto(agreementLink);

  await page.reload();
  await expect(page.getByText('Aoife has signed')).toBeVisible();
  await page.getByLabel('Type your full name to sign').fill('Ann Power');
  await page.getByLabel(/I agree to sign this agreement electronically, for the landlord/).check();
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(page.getByText('Signed by both sides')).toBeVisible();

  await tenant.reload();
  await expect(tenant.getByText(/signed electronically by Aoife Byrne on/)).toBeVisible();
  await expect(tenant.getByText(/signed by Ann Power for Halcyon Lettings on/)).toBeVisible();
  await expectAccessible(tenant);
  await tenant.getByRole('link', { name: 'Back to your tenancy' }).click();
  await expect(steps(tenant)).toHaveText([
    /Sign your agreement.*Done/,
    /Pay.*Next/,
    /inventory.*To come/,
  ]);
  await aoife.context.close();
});

/** UX-RN-26: the tenant's three steps, as their page lists them. */
const steps = (tenant: Page) =>
  tenant.getByRole('list', { name: 'Your tenancy, step by step' }).getByRole('listitem');

/** The account tenants pay into, saved in Settings (which asks who's there first). */
async function saveTheAccount(page: Page) {
  await page.goto('/settings');
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  await expect(page.getByText('Saved.')).toBeVisible();
}

/** Stage 8 by the quick route: the landlord added, and the agreement signed on paper. */
async function signedOnPaper(page: Page, lettingUrl: string) {
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByLabel('Landlord’s name').fill('Tom Walsh');
  await page.getByLabel('Landlord’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save the landlord’s details' }).click();
  await page.getByText('Signing on paper instead?').click();
  await page.getByRole('button', { name: 'Both sides have signed on paper' }).click();
  await expect(page.getByText('Signed on paper', { exact: true })).toBeVisible();
}

test('R23: the tenant is asked for the deposit and first month’s rent, paid to the operator’s own account', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, offerLink } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);
  await expect(page.getByText('Add the account tenants pay into, in')).toBeVisible();

  await page.goto('/settings');
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 79');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await expect(
    page.getByText('That IBAN doesn’t look right. Check it against your bank’s details.'),
  ).toBeVisible();
  await expect(page.getByLabel('Name on the account')).toHaveValue(
    'Halcyon Lettings client account',
  );
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByText(/with the reference GAFF-/)).toBeVisible();

  // The tenant's own page says what to pay; how to pay is one tap away.
  const aoife = await onPhone(browser, offerLink);
  const tenant = aoife.page;
  await expect(tenant.getByText(/^€3,700 to pay( by \w+day \d+ \w+)?\.$/)).toBeVisible();
  await expect(steps(tenant)).toHaveText([
    /Sign your agreement.*Done/,
    /Pay.*Next/,
    /inventory.*To come/,
  ]);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-pay' });
  await tenant.getByRole('link', { name: 'See how to pay' }).click();

  // UX-SI-12: the page holds the lister's bank details, so the link alone doesn't open it.
  await expect(tenant.getByRole('heading', { name: 'First, check it’s you' })).toBeVisible();
  expect(await tenant.content()).not.toMatch(/IE29|AIBK|GAFF-/);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-pay-code' });
  await enterLinkCode(tenant, AOIFE);

  // UX-RN-22: the total, the account, and copy buttons for the IBAN and the reference.
  await expect(
    tenant.getByRole('heading', { name: 'Pay the deposit and first month’s rent' }),
  ).toBeVisible();
  await expect(tenant.getByText('Halcyon Lettings client account')).toBeVisible();
  await expect(tenant.getByText('IE29 AIBK 9311 5212 3456 78')).toBeVisible();
  await expect(tenant.getByText('€3,700', { exact: true })).toBeVisible();
  await expect(tenant.getByText(/^GAFF-/)).toBeVisible();
  await expect(tenant.getByRole('button', { name: 'Copy the IBAN' })).toBeVisible();
  await expect(tenant.getByRole('button', { name: 'Copy the reference' })).toBeVisible();
  // UX-RN-23 (rule 5): ring and check the details before paying. This lister has no number on
  // file yet, so the tenant is asked to ring one they already have.
  const ring = tenant.locator('[data-notice="ring"]');
  await expect(ring).toContainText('Ring to check these details');
  await expect(ring).toContainText(
    'Before you pay, ring Halcyon Lettings on a number you already have for them, and check the IBAN with them.',
  );
  // Rules 4 and 5: the deposit and first month's rent, to the lister's own account, and no fee.
  expect(await tenant.getByRole('main').innerText()).not.toMatch(/fee|pay gaff|card number/i);
  // UX-RN-24: the PPS number isn't a card under the payment details.
  await expect(tenant.getByText(/PPS/)).toHaveCount(0);
  await expectAccessible(tenant);
  await screenshot(tenant, '44-tenant-payment');
  await expectRenterPageAtBothWidths(tenant, { notices: ['ring'], shots: 'wp12-live-pay' });

  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();
  await tenant.reload();
  await expect(tenant.getByRole('heading', { name: 'Payment received' })).toBeVisible();
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-pay-received' });
  await aoife.context.close();
});

test('R24: the rent-setting and RTB packs; the tenant’s PPS number is optional and deleted once registered', async ({
  browser,
  page,
}) => {
  test.slow();
  // The offer starts the tenancy when the home is available.
  const startDate = isoDateInDays(AVAILABLE_IN_DAYS);
  const { lettingUrl, offerLink } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);

  // UX-RN-24: the PPS number is asked once, after payment, as its own short step.
  const aoife = await onPhone(browser, offerLink);
  const tenant = aoife.page;
  await expect(tenant.getByText('Halcyon Lettings will send you how to pay')).toBeVisible();
  await expect(tenant.getByText(/PPS/)).toHaveCount(0);
  await saveTheAccount(page);
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();

  await tenant.reload();
  await expect(tenant.getByRole('heading', { name: 'Your PPS number' })).toBeVisible();
  // One optional field, one line of why, and "Skip". Never a date of birth (rule 3).
  await expect(
    tenant.getByText(/It’s used only for that, and deleted once the tenancy is registered\./),
  ).toBeVisible();
  await expect(tenant.getByRole('main').locator('input:not([type=hidden])')).toHaveCount(1);
  await expect(tenant.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
  expect(await tenant.getByRole('main').innerText()).not.toMatch(/date of birth|birthday/i);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-pps' });
  await tenant.getByRole('textbox', { name: 'PPS number' }).fill('1234567A');
  await tenant.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    tenant.getByText('That PPS number doesn’t look right. Check it, or leave it blank.'),
  ).toBeVisible();
  await expectAccessible(tenant);
  await tenant.getByRole('textbox', { name: 'PPS number' }).fill('1234567T');
  await tenant.getByRole('button', { name: 'Save', exact: true }).click();
  // Answered, it isn't asked again: her page moves on, and says nothing more about it.
  await expect(tenant.getByText('There’s nothing you need to do now.')).toBeVisible();
  await expect(tenant.getByText(/PPS/)).toHaveCount(0);
  await expectAccessible(tenant);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-moving-in' });
  // Its own address is where she can still take it back, until the tenancy is registered.
  await tenant.goto(`${offerLink}/pps`);
  await expect(tenant.getByRole('heading', { name: 'You’ve given your PPS number' })).toBeVisible();
  await expect(tenant.getByRole('button', { name: 'Remove my PPS number' })).toBeVisible();
  expect(await tenant.content()).not.toContain('1234567T');
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-pps-given' });
  await aoife.context.close();

  await page.goto(`${lettingUrl}/tenancy/rtb-pack`);
  await expect(
    page.getByRole('heading', { name: 'RTB registration pack: 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(page.getByText('1234567T')).toBeVisible();
  await expect(page.getByText(`Register by ${formatDate(rtbDeadline(startDate))}`)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, '45-rtb-pack');
  await page.goto(`${lettingUrl}/tenancy/rent-pack`);
  await expect(
    page.getByRole('heading', { name: 'Rent-setting pack: 12 Ranelagh Road' }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByLabel('RTB registration number').fill('RT0012345');
  await page.getByRole('button', { name: 'It’s registered with the RTB' }).click();
  await expect(page.getByText(/Registered/).first()).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/rtb-pack`);
  await expect(page.getByText('Deleted after registration')).toBeVisible();
  await expect(page.getByText('1234567T')).toHaveCount(0);
});

/** A real 8×8 PNG (a red square), so the photo is drawn and uploaded as a phone would. */
const RED_SQUARE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
);

test('R25: the move-in checklist, and an inventory with photos that the tenant confirms', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, offerLink } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByLabel('Keys handed over').check();
  await page.getByLabel('Electricity meter reading').fill('012345');
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  await expect(page.getByText('Moved in', { exact: true })).toBeVisible();

  await page.getByLabel('Room').fill('Kitchen');
  await page.getByLabel('Item', { exact: true }).fill('Fridge');
  await page.getByLabel('Condition').selectOption('good');
  await page.getByLabel(/^Photo/).setInputFiles({
    name: 'fridge.png',
    mimeType: 'image/png',
    buffer: RED_SQUARE,
  });
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  const photo = page.getByRole('img', { name: 'Fridge, Kitchen' });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Share the inventory with Aoife' }).click();
  await expect(page.getByText('Waiting for them to confirm it.')).toBeVisible();

  const aoife = await onPhone(browser, offerLink);
  const tenant = aoife.page;
  // UX-RN-24: the PPS number is asked once. "Skip" is an answer: it isn't asked again.
  await expect(tenant.getByRole('heading', { name: 'Your PPS number' })).toBeVisible();
  await tenant.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(tenant.getByText('Your move-in inventory is ready to check.')).toBeVisible();
  await expect(tenant.getByText(/PPS/)).toHaveCount(0);
  // UX-RN-26: she has moved in, so signing and paying are closed on her page too.
  await expect(steps(tenant)).toHaveText([
    /Sign your agreement.*Done/,
    /Pay.*Done/,
    /inventory.*Next/,
  ]);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-inventory' });
  await tenant.getByRole('link', { name: 'Check the inventory' }).click();

  // UX-RN-25: room by room, with the photos.
  await expect(tenant.getByRole('heading', { name: 'Your move-in inventory' })).toBeVisible();
  await expect(tenant.getByRole('heading', { level: 3, name: 'Kitchen' })).toBeVisible();
  await expect(tenant.getByRole('img', { name: 'Fridge, Kitchen' })).toBeVisible();
  await expectAccessible(tenant);
  await expectNoSidewaysScroll(tenant);
  await screenshot(tenant, '46-tenant-inventory');
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-inventory' });
  // "Something's not right" opens a short note to the lister about that item.
  await tenant.getByRole('button', { name: 'Something’s not right: Fridge' }).click();
  const note = tenant.getByRole('dialog', { name: 'What’s not right with the fridge?' });
  await note.getByLabel('A short note').fill('The freezer door doesn’t close.');
  await note.getByRole('button', { name: 'Send to Halcyon Lettings' }).click();
  await expect(note).toBeHidden();
  await expect(tenant.getByText('The freezer door doesn’t close.')).toBeVisible();
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-inventory-note' });
  await tenant.getByRole('button', { name: 'This is a fair record' }).click();
  await expect(tenant.getByRole('heading', { name: 'You’ve confirmed it' })).toBeVisible();
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-inventory-confirmed' });
  await tenant.getByRole('link', { name: 'Back to your tenancy' }).click();
  await expect(tenant.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await expect(steps(tenant)).toHaveText([
    /Sign your agreement.*Done/,
    /Pay.*Done/,
    /inventory.*Done/,
  ]);
  await expectRenterPageAtBothWidths(tenant, { shots: 'wp12-live-tenancy-moved-in' });
  await aoife.context.close();

  await page.reload();
  await expect(page.getByText(/Aoife confirmed it’s a fair record/)).toBeVisible();
  // The lister sees what she said about the fridge, beside the item.
  await expect(page.getByText('The tenant says something’s not right')).toBeVisible();
  await expect(page.getByText('The freezer door doesn’t close.')).toBeVisible();
  await expectAccessible(page);
});

test('R26: the operator finishes the let home; the record is archived and the dashboard shows days to let', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);
  await page.goto('/settings');
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/today');
  await page
    .getByRole('link', {
      name: /Ask for the deposit and first month’s rent · 12 Ranelagh Road/,
    })
    .click();
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('You can finish once')).toHaveCount(0);
  await expect(page.getByText('Not registered with the RTB yet')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Finish and close the letting' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  await expect(page.getByText('Step 9 of 9 · Close')).toBeVisible();

  // UX-HM-9: what the letting took is shown under the closed home in Lettings, not on Today.
  await page.goto('/lettings');
  await expect(
    page.getByRole('list', { name: 'Let', exact: true }).getByText(/^Let in 0 days/),
  ).toBeVisible();
  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByText('Letting finished and archived')).toBeVisible();
});

test('Testing tool: start the viewings now, only where dev tools are on', async ({ page }) => {
  await signUpOperator(page);
  await createLettingThroughUi(page);
  const lettingUrl = page
    .url()
    .replace(/\/viewings.*$/, '')
    .replace(/\?.*$/, '');
  await page.goto(`${lettingUrl}/attendance`);
  await expect(page.getByRole('heading', { name: 'Testing only' })).toBeVisible();
  // Wait for the action itself, not just the click, before looking elsewhere.
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/attendance'),
    ),
    page.getByRole('button', { name: 'Start the viewings now' }).click(),
  ]);
  // The viewing times are now today's, in Ireland.
  const today = new Intl.DateTimeFormat('en-IE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Dublin',
  })
    .format(new Date())
    .replace(',', '');
  await page.goto(lettingUrl);
  await expect(page.getByRole('region', { name: 'Viewing times' })).toContainText(today);
});

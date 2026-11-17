import { expect, test, type Page } from '@playwright/test';
import { rentDueDay, rtbDeadline } from '../../src/domain/tenancy/tenancy';
import { formatDate } from '../../src/lib/format';
import { AOIFE, anAcceptedOffer, expectOverview, onPhone } from './journeys';
import { enterLinkCode, expectFramePageAtBothWidths, expectRenterPageAtBothWidths } from './renter';
import {
  AVAILABLE_IN_DAYS,
  confirmItsYou,
  expectControlSizes,
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
  // UX-TN-1: the Tenancy page lists the six steps; the one to do now is its one button.
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'The tenancy, step by step' })).toBeVisible();
  await expect(tenancySteps(page)).toHaveText([
    /Send the agreement\s*Next/,
    /Sign the agreement\s*To come/,
    /Ask for the deposit and first month’s rent\s*To come/,
    /Mark the payment received\s*To come/,
    /Register with the RTB\s*To come/,
    /Hand over the keys\s*To come/,
  ]);
  await atBothWidths(page, 'ux-tn-1-tenancy');
  await page.getByRole('link', { name: 'Send the agreement', exact: true }).click();
  // The agreement must name the landlord: the first time, this agency is asked for the owner.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Who owns 12 Ranelagh Road?' }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-owner');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter the owner’s name.')).toBeVisible();
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Send the agreement to Aoife' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the agreement' })).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-send');
  await page.getByRole('button', { name: 'Send to Aoife to sign' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sent to Aoife' })).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-sent');
  // While it's with the tenant, signing is their turn, on both pages (UX-RN-26).
  await page.goto(`${lettingUrl}/tenancy/sign`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Waiting for Aoife to sign' }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-sign-waiting');

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

  await page.goto(`${lettingUrl}/tenancy`);
  await expect(tenancySteps(page).nth(1)).toHaveText(/Sign the agreement\s*Next/);
  await page.getByRole('link', { name: 'Sign the agreement', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign the agreement' })).toBeVisible();
  await expect(page.getByText(/^Aoife signed on /)).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-sign');
  await page.getByLabel('Type your full name to sign').fill('Ann Power');
  await page.getByLabel(/I agree to sign this agreement electronically, for the landlord/).check();
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signed by both sides' })).toBeVisible();

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

/** UX-TN-1: the operator's six steps, as the letting's Tenancy page lists them. */
const tenancySteps = (page: Page) =>
  page.getByRole('list', { name: 'The tenancy, step by step' }).getByRole('listitem');

/** Every new screen is checked and kept at a phone's width and a laptop's (rule 3). */
async function atBothWidths(page: Page, name: string) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await expectControlSizes(page);
    await screenshot(page, `${name}-${width}`);
  }
}

/** UX-RN-26: the tenant's three steps, as their page lists them. */
const steps = (tenant: Page) =>
  tenant.getByRole('list', { name: 'Your tenancy, step by step' }).getByRole('listitem');

/**
 * UX-TN-2: the first payment request asks where tenants pay (which asks who's there first) and
 * a number to ring, then is ready to send.
 */
async function toThePaymentRequest(page: Page, lettingUrl: string) {
  await page.goto(`${lettingUrl}/tenancy/payment`);
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await confirmItsYou(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A number Aoife can ring' }),
  ).toBeVisible();
  await page.getByLabel('Phone number').fill('01 234 5678');
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Ask Aoife for the deposit and first month’s rent',
    }),
  ).toBeVisible();
}

/** Asked for and received: steps 3 and 4. */
async function paidInFull(page: Page, lettingUrl: string) {
  await toThePaymentRequest(page, lettingUrl);
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asked Aoife to pay' })).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/received`);
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();
}

/** Stage 8 by the quick route: the owner added, and the agreement signed on paper. */
async function signedOnPaper(page: Page, lettingUrl: string) {
  await page.goto(`${lettingUrl}/tenancy/send`);
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByText('We signed on paper').click();
  await page.getByRole('button', { name: 'Both sides have signed on paper' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signed on paper' })).toBeVisible();
}

test('R23: the tenant is asked for the deposit and first month’s rent, paid to the operator’s own account', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, offerLink } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);
  // UX-TN-2: where tenants pay isn't in set-up or Settings yet: it's asked at this step.
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /^Where tenants pay/ })).toHaveCount(0);
  await page.goto(`${lettingUrl}/tenancy`);
  await page
    .getByRole('link', { name: 'Ask for the deposit and first month’s rent', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Where does Aoife pay?' }),
  ).toBeVisible();
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 79');
  await page.getByRole('button', { name: 'Save the account' }).click();
  await expect(
    page.getByText('That IBAN doesn’t look right. Check it against your bank’s details.'),
  ).toBeVisible();
  await expect(page.getByLabel('IBAN')).toBeFocused();
  await expect(page.getByLabel('Name on the account')).toHaveValue(
    'Halcyon Lettings client account',
  );
  await atBothWidths(page, 'ux-tn-2-account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await page.getByRole('button', { name: 'Save the account' }).click();
  // UX-SI-10, UX-TS-6: where money goes is saved only once they've confirmed it's them.
  await expect(page.getByRole('dialog', { name: 'Confirm it’s you' })).toBeVisible();
  await confirmItsYou(page);
  // UX-RN-23: a number the tenant can ring, asked here because there isn't one yet.
  await expect(
    page.getByRole('heading', { level: 1, name: 'A number Aoife can ring' }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-2-phone');
  await page.getByLabel('Phone number').fill('01 234 5678');
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Ask Aoife for the deposit and first month’s rent',
    }),
  ).toBeVisible();
  await expect(page.getByText('€3,700', { exact: true })).toBeVisible();
  await expect(page.getByText(/^GAFF-/)).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-request');
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asked Aoife to pay' })).toBeVisible();
  await expect(page.getByText(/with the reference GAFF-/)).toBeVisible();
  // Remembered: Settings has it now, and changing it there still asks who's there (UX-SI-10).
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /^Where tenants pay/ })).toContainText(
    'Halcyon Lettings client account',
  );

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
  // UX-RN-23, UX-TS-6 (rule 5): ring and check the details before paying, on the number the
  // lister gave at the payment step.
  const ring = tenant.locator('[data-notice="ring"]');
  await expect(ring).toContainText('Ring to check these details');
  await expect(ring).toContainText(
    'Before you pay, ring Halcyon Lettings on 01 234 5678 and check the IBAN with them.',
  );
  // Rules 4 and 5: the deposit and first month's rent, to the lister's own account, and no fee.
  expect(await tenant.getByRole('main').innerText()).not.toMatch(/fee|pay gaff|card number/i);
  // UX-RN-24: the PPS number isn't a card under the payment details.
  await expect(tenant.getByText(/PPS/)).toHaveCount(0);
  await expectAccessible(tenant);
  await screenshot(tenant, '44-tenant-payment');
  await expectRenterPageAtBothWidths(tenant, { notices: ['ring'], shots: 'wp12-live-pay' });

  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Mark the payment received', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Has Aoife’s payment arrived?' }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-received');
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
  await paidInFull(page, lettingUrl);

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

  // UX-TN-3: everything the RTB's form asks, label and value, each with a copy button.
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Register with the RTB', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Register with the RTB' }),
  ).toBeVisible();
  await expect(page.getByText(`Register by ${formatDate(rtbDeadline(startDate))}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy tenant’s email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy home' })).toBeVisible();
  expect(await page.getByRole('button', { name: /^Copy / }).count()).toBeGreaterThan(8);
  // The PPS number is hidden, and not in the page at all, until "Show" is pressed (rule 2).
  expect(await page.content()).not.toContain('1234567T');
  await expect(page.getByText('Hidden', { exact: true })).toBeVisible();
  // Rule 3: no date of birth is asked for or shown.
  expect(await page.getByRole('main').innerText()).not.toMatch(/date of birth/i);
  const site = page.getByRole('link', { name: /Open the RTB’s website/ });
  await expect(site).toHaveAttribute('target', '_blank');
  await atBothWidths(page, 'ux-tn-3-rtb');
  await screenshot(page, '45-rtb-pack');
  await page.getByRole('button', { name: 'Show the tenant’s PPS number' }).click();
  await expect(page.getByText('1234567T')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy the tenant’s PPS number' })).toBeVisible();
  await atBothWidths(page, 'ux-tn-3-rtb-shown');
  // A way back to the letting.
  await page.getByRole('link', { name: 'Back to the letting' }).last().click();
  await expect(page).toHaveURL(new RegExp(`${lettingUrl}$`));
  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await expect(page.getByText('1234567T')).toHaveCount(0);

  await page.goto(`${lettingUrl}/tenancy/rent-pack`);
  await expect(
    page.getByRole('heading', { name: 'Rent-setting pack: 12 Ranelagh Road' }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await page.getByLabel('RTB registration number').fill('RT0012345');
  await page.getByRole('button', { name: 'I’ve registered it' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Registered with the RTB' }),
  ).toBeVisible();
  await expect(
    page.getByText(/number RT0012345\. The tenant’s PPS number is deleted\./),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-3-registered');
  // Deleted once registered: nothing to show.
  await expect(page.getByRole('button', { name: /Show/ })).toHaveCount(0);
  expect(await page.content()).not.toContain('1234567T');
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
  await page.getByRole('link', { name: /^Hand over the keys/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hand over the keys' })).toBeVisible();
  await page.getByLabel('Keys handed over').check();
  await page.getByLabel('Electricity meter reading').fill('012345');
  await atBothWidths(page, 'ux-tn-1-move-in');
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  await expect(page.getByLabel('Keys handed over')).toBeChecked();
  await expect(page.getByLabel('Electricity meter reading')).toHaveValue('012345');

  // UX-TN-4: the inventory one item at a time: room, item, condition as three taps, a note, a photo.
  await page.getByRole('link', { name: 'Add an item' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add to the inventory' })).toBeVisible();
  const condition = page.getByRole('group', { name: 'Condition' });
  await expect(condition.getByRole('radio')).toHaveCount(3);
  await expect(condition.getByRole('radio', { name: 'Good' })).toBeVisible();
  await expect(condition.getByRole('radio', { name: 'Fair' })).toBeVisible();
  await expect(condition.getByRole('radio', { name: 'Poor' })).toBeVisible();
  await atBothWidths(page, 'ux-tn-4-item');
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText('Enter the room.')).toBeVisible();
  await expect(page.getByText('Choose its condition: good, fair or poor.')).toBeVisible();
  await expect(page.getByLabel('Room')).toBeFocused();
  await page.getByLabel('Room').fill('Kitchen');
  await page.getByLabel('Item', { exact: true }).fill('Fridge');
  await condition.getByRole('radio', { name: 'Good' }).check();
  await page.getByLabel(/^Photo/).setInputFiles({
    name: 'fridge.png',
    mimeType: 'image/png',
    buffer: RED_SQUARE,
  });
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText(/Added Fridge, Kitchen\. 1 item so far\./)).toBeVisible();
  // The next item starts in the same room, with nothing else filled in.
  await expect(page.getByLabel('Room')).toHaveValue('Kitchen');
  await expect(page.getByLabel('Item', { exact: true })).toHaveValue('');
  await atBothWidths(page, 'ux-tn-4-item-added');
  await page.getByLabel('Item', { exact: true }).fill('Oven');
  await condition.getByRole('radio', { name: 'Poor' }).check();
  await page.getByLabel('Note').fill('Door seal perished.');
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText(/Added Oven, Kitchen\. 2 items so far\./)).toBeVisible();
  await page.getByRole('link', { name: 'Done', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Hand over the keys' })).toBeVisible();
  const photo = page.getByRole('img', { name: 'Fridge, Kitchen' });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // Poor is said in words, with the warning tint: never colour alone.
  await expect(page.getByText('Poor', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Remove\W*Oven$/ }).click();
  await expect(page.getByText('Kitchen: Oven')).toHaveCount(0);
  await atBothWidths(page, 'ux-tn-1-move-in-inventory');
  await page.getByRole('button', { name: 'Save and share with Aoife' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Keys handed over' })).toBeVisible();
  await expect(page.getByText(/Gaff tells you when it’s confirmed as a fair record/)).toBeVisible();
  await atBothWidths(page, 'ux-tn-1-handed-over');

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

  await page.goto(`${lettingUrl}/tenancy/move-in`);
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
  // The agent shares the letting with its owner (UX-OW-1), whose details Gaff already has.
  await page.goto(`${lettingUrl}/owner`);
  await expect(page.getByLabel('Owner’s email')).toHaveValue('tom.walsh@example.ie');
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  await toThePaymentRequest(page, lettingUrl);

  // Today opens each tenancy step's own screen (UX-TN-1).
  await page.goto('/today');
  await page
    .getByRole('link', {
      name: /Ask for the deposit and first month’s rent · 12 Ranelagh Road/,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`${lettingUrl}/tenancy/payment$`));
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await page.goto('/today');
  await page
    .getByRole('link', { name: /Check the payment has arrived · 12 Ranelagh Road/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`${lettingUrl}/tenancy/received$`));
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();

  // UX-TN-5: "Finish this letting": what's done, and what's still open.
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Finish this letting', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finish this letting' })).toBeVisible();
  await expect(page.getByText(/Register first if you can/)).toBeVisible();
  await expect(page.getByText('Still open').first()).toBeVisible();
  await atBothWidths(page, 'ux-tn-5-finish');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();

  // UX-TN-7: the usual wasn't set in onboarding, so it's asked now, as two tap questions.
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Before Gaff, how long did a letting usually take?',
    }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-7-usual-days');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Choose about how long a letting usually takes you.')).toBeVisible();
  await page.getByText('About a month', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'And how many hours of your own time?' }),
  ).toBeVisible();
  await atBothWidths(page, 'ux-tn-7-usual-hours');
  await page.getByText('About 10 hours', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // UX-TN-5, UX-TN-6: the results: days to let against the usual, the time saved, and one action.
  await expect(
    page.getByRole('heading', { level: 1, name: '12 Ranelagh Road is let' }),
  ).toBeVisible();
  await expect(page.locator('[data-results="days"]')).toHaveText(
    '0 days from first enquiry. You usually take 30.',
  );
  await expect(page.locator('[data-results="time"]')).toHaveText(
    /^About (9\.5|10) hours of your time saved\.$/,
  );
  // The owner hasn't seen the summary since it was let, so that's the one thing offered.
  const footer = page.locator('[data-flow-footer]');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link', { name: 'Send Tom the summary' })).toBeVisible();
  await atBothWidths(page, 'ux-tn-5-let');
  // UX-LP-1: stage 9, finished: nothing needs you, with how long it took and what it saved.
  await page.goto(lettingUrl);
  await expectOverview(page, {
    says: 'This letting is closed.',
    figures: ['Days to let', 'Time saved'],
    next: /Gaff deletes other applicants’ details on|Renters’ details have been deleted/,
  });
  await expect(page.getByRole('link', { name: 'See how it went' })).toBeVisible();

  // UX-HM-9: what the letting took is shown under the closed home in Lettings, not on Today.
  await page.goto('/lettings');
  await expect(
    page.getByRole('list', { name: 'Let', exact: true }).getByText(/^Let in 0 days/),
  ).toBeVisible();
  await page.goto(`${lettingUrl}/history`);
  await expect(page.getByText('Letting finished and archived')).toBeVisible();

  // UX-OP-5: once it's let, the owner's page is a one-screen summary.
  let ownerLink = '';
  await expect(async () => {
    ownerLink = await linkInEmail('tom.walsh@example.ie', '12 Ranelagh Road: follow the letting');
  }).toPass({ timeout: 20_000 });
  const tom = await onPhone(browser, ownerLink);
  await expect(tom.page.locator('[data-owner="standing"]')).toHaveText('The home is let.');
  await expect(tom.page.locator('[data-owner="summary"]')).toContainText('€1,850 a month');
  expect(await tom.page.content()).not.toMatch(/Aoife|Byrne|aoife\.byrne/i);
  await expectFramePageAtBothWidths(tom.page, 'owner', 'wp13-owner-summary');
  await tom.context.close();
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
  await page.goto(`${lettingUrl}?view=home`);
  await expect(page.getByRole('region', { name: 'Viewing times' })).toContainText(today);
});

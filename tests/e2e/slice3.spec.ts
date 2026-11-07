import { expect, test, type Page } from '@playwright/test';
import { AOIFE, anAcceptedOffer, onPhone } from './journeys';
import {
  AVAILABLE_IN_DAYS,
  createLettingThroughUi,
  inDays,
  expectAccessible,
  expectNoSidewaysScroll,
  linkInEmail,
  screenshot,
  signUpOperator,
} from './support';

/** The tenancy starts on the letting's available date; these are worked out from it. */
const tenancyStart = new Date(`${inDays(AVAILABLE_IN_DAYS)}T12:00:00Z`);

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

/** The RTB deadline: one month from the start, written as "Thursday 7 January 2027". */
function rtbDeadline(): string {
  const deadline = new Date(tenancyStart);
  deadline.setUTCMonth(deadline.getUTCMonth() + 1);
  return deadline
    .toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Dublin',
    })
    .replace(',', '');
}

test('R22: the tenant reads and signs the agreement on their phone, then the operator signs for the landlord', async ({
  browser,
  page,
}) => {
  test.slow();
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
  await expect(
    tenant.getByText(
      `€1,850 a month, paid in advance on the ${ordinal(tenancyStart.getUTCDate())} day`,
      { exact: false },
    ),
  ).toBeVisible();
  await expectAccessible(tenant);
  await expectNoSidewaysScroll(tenant);
  await screenshot(tenant, '43-tenant-agreement');
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrnes');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(
    tenant.getByText('Type your name as it is on the agreement: Aoife Byrne.'),
  ).toBeVisible();
  await tenant.getByLabel('Type your full name to sign').fill('Aoife Byrne');
  await tenant.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  await tenant.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(tenant.getByText('Thanks, you’ve signed')).toBeVisible();

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
  await aoife.context.close();
});

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
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByText(/with the reference GAFF-/)).toBeVisible();

  const aoife = await onPhone(browser, offerLink);
  await expect(
    aoife.page.getByRole('heading', { name: 'Pay the deposit and first month’s rent' }),
  ).toBeVisible();
  await expect(aoife.page.getByText('IE29 AIBK 9311 5212 3456 78')).toBeVisible();
  await expect(aoife.page.getByText('€3,700')).toBeVisible();
  await expect(aoife.page.getByText('Check the bank details by phone first')).toBeVisible();
  await expectAccessible(aoife.page);
  await screenshot(aoife.page, '44-tenant-payment');

  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();
  await aoife.page.reload();
  await expect(aoife.page.getByText('Payment received')).toBeVisible();
  await aoife.context.close();
});

test('R24: the rent-setting and RTB packs; the tenant’s PPS number is optional and deleted once registered', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, offerLink } = await anAcceptedOffer(browser, page);
  await signedOnPaper(page, lettingUrl);

  const aoife = await onPhone(browser, offerLink);
  await expect(
    aoife.page.getByRole('heading', { name: 'Your PPS number, for the RTB' }),
  ).toBeVisible();
  await aoife.page.getByLabel('PPS number').fill('1234567A');
  await aoife.page.getByRole('button', { name: 'Give my PPS number' }).click();
  await expect(
    aoife.page.getByText('That PPS number doesn’t look right. Check it, or leave it blank.'),
  ).toBeVisible();
  await aoife.page.getByLabel('PPS number').fill('1234567T');
  await aoife.page.getByRole('button', { name: 'Give my PPS number' }).click();
  await expect(aoife.page.getByText('You’ve given your PPS number. Thank you.')).toBeVisible();
  await expectAccessible(aoife.page);
  await aoife.context.close();

  await page.goto(`${lettingUrl}/tenancy/rtb-pack`);
  await expect(
    page.getByRole('heading', { name: 'RTB registration pack: 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(page.getByText('1234567T')).toBeVisible();
  await expect(page.getByText(`Register by ${rtbDeadline()}`, { exact: false })).toBeVisible();
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
  await expect(aoife.page.getByRole('heading', { name: 'Your move-in inventory' })).toBeVisible();
  await expect(aoife.page.getByRole('img', { name: 'Fridge, Kitchen' })).toBeVisible();
  await expectAccessible(aoife.page);
  await expectNoSidewaysScroll(aoife.page);
  await screenshot(aoife.page, '46-tenant-inventory');
  await aoife.page.getByRole('button', { name: 'This is a fair record' }).click();
  await expect(aoife.page.getByText('You’ve confirmed it')).toBeVisible();
  await aoife.context.close();

  await page.reload();
  await expect(page.getByText(/Aoife confirmed it’s a fair record/)).toBeVisible();
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
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/');
  await page
    .getByRole('link', { name: '12 Ranelagh Road: ask for the deposit and first month’s rent' })
    .click();
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('You can finish once')).toHaveCount(0);
  await expect(page.getByText('Not registered with the RTB yet')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Finish and close the letting' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  await expect(page.getByText('Step 9 of 9 · Close')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText(/let in 0 days/)).toBeVisible();
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

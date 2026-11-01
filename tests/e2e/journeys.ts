import { devices, expect, type Browser, type Page } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  sendTestEmail,
  signUpOperator,
  startViewingsNow,
} from './support';

/** Shared journeys through the real screens, for the Slice 2 and Slice 3 tests. */
export const AOIFE = 'aoife.byrne@example.ie';
export const CIARAN = 'ciaran.os@example.ie';

export async function onPhone(browser: Browser, link: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const page = await context.newPage();
  await page.goto(link);
  return { context, page };
}

/**
 * Stages 1 to 4 through the real screens: two renters enquire, both are invited, both book,
 * the viewings start, and the operator marks both as having come.
 */
export async function twoPeopleWhoCame(browser: Browser, page: Page) {
  const operator = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });
  await sendTestEmail(page, { to, ...myhomeEnquiry, replyTo: '' });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Ciarán Ó Súilleabháin')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel('Invite Ciarán Ó Súilleabháin').check();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('2 invited to book a viewing')).toBeVisible();

  const links: Record<string, string> = {};
  for (const email of [AOIFE, CIARAN]) {
    await expect(async () => {
      links[email] = await linkInEmail(email, 'Book a viewing: 12 Ranelagh Road');
    }).toPass({ timeout: 20_000 });
    const renter = await onPhone(browser, links[email]!);
    await renter.page.getByRole('radio').first().check();
    await renter.page.getByRole('button', { name: 'Book this time' }).click();
    await expect(renter.page.getByText('You’re booked')).toBeVisible();
    await renter.context.close();
  }

  await startViewingsNow('12 Ranelagh Road', operator);
  await page.goto(`${lettingUrl}/attendance`);
  for (const name of ['Aoife Byrne', 'Ciarán Ó Súilleabháin']) {
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  return { operator, lettingUrl, links };
}

export async function applyOnPhone(browser: Browser, link: string, income: string) {
  const renter = await onPhone(browser, link);
  await renter.page.getByLabel('From a job').check();
  await renter.page.getByLabel('Your household’s take-home income each month').fill(income);
  await renter.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(renter.page.getByText('Your application is with')).toBeVisible();
  await renter.context.close();
}

/** Both apply; the operator chooses Aoife as preferred and Ciarán as backup. */
export async function twoChosen(browser: Browser, page: Page) {
  const setup = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, setup.links[AOIFE]!, '5,200');
  await applyOnPhone(browser, setup.links[CIARAN]!, '4,800');
  await page.goto(`${setup.lettingUrl}/applications`);
  await page.getByLabel('Preferred: Aoife Byrne').check();
  await page.getByLabel('Backup: Ciarán Ó Súilleabháin').check();
  await page.getByRole('button', { name: 'Confirm my choice' }).click();
  await expect(page.getByText('Choice saved')).toBeVisible();
  return setup;
}

/**
 * Through stage 7: the operator offers Aoife the home, confirming the landlord's approval
 * themselves (no landlord email, Q22), and Aoife accepts on her phone.
 */
export async function anAcceptedOffer(browser: Browser, page: Page) {
  const setup = await twoChosen(browser, page);
  await page.goto(`${setup.lettingUrl}/applications`);
  await page.getByLabel(/The landlord has approved Aoife Byrne/).check();
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(page.getByText('Offer sent.')).toBeVisible();
  let offerLink = '';
  await expect(async () => {
    offerLink = await linkInEmail(AOIFE, 'An offer: 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });
  const aoife = await onPhone(browser, offerLink);
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    aoife.page.getByText('You’ve accepted the offer, and your tenancy starts on'),
  ).toBeVisible();
  await aoife.context.close();
  return { ...setup, offerLink };
}

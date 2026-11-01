import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  startViewingsNow,
} from './support';

const AOIFE = 'aoife.byrne@example.ie';
const CIARAN = 'ciaran.os@example.ie';

async function onPhone(browser: Browser, link: string) {
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
async function twoPeopleWhoCame(browser: Browser, page: Page) {
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

test('R16: someone who came applies on their phone, with two questions and no documents', async ({
  browser,
  page,
}) => {
  test.slow();
  const { links } = await twoPeopleWhoCame(browser, page);
  const aoife = await onPhone(browser, links[AOIFE]!);
  await expect(
    aoife.page.getByRole('heading', { name: 'Apply for 12 Ranelagh Road' }),
  ).toBeVisible();
  await expect(aoife.page.getByText('Aoife Byrne', { exact: true })).toBeVisible();
  await expect(
    aoife.page.getByText(/looks for at least 2\.5 times the rent: €4,625 a month/),
  ).toBeVisible();
  await expectAccessible(aoife.page);
  await expectNoSidewaysScroll(aoife.page);
  await screenshot(aoife.page, '35-renter-apply');

  await aoife.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(aoife.page.getByText('Choose how you earn most of your income.')).toBeVisible();
  await aoife.page.getByLabel('From a job').check();
  await aoife.page.getByLabel('Your household’s take-home income each month').fill('5,200');
  await aoife.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(aoife.page.getByText('Thanks, Aoife')).toBeVisible();
  await expect(aoife.page.getByText('we’ll email you either way')).toBeVisible();
  await expectAccessible(aoife.page);
  await aoife.context.close();
});

async function applyOnPhone(browser: Browser, link: string, income: string) {
  const renter = await onPhone(browser, link);
  await renter.page.getByLabel('From a job').check();
  await renter.page.getByLabel('Your household’s take-home income each month').fill(income);
  await renter.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(renter.page.getByText('Your application is with')).toBeVisible();
  await renter.context.close();
}

test('R17: the operator compares applicants side by side and chooses a preferred applicant and a backup', async ({
  browser,
  page,
}) => {
  test.slow();
  const { lettingUrl, links } = await twoPeopleWhoCame(browser, page);
  await applyOnPhone(browser, links[AOIFE]!, '5,200');
  await applyOnPhone(browser, links[CIARAN]!, '4,000');

  await page.goto('/');
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

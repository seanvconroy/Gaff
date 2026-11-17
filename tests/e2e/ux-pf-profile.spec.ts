import { devices, expect, test, type Page } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import { bookFirstTime, expectReadable } from './renter';
import {
  confirmItsYou,
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  latestCodeFor,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  signUpRenter,
  startViewingsNow,
  uniqueEmail,
} from './support';

/**
 * Work package WP-14: Profile and the renter's home (UX-RH-1 to UX-RH-6, UX-PF-1 to UX-PF-7).
 * A renter keeps their details on one home and applies to a second by confirming, not retyping;
 * Enquiries lists both; Profile is edited, downloaded and deleted. Screenshots are
 * screenshots/wp14-<screen>-<width>.png.
 */

const WIDTHS = [390, 1280] as const;

/** A Daft enquiry from a made-up renter about one of the operator's homes. */
function enquiryFrom(email: string, name: string, address: string) {
  const swap = (text: string) =>
    text
      .replaceAll('aoife.byrne@example.ie', email)
      .replaceAll('Aoife Byrne', name)
      .replaceAll('Aoife', name.split(' ')[0]!)
      .replaceAll('12 Ranelagh Road', address)
      .replaceAll('12-ranelagh-road', address.toLowerCase().replaceAll(' ', '-'))
      .replaceAll('123456', address.startsWith('12') ? '123456' : '123457');
  return {
    from: daftEnquiry.from,
    replyTo: swap(daftEnquiry.replyTo),
    subject: swap(daftEnquiry.subject),
    text: swap(daftEnquiry.text),
  };
}

async function atBothWidths(page: Page, name: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expectAccessible(page);
    await screenshot(page, `wp14-${name}-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('UX-RN-13, UX-PF-1 to UX-PF-3, UX-PF-5, UX-RH-1, UX-RH-3, UX-RH-4: a renter keeps their details on one home, then applies to a second by confirming, not retyping', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000);
  const homes = ['12 Ranelagh Road', '14 Ranelagh Road'] as const;
  const renter = uniqueEmail('niamh');
  const name = 'Niamh Walsh';

  // An agency with two homes live, and one renter enquiring about both on Daft.
  const operator = await signUpOperator(page);
  const lettings: string[] = [];
  for (const home of homes) {
    await createLettingThroughUi(page, home);
    await goLiveThroughUi(page);
    lettings.push(page.url().replace(/\?.*$/, ''));
  }
  const to = await gaffAddress(page);
  for (const home of homes) await sendTestEmail(page, { to, ...enquiryFrom(renter, name, home) });
  for (const letting of lettings) {
    await expect(async () => {
      await page.goto(`${letting}/shortlist`);
      await expect(page.getByLabel(`Invite ${name}`)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await page.getByLabel(`Invite ${name}`).check();
    await page.getByRole('button', { name: 'Send invitations' }).click();
    await expect(page.getByText(/invited to book a viewing/)).toBeVisible();
  }

  // The renter, on their phone, signed out: books both viewings from the emails' links.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renterPage = await phone.newPage();
  const links: string[] = [];
  for (const home of homes) {
    let link = '';
    await expect(async () => {
      link = await linkInEmail(renter, `Book a viewing: ${home}`);
    }).toPass({ timeout: 20_000 });
    links.push(link);
    await renterPage.goto(link);
    await bookFirstTime(renterPage);
  }
  for (const [index, home] of homes.entries()) {
    await startViewingsNow(home, operator);
    await page.goto(`${lettings[index]}/attendance`);
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  // The first home: she applies, and ticks "Keep my details for next time" (off by default).
  await renterPage.goto(links[0]!);
  await renterPage.getByRole('link', { name: 'Apply', exact: true }).click();
  await renterPage.getByRole('radio', { name: 'From a job', exact: true }).check();
  await renterPage.getByRole('button', { name: 'Next', exact: true }).click();
  await renterPage.getByLabel('Take-home income each month').fill('4,600');
  await renterPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(renterPage.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  const keep = renterPage.getByRole('checkbox', { name: 'Keep my details for next time' });
  await expect(keep).not.toBeChecked();
  await keep.check();
  await renterPage.getByRole('button', { name: 'Send my application' }).click();

  // The code goes to the address she's already confirmed; entering it sets up her profile.
  await expect(renterPage.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await renterPage.getByLabel('Six-digit code').fill(await latestCodeFor(renter));
  await expect(renterPage.getByText('Your details are kept for next time.')).toBeVisible();
  await expect(renterPage.getByRole('heading', { name: 'Your application is in' })).toBeVisible();
  await expectAccessible(renterPage);
  await expectReadable(renterPage);
  await screenshot(renterPage, 'wp14-details-kept-390');

  // The second home: signed in now, her income is offered back with its date, to confirm.
  await renterPage.goto(links[1]!);
  await renterPage.getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(renterPage.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await expect(renterPage.getByText(/Is this still right\? From your profile\./)).toBeVisible();
  await expect(renterPage.getByText('€4,600 a month')).toBeVisible();
  await expect(renterPage.getByText(/^You said so on /)).toBeVisible();
  await expect(renterPage.getByText(name, { exact: true })).toBeVisible();
  // No tick this time: her profile keeps what she enters, and the page says so once.
  await expect(renterPage.getByRole('checkbox')).toHaveCount(0);
  await expect(renterPage.getByText('These are kept on your profile for next time.')).toBeVisible();
  await expectAccessible(renterPage);
  await expectReadable(renterPage);
  await screenshot(renterPage, 'wp14-apply-confirm-390');
  await renterPage.getByRole('button', { name: 'Send my application' }).click();
  await expect(renterPage.getByRole('heading', { name: 'Your application is in' })).toBeVisible();

  // Rule 2: the operator sees what she sent, at the stage that asks for it.
  await page.goto(`${lettings[1]}/applications`);
  await expect(page.getByText(name).first()).toBeVisible();

  // UX-RH-1, UX-RH-4: both homes are in her Enquiries, each with where she stands.
  await renterPage.goto('/enquiries');
  await expect(renterPage.getByRole('heading', { level: 1, name: 'Enquiries' })).toBeVisible();
  for (const home of homes) {
    await expect(renterPage.getByRole('link', { name: home })).toBeVisible();
  }
  await expect(renterPage.getByText(/^Application in\./)).toHaveCount(2);
  await atBothWidths(renterPage, 'enquiries');

  // UX-RH-3: a row opens that home's own page.
  await renterPage.getByRole('link', { name: homes[1] }).click();
  await expect(renterPage).toHaveURL(/\/r\/[A-Za-z0-9_-]+$/);
  await expect(renterPage.getByRole('heading', { name: 'Your application is in' })).toBeVisible();

  // Her profile holds the income she said, with its date, and nothing she didn't keep.
  await renterPage.goto('/profile');
  await expect(renterPage.getByText('€4,600 a month')).toBeVisible();
  await expect(renterPage.getByText('From a job')).toBeVisible();
  await phone.close();
});

test('UX-RH-1, UX-PF-1, UX-PF-2, UX-PF-4: a new renter’s Enquiries is empty, and Profile’s rows are each changed on their own', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await signUpRenter(page, 'Aoife Byrne');

  await page.goto('/enquiries');
  await expect(
    page.getByRole('heading', { name: 'Homes you ask to view appear here.' }),
  ).toBeVisible();
  await atBothWidths(page, 'enquiries-empty');

  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  for (const heading of [
    'Your details',
    'Your answers',
    'Work and income',
    'Sign-in',
    'Your data',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.getByText('Aoife Byrne', { exact: true })).toBeVisible();
  await atBothWidths(page, 'profile-empty');

  // UX-PF-4: no photo, no description, no free text anywhere.
  await expect(page.locator('input[type=file], textarea, img')).toHaveCount(0);

  // The mobile number: what's wrong is said at the field.
  await page.getByRole('button', { name: 'Add mobile' }).click();
  const mobile = page.getByRole('dialog', { name: 'Your mobile number' });
  await mobile.getByLabel('Mobile number').fill('not a number');
  await mobile.getByRole('button', { name: 'Save' }).click();
  await expect(mobile.getByText('Enter a mobile number, like 087 123 4567.')).toBeVisible();
  await mobile.getByLabel('Mobile number').fill('087 765 4321');
  await mobile.getByRole('button', { name: 'Save' }).click();
  await expect(mobile).toBeHidden();
  await expect(page.getByText('087 765 4321')).toBeVisible();

  // Your answers: the fixed four, any left blank.
  await page.getByRole('button', { name: 'Add your answers' }).click();
  const answers = page.getByRole('dialog', { name: 'Your answers' });
  await answers.getByLabel('How many people would live there, including you?').fill('2');
  await answers
    .getByRole('group', { name: 'Do you have any pets?' })
    .getByRole('radio', { name: 'No', exact: true })
    .check();
  await expectAccessible(page);
  await screenshot(page, 'wp14-profile-answers-sheet-390');
  await answers.getByRole('button', { name: 'Save' }).click();
  await expect(answers).toBeHidden();
  await expect(page.getByText('2 people')).toBeVisible();

  // Work and income: kept with today's date.
  await page.getByRole('button', { name: 'Add work and income' }).click();
  const income = page.getByRole('dialog', { name: 'Work and income' });
  await income.getByRole('radio', { name: 'Self-employed', exact: true }).check();
  await income.getByLabel('Take-home income').fill('3,900');
  await income.getByRole('button', { name: 'Save' }).click();
  await expect(income).toBeHidden();
  await expect(page.getByText('€3,900 a month')).toBeVisible();
  await expect(page.getByText(/^You said so on /)).toBeVisible();
  await atBothWidths(page, 'profile');

  // Remove: that part goes at once.
  await page.getByRole('button', { name: 'Remove mobile' }).click();
  await expect(page.getByText('087 765 4321')).toBeHidden();

  // Keeping can be switched off.
  const keeping = page.getByRole('checkbox', { name: 'Keep what I enter for next time' });
  await expect(keeping).toBeChecked();
  await keeping.uncheck();
  await expect(page.getByText('Nothing new will be kept.')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Keep what I enter for next time' }),
  ).not.toBeChecked();
});

test('UX-PF-6: “Download my details” holds what the profile keeps, and “Delete my profile” removes it at once', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const email = await signUpRenter(page, 'Aoife Byrne');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Add mobile' }).click();
  const mobile = page.getByRole('dialog', { name: 'Your mobile number' });
  await mobile.getByLabel('Mobile number').fill('087 765 4321');
  await mobile.getByRole('button', { name: 'Save' }).click();
  await expect(mobile).toBeHidden();

  // The file: everything on the profile, and nothing an operator holds.
  const download = await page.request.get('/profile/download');
  expect(download.headers()['content-disposition']).toContain('gaff-my-details.json');
  const file = (await download.json()) as Record<string, unknown>;
  expect(file.email).toBe(email);
  expect(file.name).toBe('Aoife Byrne');
  expect(file.mobile).toBe('087 765 4321');
  expect(JSON.stringify(file)).not.toMatch(/organisation|photo|hap/i);

  // Delete: one sheet saying what stays, "Confirm it's you", and it's gone.
  await page.getByRole('button', { name: 'Delete my profile' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your profile?' });
  await expect(
    sheet.getByText('Homes you’ve applied for keep your application until that letting ends.'),
  ).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'wp14-delete-sheet-390');
  await sheet.getByRole('button', { name: 'Delete my profile' }).click();
  await confirmItsYou(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your profile is deleted' }),
  ).toBeVisible();
  await atBothWidths(page, 'profile-deleted');

  // Gone at once: signed out, and the profile can't be opened.
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/sign-in/);
});

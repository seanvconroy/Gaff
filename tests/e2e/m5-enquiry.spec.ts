import { devices, expect, test } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  getChecked,
  goLiveThroughUi,
  latestCodeFor,
  screenshot,
  signUpLandlord,
} from './support';

const TITLE = '2 bed apartment in Terenure, Dublin 6W';
const DESCRIPTION =
  'A two-bedroom apartment on a quiet avenue off Terenure Road North, with a garden view, gas heating and a fitted kitchen.';

test('M76 to M83: a renter enquires on Gaff, follows the home, and can withdraw', async ({
  browser,
  page,
}) => {
  test.slow();
  // A checked landlord lists a home in Terenure.
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '9 Eaton Square', '', 'Terenure, Dublin 6W');
  const lettingUrl = page
    .url()
    .replace(/\/viewings.*$/, '')
    .replace(/\?.*$/, '');
  await goLiveThroughUi(page);
  await completeListing(page, DESCRIPTION);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();

  // A renter on a phone finds it, with no account yet.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto('/to-rent/dublin/terenure');
  await renter.getByRole('link', { name: TITLE }).click();
  await expect(renter.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(
    renter.getByText('Nobody will ask you for money before you sign a tenancy agreement.', {
      exact: false,
    }),
  ).toBeVisible();

  // M76: name and email, then a code, in the same sheet.
  await renter.getByRole('link', { name: 'Enquire about this home' }).click();
  const sheet = renter.locator('#enquire');
  const email = `aoife.${Date.now()}@example.ie`;
  await sheet.getByLabel('Your name').fill('Aoife Byrne');
  await sheet.getByLabel('Your email address').fill(email);
  await sheet.getByRole('button', { name: 'Email me a code' }).click();
  await expect(sheet.getByText(/We’ve emailed a 6-digit code/)).toBeVisible();
  await expectAccessible(renter);
  await sheet.getByLabel('The code from the email').fill('000000');
  await sheet.getByRole('button', { name: 'Confirm and continue' }).click();
  await expect(sheet.getByText(/That code isn’t right/)).toBeVisible();
  await sheet.getByLabel('The code from the email').fill(await latestCodeFor(email));
  await sheet.getByRole('button', { name: 'Confirm and continue' }).click();

  // Only the letter's own questions, a message, and their details filled in.
  await expect(sheet.getByRole('button', { name: 'Send my enquiry' })).toBeVisible();
  await expect(sheet.getByLabel('Your name')).toHaveValue('Aoife Byrne');
  await sheet
    .getByLabel('How many people would live in the home, including you?')
    .selectOption('2');
  await sheet.getByRole('group', { name: 'Do you have any pets?' }).getByLabel('No').check();
  await sheet.getByLabel(/A message to Mary/).fill('Is there a washing machine?');
  await expect(sheet.getByLabel(/Keep my details for next time/)).not.toBeChecked();
  await expectAccessible(renter);
  await expectNoSidewaysScroll(renter);
  await screenshot(renter, 'm5-enquiry-sheet');
  await sheet.getByRole('button', { name: 'Send my enquiry' }).click();

  // M77, M79, M80: the enquiry is in My homes, and the first reply arrives in Gaff.
  await expect(renter.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(renter.getByText('Your enquiry is sent')).toBeVisible();
  await expect(renter.getByRole('heading', { name: 'Enquiry sent' })).toBeVisible();
  const homeUrl = renter.url().replace(/\?.*$/, '');
  await expect(async () => {
    await renter.goto(homeUrl);
    await expect(renter.getByText('Mary’s AI assistant', { exact: false }).first()).toBeVisible();
  }).toPass({ timeout: 30_000 });
  await expect(renter.getByText(/Thanks for answering the questions/)).toBeVisible();
  // M38: the letter showed only the street, so the house number waits for an invitation.
  await expect(
    renter.getByText(/Thanks for your enquiry about Eaton Square, Terenure/),
  ).toBeVisible();
  await expect(renter.getByText(/9 Eaton Square/)).toHaveCount(0);
  await expectAccessible(renter);
  await screenshot(renter, 'm5-my-home');

  // M80: a message from Gaff joins the thread.
  await renter.getByLabel('Write to Mary').fill('Could I view on a Saturday?');
  await renter.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(renter.getByText('Your message is sent')).toBeVisible();
  await expect(renter.getByText('Could I view on a Saturday?')).toBeVisible();

  // M60: the listing says they enquired.
  await renter.goto('/my');
  await expect(renter.getByRole('link', { name: TITLE })).toBeVisible();
  await expectAccessible(renter);
  await renter.getByRole('link', { name: TITLE }).click();
  await renter.getByRole('link', { name: 'See the listing' }).click();
  await expect(renter.getByRole('heading', { name: 'You enquired' })).toBeVisible();

  // M12: who has their details, and until when.
  await renter.goto('/my/details');
  await expect(renter.getByRole('heading', { name: 'Mary' })).toBeVisible();
  await expect(
    renter.getByText('Your name, email address and mobile number, if you gave it'),
  ).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, 'm5-who-has-my-details');

  // M79: their page for the home (R9 onwards) opens from My homes.
  await renter.goto(homeUrl);
  await renter.getByRole('button', { name: 'Open your page for this home' }).click();
  await expect(renter).toHaveURL(/\/r\/[A-Za-z0-9_-]{43}$/);
  await expect(renter.getByRole('heading', { level: 1, name: 'Eaton Square' })).toBeVisible();
  await expect(renter.getByText(/9 Eaton Square/)).toHaveCount(0);

  // M83: the letter sees the enquiry in one list, labelled by source.
  await page.goto(`${lettingUrl}/enquiries`);
  const row = page.getByRole('row', { name: /Aoife Byrne/ });
  await expect(row.getByText('Gaff', { exact: true })).toBeVisible();
  await expect(row.getByText('Answered')).toBeVisible();

  // M81: the renter withdraws, and the letter sees it.
  await renter.goto(homeUrl);
  await renter.getByText('Withdraw my enquiry', { exact: true }).click();
  await renter.getByRole('button', { name: 'Yes, withdraw my enquiry' }).click();
  await expect(renter.getByRole('heading', { name: 'You withdrew your enquiry' })).toBeVisible();
  await expectAccessible(renter);
  await page.reload();
  await expect(page.getByRole('row', { name: /Aoife Byrne/ }).getByText('Withdrew')).toBeVisible();
  await phone.close();
});

import { devices, expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
  subjectsSentTo,
} from './support';

test('R26 (basic): a person closes the letting, everyone hears back, and renters see when their details go', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page, '9 Canal View');
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  await sendTestEmail(page, {
    to: await gaffAddress(page),
    ...daftEnquiry,
    subject: 'New enquiry: 9 Canal View',
    text: daftEnquiry.text.replaceAll('12 Ranelagh Road, Ranelagh, Dublin 6', '9 Canal View'),
  });
  let renterLink = '';
  await expect(async () => {
    renterLink = await linkInEmail('aoife.byrne@example.ie', 'Your enquiry about 9 Canal View');
  }).toPass({ timeout: 20_000 });

  await page.goto(lettingUrl);
  // A rare step that can't be undone, so it waits behind a summary line until it's wanted.
  await expect(page.getByRole('button', { name: 'Close the letting' })).toBeHidden();
  await page.getByText('Close this letting').click();
  await page.getByRole('button', { name: 'Close the letting' }).click();
  await expect(page.getByText('Choose whether the home is let or withdrawn')).toBeVisible();
  await page.getByLabel('It’s let').check();
  await page.getByRole('button', { name: 'Close the letting' }).click();
  await expect(page.getByText('Closed. Everyone who enquired has been told')).toBeVisible();
  await expect(page.getByText('Step 9 of 9 · Close')).toBeVisible();
  await expectAccessible(page);

  await expect(async () => {
    expect(await subjectsSentTo('aoife.byrne@example.ie')).toContain('9 Canal View has been let');
  }).toPass({ timeout: 20_000 });

  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto(renterLink);
  await expect(renter.getByText('This home has been let')).toBeVisible();
  await expect(
    renter.getByText(/We’ll delete your details from Gaff by \w+day \d+ \w+\./),
  ).toBeVisible();
  await expect(renter.getByRole('button')).toHaveCount(0);
  await expectAccessible(renter);
  await screenshot(renter, '34-renter-closed');
  await phone.close();

  await page.goto(`${lettingUrl}/timeline`);
  await expect(page.getByText('Letting closed: the home is let')).toBeVisible();
});

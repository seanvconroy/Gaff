import { devices, expect, test } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  getChecked,
  goLiveThroughUi,
  latestEmailFor,
  screenshot,
  signIn,
  signUpLandlord,
  uniqueEmail,
} from './support';

const TITLE = '2 bed apartment in Clontarf, Dublin 3';
const DESCRIPTION =
  'A two-bedroom apartment near the seafront in Clontarf, with a sunny living room, gas heating and a short walk to the DART.';

test('M85 to M88: a renter gets an alert for a new home, saves it, and stops alerts in one tap', async ({
  browser,
  page,
}) => {
  test.slow();
  // A renter starts renting with Gaff, on a phone.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  const email = uniqueEmail('niamh');
  await signIn(renter, email);
  await expect(renter).toHaveURL(/\/welcome$/);
  await renter.getByLabel('Your first name').fill('Niamh');
  await renter.getByRole('button', { name: 'Start looking' }).click();
  await expect(renter.getByRole('heading', { name: 'Your homes' })).toBeVisible();

  // M61, M86: nothing in Clontarf yet, so she asks to hear first.
  await renter.goto('/to-rent/dublin/clontarf');
  await expect(
    renter.getByRole('heading', { name: 'No homes match yet in Clontarf.' }),
  ).toBeVisible();
  await renter.getByRole('button', { name: 'Get alerts for this search' }).click();
  await expect(renter.getByText('Your alert is on')).toBeVisible();
  await expect(renter.getByRole('radio', { name: 'As soon as a home is listed' })).toBeChecked();
  await expectAccessible(renter);
  await screenshot(renter, 'm6-alerts');

  // M114: her recent searches are kept with her account, for the Where box.
  await renter.goto('/to-rent');
  await renter.getByRole('button', { name: /Where do you want to live\?/ }).click();
  await expect(
    renter
      .getByRole('group', { name: 'Recent searches' })
      .getByRole('option', { name: /^Clontarf/ }),
  ).toBeVisible();
  await expectAccessible(renter);

  // A checked landlord lists a home in Clontarf.
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '3 Seafield Road', '', 'Clontarf, Dublin 3');
  await goLiveThroughUi(page);
  await completeListing(page, DESCRIPTION);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();

  // M87: the alert arrives within minutes (seconds, in these tests).
  let alert = { subject: '', text: '' };
  await expect(async () => {
    alert = await latestEmailFor(email);
    expect(alert.subject).toBe(`New home: ${TITLE}`);
  }).toPass({ timeout: 60_000 });
  expect(alert.text).toContain('Hello Niamh,');
  expect(alert.text).toContain('€1,850 a month');
  const homeLink = /http\S+\/home\/\S+/.exec(alert.text)![0];
  const stopLink = /Stop alerts for “[^”]+”: (http\S+)/.exec(alert.text)![1]!;

  // M85: she opens it and saves it, with a note only she can see.
  await renter.goto(homeLink);
  await renter.getByRole('button', { name: `Save ${TITLE}` }).click();
  await expect(renter.getByRole('button', { name: `Saved ${TITLE}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await renter.goto('/my/saved');
  await expect(renter.getByRole('link', { name: TITLE })).toBeVisible();
  await renter.getByLabel('Your note').fill('Ask about bike storage');
  await renter.getByRole('button', { name: 'Save note' }).click();
  await expect(async () => {
    await renter.reload();
    await expect(renter.getByLabel('Your note')).toHaveValue('Ask about bike storage');
  }).toPass({ timeout: 10_000 });
  await expectAccessible(renter);
  await screenshot(renter, 'm6-saved');

  // M86: one tap from the email stops the alerts, without signing in again.
  await renter.goto(stopLink);
  await renter.getByRole('button', { name: 'Stop these alerts' }).click();
  await expect(renter.getByRole('heading', { name: 'Alerts stopped' })).toBeVisible();
  await expectAccessible(renter);
  await renter.goto('/my/alerts');
  await expect(renter.getByRole('radio', { name: 'Off' })).toBeChecked();
  await phone.close();
});

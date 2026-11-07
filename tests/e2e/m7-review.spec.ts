import { devices, expect, test } from '@playwright/test';
import {
  completeListing,
  createLettingThroughUi,
  expectAccessible,
  getChecked,
  goLiveThroughUi,
  latestEmailFor,
  makeStaff,
  screenshot,
  signIn,
  signUpLandlord,
  uniqueEmail,
} from './support';

const TITLE = '2 bed apartment in Drumcondra, Dublin 9';
const DESCRIPTION =
  'A two-bedroom apartment near Drumcondra station, with a south-facing living room, gas heating and space for bikes.';

test('M96 to M98, M106: someone reports a listing, a person at Gaff removes it with reasons, and the letter appeals', async ({
  browser,
  page,
}) => {
  test.slow();
  const landlordEmail = await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '14 Hollybank Road', '', 'Drumcondra, Dublin 9');
  await goLiveThroughUi(page);
  await completeListing(page, DESCRIPTION);
  await page.getByLabel(/I own this home or I’m authorised to let it/).check();
  await page.getByRole('button', { name: 'Publish this listing' }).click();
  await expect(page.getByRole('heading', { name: 'It’s live' })).toBeVisible();

  // M96: anyone can report it, with no account.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const visitor = await phone.newPage();
  await visitor.goto('/to-rent/dublin/drumcondra');
  await visitor.getByRole('link', { name: TITLE }).click();
  await visitor.getByRole('link', { name: 'Report this listing' }).click();
  await expect(visitor.getByRole('heading', { name: 'Report a listing' })).toBeVisible();
  await expectAccessible(visitor);
  await visitor.getByLabel('It’s wrong or misleading').check();
  await visitor
    .getByLabel('Tell us more')
    .fill('The photos are of a different building on another street.');
  const reporter = uniqueEmail('reporter');
  await visitor.getByLabel('Your email address').fill(reporter);
  await visitor.getByRole('button', { name: 'Send the report' }).click();
  await expect(visitor.getByText('Thanks. We’ve got your report')).toBeVisible();
  await expectAccessible(visitor);
  await screenshot(visitor, 'm7-report-sent');
  expect((await latestEmailFor(reporter)).subject).toBe('Thanks for your report');

  // M106: a person at Gaff decides, with a reason.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffEmail = uniqueEmail('reviewer');
  await signIn(staff, staffEmail);
  await makeStaff(staffEmail);
  await staff.goto('/staff/review');
  const card = staff.getByRole('region').filter({ hasText: TITLE }).first();
  await expect(card.getByText('The photos are of a different building')).toBeVisible();
  await expectAccessible(staff);
  await screenshot(staff, 'm7-review-queue');
  await card.getByLabel('Decision').selectOption('remove_listing');
  await card.getByLabel('Reason').selectOption('misleading');
  await card.getByRole('button', { name: 'Decide' }).click();
  await expect(staff.getByText('Decided and recorded.')).toBeVisible();
  await staffContext.close();

  // The listing is gone from renters, and the reporter hears the outcome.
  await visitor.goto('/to-rent/dublin/drumcondra');
  await expect(visitor.getByRole('link', { name: TITLE })).toHaveCount(0);
  expect((await latestEmailFor(reporter)).subject).toBe(
    'What we decided about the listing you reported',
  );
  await phone.close();

  // M98: the letter's statement of reasons, with the rule and how to appeal.
  const statement = await latestEmailFor(landlordEmail);
  expect(statement.subject).toBe('We’ve removed your listing for 14 Hollybank Road');
  expect(statement.text).toContain('because it’s misleading about the home or its terms');
  expect(statement.text).toContain('This rests on Gaff’s listing policy');
  const appealUrl = /http\S+\/listings\/appeal\/\S+/.exec(statement.text)![0];
  await page.goto(appealUrl);
  await expect(page.getByRole('heading', { name: 'Appeal a decision' })).toBeVisible();
  await page
    .getByLabel('Why is the decision wrong?')
    .fill('The photos are of this home: it’s on the corner, so the side wall looks different.');
  await page.getByRole('button', { name: 'Send my appeal' }).click();
  await expect(page.getByText('Your appeal is with Gaff')).toBeVisible();
  await expectAccessible(page);
});

import { devices, expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import { expectRenterPageAtBothWidths } from './renter';
import {
  createLettingThroughUi,
  expectAccessible,
  gaffAddress,
  goLiveThroughUi,
  linkInEmail,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

test('R9: a renter answers the questions on their phone, with no account', async ({
  browser,
  page,
}) => {
  await signUpOperator(page);
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });

  let link = '';
  await expect(async () => {
    link = await linkInEmail('aoife.byrne@example.ie', 'Your enquiry about 12 Ranelagh Road');
  }).toPass({ timeout: 20_000 });

  // The renter, on their phone, signed in to nothing.
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const renter = await phone.newPage();
  await renter.goto(link);
  await expect(renter.getByRole('heading', { name: '12 Ranelagh Road' })).toBeVisible();
  // UX-RN-2: one question per screen, starting straight away. Everyone is asked the same.
  await expect(
    renter.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();
  await expect(
    renter.getByText('Hi Aoife. Halcyon Lettings asks everyone the same questions.'),
  ).toBeVisible();
  await expect(renter.getByRole('heading', { name: 'Do you have any pets?' })).toBeHidden();
  await expectAccessible(renter);
  await screenshot(renter, '23-renter-questions');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-questions' });

  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    renter.getByText('Choose how many people would live here, including you'),
  ).toBeVisible();
  await expectAccessible(renter);

  // Each is answered with a tap. Only the questions the criteria need are asked: two here.
  await renter.getByRole('radio', { name: '2', exact: true }).check();
  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(renter.getByRole('heading', { name: 'Do you have any pets?' })).toBeVisible();
  await expect(renter.getByText('Assistance dogs don’t count as pets.')).toBeVisible();
  await renter.getByRole('radio', { name: 'No', exact: true }).check();
  await renter.getByRole('button', { name: 'Send my answers' }).click();
  await expect(renter.getByRole('heading', { name: 'Thanks, Aoife' })).toBeVisible();
  await expect(renter.getByText('Your answers are with Halcyon Lettings.')).toBeVisible();
  await expect(renter.getByText('You’ll hear from us either way.')).toBeVisible();
  await expect(renter.getByText('2 people')).toBeVisible();
  await expectAccessible(renter);
  await screenshot(renter, '24-renter-thanks');
  await expectRenterPageAtBothWidths(renter, { shots: 'wp12-live-answers-sent' });

  // UX-RN-4 (rule 1): an answer that doesn't meet a criterion changes nothing they see. They
  // change "No pets" to "Yes", and the page is the same "Thanks": a person decides who views.
  await renter.getByRole('link', { name: 'Change my answers' }).click();
  await expect(renter.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await renter.getByRole('button', { name: 'Next', exact: true }).click();
  await renter.getByRole('radio', { name: 'Yes', exact: true }).check();
  await renter.getByRole('button', { name: 'Send my answers' }).click();
  await expect(renter.getByRole('heading', { name: 'Thanks, Aoife' })).toBeVisible();
  expect(await renter.getByRole('main').innerText()).not.toMatch(
    /sorry|unfortunately|not suitable|don’t qualify|not eligible/i,
  );
  await phone.close();

  // The operator sees the answers have arrived.
  await page.goto('/lettings');
  await page.getByRole('link', { name: '12 Ranelagh Road', exact: true }).click();
  await page.getByRole('link', { name: 'Enquiries' }).click();
  await expect(page.getByText('Answered')).toBeVisible();
});

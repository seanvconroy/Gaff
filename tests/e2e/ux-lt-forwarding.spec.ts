import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  gmailForwardingConfirmation,
  myhomeEnquiry,
  outlookForwardingConfirmation,
} from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  forwardingTestTo,
  gaffAddress,
  screenshot,
  sendTestEmail,
  signUpOperator,
  toGoLiveThroughUi,
} from './support';

/**
 * Work package WP-11: forwarding enquiries (UX-LT-17 to UX-LT-20). Gaff never signs in to a mail
 * service or a portal: the person changes their own mail settings, and Gaff only reads what
 * arrives at its own address. So these journeys play the mail service: a second page sends what
 * Gmail or Outlook would send to the Gaff address, through the development inbox.
 */
const widths = [
  [390, { width: 390, height: 844 }],
  [1280, { width: 1280, height: 900 }],
] as const;

const TEST_SENDER = 'forwarding-test@mail.gaff.test';

/** A letting through to go-live, answered "advertised on" these, which opens the flow. */
async function liveAndAdvertisedOn(page: Page, portals: ReadonlyArray<'Daft' | 'MyHome'>) {
  await createLettingThroughUi(page);
  await toGoLiveThroughUi(page);
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByRole('heading', { name: / is live$/ })).toBeVisible();
  for (const portal of portals) {
    await page.getByRole('checkbox', { name: portal, exact: true }).check();
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Where do your Daft enquiries arrive?' }),
  ).toBeVisible();
}

/** The person's mail service, in a page of its own: the Gaff address it sends to. */
async function mailService(context: BrowserContext) {
  const mail = await context.newPage();
  const to = await gaffAddress(mail);
  return { mail, to };
}

/** Screen 3 onwards: the test goes, the rule sends it back, and the answer shows (UX-LT-19). */
async function testComesBack(
  page: Page,
  mail: Page,
  to: string,
  sentTo: string,
  width: number,
  name: string,
) {
  await page.getByRole('button', { name: 'Send a test enquiry' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your test enquiry is on its way' }),
  ).toBeVisible();
  await expect(page.getByText(new RegExp(`from ${TEST_SENDER}`)).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send it again' })).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, `ux-lt-19-${name}-waiting-${width}`);

  // The rule forwards the test to the Gaff address, as it was sent. The page shows the answer
  // without a reload.
  const sent = await forwardingTestTo(sentTo);
  expect(sent.from).toContain(`<${TEST_SENDER}>`);
  await sendTestEmail(mail, { to, ...sent });
  await expect(page.getByRole('heading', { level: 1, name: 'It works' })).toBeVisible({
    timeout: 30_000,
  });
}

test('UX-LT-17 to UX-LT-20: Gmail, from go-live: the steps, the code read out, and the test enquiry answered', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const email = await signUpOperator(page);
    await liveAndAdvertisedOn(page, ['Daft']);
    const lettingUrl = /\/forwarding\?letting=([0-9a-f-]{36})&live=1$/.exec(page.url());
    expect(lettingUrl, 'the flow knows the home it was opened from').not.toBeNull();
    const lettingId = lettingUrl![1]!;

    // Screen 1: where the enquiries arrive. Nothing chosen: the error is at the cards.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Choose where your Daft enquiries arrive')).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-17-service-${width}`);
    await page.getByRole('radio', { name: 'Gmail' }).check();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Screen 2: the Gaff address to copy, three steps for Gmail, and Gmail's own settings.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Forward them to Gaff' }),
    ).toBeVisible();
    const { mail, to } = await mailService(context);
    await expect(page.getByText(to, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy your Gaff address' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Steps in Gmail' }).getByRole('listitem'),
    ).toHaveCount(3);
    const settings = page.getByRole('link', { name: /^Open Gmail’s settings/ });
    await expect(settings).toHaveAttribute('href', /^https:\/\/mail\.google\.com\//);
    await expect(settings).toHaveAttribute('target', '_blank');
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-17-gmail-steps-${width}`);
    await page.getByRole('link', { name: 'I’ve done that' }).click();

    // Screen 3: waiting for Gmail's confirmation, and what to do if it doesn't come.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Waiting for Gmail’s confirmation' }),
    ).toBeVisible();
    await expect(page.getByText(/Nothing after five minutes\?/)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-18-waiting-${width}`);

    // Gmail sends its confirmation to the Gaff address. The code shows here, with no reload
    // and no trip to Inbox (UX-LT-18), then the filter that forwards only enquiries.
    await sendTestEmail(mail, { to, ...gmailForwardingConfirmation });
    await expect(page.getByRole('heading', { name: 'Gmail’s confirmation code' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('123456789', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy the confirmation code' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Then forward only enquiries' })).toBeVisible();
    await expect(
      page.getByText(`daft.ie OR myhome.ie OR ${TEST_SENDER}`, { exact: true }),
    ).toBeVisible();
    // The address Gmail forwards from, as its email said.
    await expect(page.getByLabel('Your email address')).toHaveValue('ann@halcyon.test');
    await page.getByLabel('Your email address').fill(email);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-lt-18-code-${width}`);

    // Screen 4: the test through the rule, answered as a renter would be (UX-LT-19).
    await testComesBack(page, mail, to, email, width, 'gmail');
    const answer = page.getByRole('article', {
      name: 'Gaff’s answer to Sam Sample, a made-up renter',
    });
    await expect(
      answer.getByText('Your enquiry about 12 Ranelagh Road', { exact: true }),
    ).toBeVisible();
    await expect(answer.getByText(/I’m Halcyon Lettings’ AI assistant/)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-19-it-works-${width}`);

    // Done goes back to the home, just live, and forwarding is no longer its task (UX-LT-20).
    await page.getByRole('link', { name: 'Done', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/lettings/${lettingId}\\?saved=live$`));
    await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Set up forwarding/ })).toHaveCount(0);
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Set up forwarding/ })).toHaveCount(0);
    await context.close();
  }
});

test('UX-LT-17, UX-LT-19: Outlook: a rule with no confirmation, and the test enquiry answered', async ({
  browser,
}) => {
  test.slow();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const email = await signUpOperator(page);
  await liveAndAdvertisedOn(page, ['Daft', 'MyHome']);
  await page.getByRole('radio', { name: 'Outlook or Microsoft 365' }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Forward them to Gaff' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Steps in Outlook' }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(page.getByText(`daft.ie, myhome.ie, ${TEST_SENDER}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Open Outlook’s rules/ })).toHaveAttribute(
    'href',
    /^https:\/\/outlook\.office\.com\//,
  );
  await expectAccessible(page);
  await screenshot(page, 'ux-lt-17-outlook-steps-1280');
  await page.getByRole('link', { name: 'I’ve done that' }).click();

  // Outlook doesn't usually ask: nothing holds the person up.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Outlook doesn’t usually ask to confirm' }),
  ).toBeVisible();
  await expect(page.getByLabel('Your email address')).toHaveValue(email);
  // The address is checked at the field, with no box at the top.
  await page.getByLabel('Your email address').fill('not an address');
  await page.getByRole('button', { name: 'Send a test enquiry' }).click();
  await expect(page.getByText('Enter your email address, like ann@example.ie')).toBeVisible();
  await expect(page.getByLabel('Your email address')).toBeFocused();
  await expectAccessible(page);
  await screenshot(page, 'ux-lt-18-outlook-1280');
  await page.getByLabel('Your email address').fill(email);

  const { mail, to } = await mailService(context);
  await testComesBack(page, mail, to, email, 1280, 'outlook');
  await expect(
    page.getByText('Your enquiry about 12 Ranelagh Road', { exact: true }),
  ).toBeVisible();
  await context.close();
});

test('UX-LT-17, UX-LT-18: something else, from Settings with no home live: the link read out, and the test answered', async ({
  browser,
}) => {
  test.slow();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const email = await signUpOperator(page);
  await page.goto('/settings/enquiries');
  await expect(page.getByText('Forward your Daft and MyHome enquiries here')).toBeVisible();
  await page.getByRole('link', { name: 'Set up forwarding' }).click();
  await page.getByRole('radio', { name: 'Something else' }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(
    page.getByRole('list', { name: 'Steps in your email' }).getByRole('listitem'),
  ).toHaveCount(3);
  // There's no one settings page to open for "something else".
  await expect(page.getByRole('link', { name: /^Open / })).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, 'ux-lt-17-other-steps-390');
  await page.getByRole('link', { name: 'I’ve done that' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Waiting for your email’s confirmation' }),
  ).toBeVisible();
  await expect(page.getByText(/Not every email asks to confirm/)).toBeVisible();

  // Whichever service it turns out to be, its code and its own link are read out. The link is
  // shown and copied; Gaff never opens it.
  const { mail, to } = await mailService(context);
  await sendTestEmail(mail, { to, ...outlookForwardingConfirmation });
  await expect(page.getByRole('heading', { name: 'Outlook’s confirmation code' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('482913', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'https://outlook.live.com/mail/options/forwarding/verify?t=made-up-token',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link to the confirmation' })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);
  await screenshot(page, 'ux-lt-18-other-link-390');
  await page.getByLabel('Your email address').fill(email);

  await testComesBack(page, mail, to, email, 390, 'other');
  // No home is live, so there's no home's reply to show: it says what will happen instead.
  await expect(
    page.getByText(/Once a home is live, Gaff answers each of its enquiries/),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/enquiries$/);
  await expect(
    page.getByText('Forwarding is working. Enquiries from Daft and MyHome reach Gaff.'),
  ).toBeVisible();
  await context.close();
});

test('UX-LT-20: a home on MyHome with no forwarding has "Set up forwarding" as its task, here and on Today, until an enquiry comes through', async ({
  browser,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await signUpOperator(page);
    await liveAndAdvertisedOn(page, ['MyHome']);
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/lettings\/[0-9a-f-]{36}\?saved=live$/);

    // The letting's page: forwarding is its one task, and it opens the flow.
    const lettingPage = page.url().replace(/\?.*$/, '');
    const task = page.getByRole('link', { name: /^Set up forwarding/ });
    await expect(task).toBeVisible();
    await expect(task).toContainText('Enquiries from MyHome aren’t reaching Gaff yet');
    await expectAccessible(page);
    await screenshot(page, `ux-lt-20-letting-task-${width}`);

    // Today has it too, by the home's address.
    await page.goto('/today');
    const row = page.getByRole('link', { name: /^Set up forwarding · 12 Ranelagh Road/ });
    await expect(row).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-lt-20-today-${width}`);
    await row.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where do your Daft enquiries arrive?' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(lettingPage);

    // A MyHome enquiry reaches Gaff: the rule works, so the task goes, here and on Today.
    const { mail, to } = await mailService(context);
    await sendTestEmail(mail, { to, ...myhomeEnquiry });
    await expect(async () => {
      await page.goto(lettingPage);
      await expect(page.getByRole('link', { name: /^Set up forwarding/ })).toHaveCount(0, {
        timeout: 1000,
      });
    }).toPass({ timeout: 20_000 });
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Set up forwarding/ })).toHaveCount(0);
    await context.close();
  }
});

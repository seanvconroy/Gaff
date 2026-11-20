import { expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import { expectPrivateFrame, expectTalkToAPerson, FRAME_WIDTHS } from './frame';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  licenceOf,
  signUpOperator,
} from './support';

/**
 * Work package WP-6: the frame every private page stands in, "Talk to a person", and the one
 * layout of every email (UX-PP-1 to UX-PP-10, UX-AI-1, UX-AI-2, UX-AI-10). The first test uses
 * the component page's made-up frame and touches no data. The second follows one renter from the
 * email to their page. The owner's and the referee's pages, and every later renter page, are held
 * to the frame inside their own journeys (R12, R16 to R27).
 */

test('UX-PP-1, UX-PP-3, UX-PP-5, UX-PP-9: the frame for a renter, a tenant, an owner and a referee, at 390px and 1280px', async ({
  page,
}) => {
  test.slow();
  // Sunday 15 November 2026, midday in Ireland, so dates are written without a year.
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
  for (const width of FRAME_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });

    // A renter: the wordmark, "Talk to a person", the home, the task, what happens next, the footer.
    await page.goto('/dev/ui/frame?for=renter');
    const header = page.getByRole('banner');
    const footer = page.getByRole('contentinfo');
    await expect(header.getByRole('img', { name: 'Gaff' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Talk to a person' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '12 Ranelagh Road' })).toBeVisible();
    await expect(
      page.getByText('€1,850 a month · 2-bed apartment · From Sunday 13 December'),
    ).toBeVisible();
    await expect(page.getByText('Let by Halcyon Lettings', { exact: true })).toBeVisible();
    await expect(page.getByText('What happens next', { exact: true })).toHaveCount(1);
    await expect(footer.getByText('PSRA licence 001234')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'How we use your details' })).toHaveAttribute(
      'href',
      '/privacy/halcyon-lettings',
    );
    await expect(footer.getByText('Run with Gaff')).toHaveCount(0);
    // UX-AI-1: what the assistant wrote is marked as the assistant's, in words.
    await expect(page.getByText('From Halcyon Lettings’ AI assistant')).toBeVisible();
    // UX-PP-1: the main button spans the screen on a phone, and is 48px high at any width.
    const main = page.getByRole('button', { name: 'The main action' });
    const box = (await main.boundingBox())!;
    expect(box.height).toBe(48);
    if (width === 390) expect(box.width).toBe(390 - 2 * 16);
    // The home's picture is a fixed 3:2, with or without a photo in it.
    const photo = (await page.locator('[data-home-photo]').boundingBox())!;
    expect(photo.width / photo.height).toBeCloseTo(3 / 2, 2);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `wp6-frame-renter-${width}`);

    // UX-PP-3, Q43: this made-up agency has a phone number, so the sheet offers both ways.
    await expectTalkToAPerson(page, {
      lister: 'Halcyon Lettings',
      phone: '01 496 0000',
      shots: `wp6-talk-to-a-person-with-phone-${width}`,
    });

    // The tenant: "From" is the day their tenancy starts.
    await page.goto('/dev/ui/frame?for=tenant');
    await expect(
      page.getByText('€1,850 a month · 2-bed apartment · From Sunday 20 December'),
    ).toBeVisible();
    await expectAccessible(page);

    // An owner: the agency's name, no wordmark, no "Talk to a person", "Run with Gaff".
    await page.goto('/dev/ui/frame?for=owner');
    await expect(header.getByText('Halcyon Lettings', { exact: true })).toBeVisible();
    await expect(header.getByRole('img', { name: 'Gaff' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Talk to a person' })).toHaveCount(0);
    await expect(page.getByText(/^Let by/)).toHaveCount(0);
    await expect(footer.getByText('Run with Gaff', { exact: true })).toBeVisible();
    await expect(
      footer.getByText('To reach Halcyon Lettings, reply to their email or ring 01 496 0000.'),
    ).toBeVisible();
    await expect(footer.getByRole('link')).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `wp6-frame-owner-${width}`);

    // A referee: the same frame, and no home.
    await page.goto('/dev/ui/frame?for=referee');
    await expect(header.getByText('Halcyon Lettings', { exact: true })).toBeVisible();
    await expect(page.getByText(/a month ·/)).toHaveCount(0);
    await expect(footer.getByText('Run with Gaff', { exact: true })).toBeVisible();
    await expectAccessible(page);

    // A link that has ended names nobody: the wordmark, a way to a person, and no footer.
    await page.goto('/dev/ui/frame?for=ended');
    await expect(header.getByRole('img', { name: 'Gaff' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Talk to a person' })).toBeVisible();
    await expect(footer).toHaveCount(0);
    await expectAccessible(page);
  }

  // Dark: the frame's own colours hold their contrast.
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const reader of ['renter', 'owner']) {
    await page.goto(`/dev/ui/frame?for=${reader}`);
    await expectAccessible(page);
  }
});

test('UX-PP-3, UX-PP-10, UX-AI-1, UX-AI-2: the first reply is one email with one button, and the renter’s page has “Talk to a person”', async ({
  page,
}) => {
  test.slow();
  // UX-AG-7: the licence renters see is the confirmed agency's, from its entry in the register.
  const licence = await licenceOf(await signUpOperator(page));
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  const to = await gaffAddress(page);
  await sendTestEmail(page, { to, ...daftEnquiry });

  // The development outbox shows the first reply as a mail app would. Other journeys share the
  // outbox, so look only at mail from this operator.
  const slug = to.split('@')[0]!;
  const firstReply = page
    .locator('article')
    .filter({ hasText: `<${slug}@` })
    .filter({ has: page.getByRole('heading', { name: 'Your enquiry about 12 Ranelagh Road' }) });
  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(firstReply).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const email = firstReply.frameLocator('iframe');

  // UX-PP-10: the wordmark, the fixed words, and one button with a label, not a web address.
  await expect(email.getByRole('img', { name: 'Gaff' })).toBeVisible();
  // Rule 6 (UX-AI-1): the first message says they're dealing with an AI assistant, word for word.
  await expect(
    email.getByText(
      'I’m Halcyon Lettings’ AI assistant. I’ll help with your enquiry, and a person at Halcyon Lettings makes every decision. If you’d rather talk to a person, just reply and say so.',
    ),
  ).toBeVisible();
  const button = email.getByRole('link', { name: 'Answer a few questions' });
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.height).toBe(48);
  await expect(email.getByRole('link', { name: 'How we use your details' })).toBeVisible();
  await expect(email.getByRole('link')).toHaveCount(2);
  await expect(email.getByText(/https?:\/\//)).toHaveCount(0);
  // UX-AI-2: every message has a route to a person; the footer names the lister and its licence.
  await expect(
    email.getByText('Want to talk to a person? Reply to this email and say so.'),
  ).toBeVisible();
  await expect(email.getByText(`PSRA licence ${licence}`)).toBeVisible();
  // The plain-text alternative is still there, and still says it too.
  await expect(firstReply.getByText('Plain text', { exact: true })).toBeVisible();
  await expect(
    firstReply.locator('pre').getByText(/I’m Halcyon Lettings’ AI assistant/),
  ).toBeVisible();
  await expect(firstReply.locator('pre').getByRole('link')).toHaveCount(2);

  for (const width of FRAME_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expect(button).toBeVisible();
    // The laid-out email is shown whole: its frame is as tall as the email in it.
    await expect
      .poll(async () => {
        const frame = firstReply.locator('iframe');
        return frame.evaluate(
          (el: HTMLIFrameElement) =>
            el.clientHeight - (el.contentDocument?.documentElement.scrollHeight ?? 0),
        );
      })
      .toBeGreaterThanOrEqual(0);
    await expectNoSidewaysScroll(page);
    // The preview is a sandboxed frame no scanner can enter, so the email is checked as a page
    // of its own: the same markup a mail app is given.
    const markup = await firstReply.locator('iframe').getAttribute('srcdoc');
    const mail = await page.context().newPage();
    await mail.setViewportSize({ width, height: 844 });
    await mail.setContent(markup!);
    await expectAccessible(mail);
    await mail.close();
    await firstReply.scrollIntoViewIfNeeded();
    await firstReply.screenshot({ path: `screenshots/wp6-email-first-reply-${width}.png` });
  }

  // The button opens the renter's own page (UX-PP-7): no account, the link is the key.
  await page.setViewportSize({ width: 390, height: 844 });
  await button.click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]{43}$/);
  await expect(
    page.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();

  // UX-PP-1 to UX-PP-5: the page stands in the renter's frame at both widths.
  await expectPrivateFrame(page, {
    audience: 'renter',
    lister: 'Halcyon Lettings',
    home: '12 Ranelagh Road',
    licence,
    shots: 'wp6-renter-questions',
  });
  await expect(page.getByRole('heading', { level: 1, name: '12 Ranelagh Road' })).toBeVisible();
  await expect(
    page.getByText(/^€1,850 a month · 2-bed apartment · From \w+day \d+ \w+$/),
  ).toBeVisible();
  // UX-PP-2: what happens next is said once, after the task.
  await expect(page.getByText('What happens next', { exact: true })).toHaveCount(1);
  const order = await page.evaluate(() => {
    const task = document.querySelector('form')!;
    const next = [...document.querySelectorAll('p')].find(
      (p) => p.textContent === 'What happens next',
    )!;
    return task.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order, '“What happens next” comes after the task').toBeTruthy();

  // UX-PP-3, UX-AI-2: "Talk to a person", at both widths. No lister has a phone number yet.
  for (const width of FRAME_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expectTalkToAPerson(page, {
      lister: 'Halcyon Lettings',
      shots: `wp6-talk-to-a-person-${width}`,
    });
  }

  // The privacy notice, from the footer, stands in the same frame.
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'How we use your details' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'How we use your details' }),
  ).toBeVisible();
  await expectPrivateFrame(page, {
    audience: 'renter',
    lister: 'Halcyon Lettings',
    licence,
  });

  // A link that isn't anyone's still gives a way to a person, and names nobody.
  await page.goto('/r/not-a-real-link');
  await expect(page.getByRole('heading', { name: 'This link has ended' })).toBeVisible();
  await expectPrivateFrame(page, { audience: 'renter', lister: null });
  await expectTalkToAPerson(page, { lister: null });
});

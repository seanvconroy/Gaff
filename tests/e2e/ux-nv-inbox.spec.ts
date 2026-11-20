import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { loadTokens } from '../../scripts/tokens/lib';
import {
  daftEnquiry,
  gmailForwardingConfirmation,
  outlookForwardingConfirmation,
} from '../fixtures/emails';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signUpOperator,
} from './support';

/**
 * Work package WP-8: Inbox (section 3 of the redesign, UX-NV-13 to UX-NV-18). Each screen is
 * checked at 390px and 1280px: one design, the same words and steps at both.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

const tokens = loadTokens();
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const ink = rgb(tokens.colors['ink']!.light);

const main = (page: Page) => page.getByRole('main');
const conversations = (page: Page) => page.getByRole('list', { name: 'Conversations' });
const chips = (page: Page) => page.getByRole('navigation', { name: 'Show' });
const toast = (page: Page, words: string) => page.getByRole('status').getByText(words);
/** The fill of every button in the page: an ink one is the screen's primary button (UX-DS-2). */
const inkButtons = async (page: Page) =>
  (
    await main(page)
      .locator('a, button')
      .evaluateAll((controls) => controls.map((c) => getComputedStyle(c).backgroundColor))
  ).filter((fill) => fill === ink).length;

/** A conversation opens at its latest, so its picture is taken from the top of the page. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, name);
}

/** A made-up renter, with an address no other journey writes to. */
function aRenter(name: string) {
  const tag = randomUUID().slice(0, 8);
  return {
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${tag}@example.ie`,
    phone: `087 ${String(parseInt(tag.slice(0, 5), 16) % 1000).padStart(3, '0')} ${String(parseInt(tag.slice(3), 16) % 10000).padStart(4, '0')}`,
  };
}

/** A Daft enquiry about 12 Ranelagh Road from this renter, saying this. */
const enquiryFrom = (renter: ReturnType<typeof aRenter>, message: string) => ({
  ...daftEnquiry,
  replyTo: `${renter.name} <${renter.email}>`,
  text: daftEnquiry.text
    .replace('Aoife Byrne', renter.name)
    .replace('aoife.byrne@example.ie', renter.email)
    .replace('087 123 4567', renter.phone)
    .replace('Hi, is the apartment still available? Is there parking?\nThanks, Aoife', message),
});

/** The emails the development outbox holds for one address. */
const mailTo = (page: Page, email: string) =>
  page.locator('article').filter({ hasText: `To ${email}` });

test('UX-NV-13 to UX-NV-16, UX-NV-18: Inbox lists every conversation under two chips; a conversation is a thread with its draft ready; one send answers both; a person can write themselves', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(
    page,
    '12 Ranelagh Road',
    'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
  );
  await goLiveThroughUi(page);
  const to = await gaffAddress(page);
  const aoife = aRenter('Aoife Byrne');
  const ciaran = aRenter('Ciarán Walsh');
  // Aoife asks one thing Gaff can answer and one it can't. Ciarán asks nothing.
  await sendTestEmail(page, {
    to,
    ...enquiryFrom(aoife, 'Hi, is it furnished? Is there a garden?\nThanks, Aoife'),
  });
  await sendTestEmail(page, { to, ...enquiryFrom(ciaran, 'I would love to view it.') });

  const rows = conversations(page).getByRole('listitem');
  await expect(async () => {
    await page.goto('/inbox?show=all');
    await expect(rows).toHaveCount(2, { timeout: 1000 });
    await expect(rows.filter({ hasText: 'Aoife' })).toContainText('Needs you', { timeout: 1000 });
    // Gaff's first reply has gone to both, so it is the last thing said in each.
    await expect(rows.filter({ hasText: 'Gaff:' })).toHaveCount(2, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);

    // UX-NV-13: "Needs you" is on whenever something is waiting: Aoife's conversation, alone.
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
    await expect(chips(page).getByRole('link')).toHaveText(['Needs you', 'All']);
    await expect(chips(page).getByRole('link', { name: 'Needs you' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(rows).toHaveCount(1);
    // Who, which home, the last line and when; what is waiting, in words.
    await expect(rows.nth(0)).toContainText('Aoife');
    await expect(rows.nth(0)).toContainText('12 Ranelagh Road');
    await expect(rows.nth(0)).toContainText('Gaff: Thanks for your enquiry');
    // On the hour the time has no minutes: "10am".
    await expect(rows.nth(0)).toContainText(/\d{1,2}(:\d{2})?(am|pm)/);
    await expect(rows.nth(0)).toContainText('Needs you');
    // UX-NV-5: Inbox's badge counts the conversations that need a reply.
    await expect(
      page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Inbox 1 thing needs you' }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `inbox-needs-you-${width}`);

    // "All" is every conversation, newest first. The whole row is one link.
    await chips(page).getByRole('link', { name: 'All' }).click();
    await expect(page).toHaveURL(/\/inbox\?show=all$/);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Ciarán' })).not.toContainText('Needs you');
    await expect(rows.nth(0).getByRole('link')).toHaveCount(1);
    // No contact details in the list, and nobody's private link.
    const listed = await main(page).innerText();
    for (const secret of [aoife.email, ciaran.email, '@', '087', '/r/']) {
      expect(listed).not.toContain(secret);
    }
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `inbox-all-${width}`);

    // UX-NV-14: the conversation opens as a thread, oldest first.
    await rows.filter({ hasText: 'Aoife' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/inbox\/renter-[0-9a-f-]{36}\?show=all$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Aoife Byrne' })).toBeVisible();
    const thread = page.getByRole('list', { name: 'Messages with Aoife' }).getByRole('listitem');
    await expect(thread).toHaveCount(2);
    await expect(thread.nth(0)).toContainText('Aoife');
    await expect(thread.nth(0)).toContainText('Hi, is it furnished? Is there a garden?');
    // UX-AI-15: what Gaff sent is marked as the assistant's, which operators know as "Gaff".
    await expect(thread.nth(1)).toContainText('Gaff, the assistant');
    await expect(thread.nth(1)).toContainText('AI assistant');
    // Her private link is hers alone: it isn't shown to the people letting the home.
    await expect(thread.nth(1)).toContainText('[their private link]');
    expect(await main(page).innerText()).not.toContain('/r/');

    // One design, two layouts: the list beside the thread, or the thread alone with a way back.
    const back = main(page).getByRole('link', { name: 'Inbox', exact: true });
    if (width === '390') {
      await expect(conversations(page)).toBeHidden();
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(/\/inbox\?show=all$/);
      await expect(rows).toHaveCount(2);
      await page.goBack();
    } else {
      await expect(back).toBeHidden();
      const list = (await conversations(page).boundingBox())!;
      const open = (await page.getByRole('region', { name: 'Aoife Byrne' }).boundingBox())!;
      expect(list.x + list.width).toBeLessThanOrEqual(open.x);
      await expect(rows.filter({ hasText: 'Aoife' }).getByRole('link')).toHaveAttribute(
        'aria-current',
        'true',
      );
    }

    // The draft sits in the reply box, already written, carrying "Drafted by AI". "Send" is the
    // one primary button; "Edit" and "Don't send" are beside it.
    const reply = page.getByRole('region', { name: 'Reply to Aoife' });
    await expect(reply.getByText('Drafted by AI')).toBeVisible();
    await expect(
      reply.getByText(/You asked: Is it furnished\?\s+Yes, it’s furnished\./),
    ).toBeVisible();
    await expect(reply.getByRole('button')).toHaveText(['Send', 'Edit', 'Don’t send']);
    expect(await inkButtons(page)).toBe(1);
    expect(
      await reply
        .getByRole('button', { name: 'Send', exact: true })
        .evaluate((button) => getComputedStyle(button).backgroundColor),
    ).toBe(ink);
    // UX-NV-15: what Gaff couldn't answer is marked in the draft, with a field, in place of the
    // line that would tell her a person will reply. UX-NV-16: one tick, on by default.
    await expect(reply.getByLabel('Gaff doesn’t know: Is there a garden?')).toBeVisible();
    await expect(reply.getByText(/passed your other question/)).toHaveCount(0);
    await expect(reply.getByRole('checkbox')).toHaveCount(1);
    await expect(reply.getByLabel('Remember this for 12 Ranelagh Road')).toBeChecked();
    await expect(reply.getByRole('radio')).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await shot(page, `inbox-thread-draft-${width}`);

    // "Edit" opens the whole draft to change; nothing is sent until "Send".
    await reply.getByRole('button', { name: 'Edit' }).click();
    await expect(reply.getByLabel('The draft')).toHaveValue(
      /You asked: Is it furnished\?\nYes, it’s furnished\.\n\nI’ve passed your other question to a person at Halcyon Lettings\./,
    );
    await expectAccessible(page);
    await shot(page, `inbox-draft-edit-${width}`);
    await reply.getByRole('button', { name: 'Stop editing' }).click();
    await expect(reply.getByLabel('The draft')).toHaveCount(0);
  }

  // Rule 3 holds in the reply box: an answer that touches a protected ground isn't sent, and
  // the problem shows at its own field, with no box at the top.
  const reply = page.getByRole('region', { name: 'Reply to Aoife' });
  const garden = reply.getByLabel('Gaff doesn’t know: Is there a garden?');
  await garden.fill('Yes, ideal for kids.');
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(garden).toHaveAttribute('aria-invalid', 'true');
  await expect(garden).toHaveValue('Yes, ideal for kids.');
  await expect(reply.getByText(/family status/)).toBeVisible();
  await expect(reply.getByText('Drafted by AI')).toBeVisible();
  await expectAccessible(page);

  // UX-NV-15: sending answers both, in one email.
  await garden.fill('Yes, a small back garden with a shed.');
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(toast(page, 'Sent')).toBeVisible();
  await expect(page).toHaveURL(/\/inbox\/renter-[0-9a-f-]{36}\?show=all$/);
  const said = page.getByRole('list', { name: 'Messages with Aoife' }).getByRole('listitem');
  await expect(said).toHaveCount(3);
  await expect(said.nth(2)).toContainText('Gaff, the assistant');
  await expect(said.nth(2)).toContainText('You asked: Is it furnished? Yes, it’s furnished.');
  await expect(said.nth(2)).toContainText(
    'You asked: Is there a garden? Yes, a small back garden with a shed.',
  );
  // Nothing waits any more: the reply box is for writing, and the badge is gone.
  await expect(page.getByRole('region', { name: 'Write to Aoife' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inbox', exact: true }),
  ).toBeVisible();
  await expect(async () => {
    await page.goto('/dev/outbox');
    const answers = mailTo(page, aoife.email).filter({
      has: page.getByRole('heading', { name: 'Re: 12 Ranelagh Road' }),
    });
    await expect(answers).toHaveCount(1, { timeout: 1000 });
    await expect(answers.locator('pre')).toContainText('Yes, it’s furnished.');
    await expect(answers.locator('pre')).toContainText('Yes, a small back garden with a shed.');
    await expect(answers.locator('pre')).not.toContainText('passed your other question');
    // Rule 6: the answer still says who wrote it.
    await expect(answers.locator('pre')).toContainText('Halcyon Lettings’ AI assistant');
  }).toPass({ timeout: 20_000 });

  // UX-NV-16: the answer was remembered for the home, so Gaff answers the next person who asks.
  const niamh = aRenter('Niamh Kelly');
  await sendTestEmail(page, { to, ...enquiryFrom(niamh, 'Does it have a garden?') });
  await expect(async () => {
    await page.goto('/inbox');
    await expect(rows.filter({ hasText: 'Niamh' })).toContainText('Needs you', { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await rows.filter({ hasText: 'Niamh' }).getByRole('link').click();
  await expect(
    page
      .getByRole('region', { name: 'Reply to Niamh' })
      .getByText(/Yes, a small back garden with a shed\./),
  ).toBeVisible();

  // UX-NV-18: a person writes to a renter themselves, in a conversation where nothing waits.
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/inbox?show=all');
    await rows.filter({ hasText: 'Ciarán' }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Ciarán Walsh' })).toBeVisible();
    const write = page.getByRole('region', { name: 'Write to Ciarán' });
    await expect(write.getByLabel('Your message')).toBeVisible();
    await expect(write.getByText('Drafted by AI')).toHaveCount(0);
    expect(await inkButtons(page)).toBe(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await shot(page, `inbox-write-${width}`);
  }
  const write = page.getByRole('region', { name: 'Write to Ciarán' });
  await write.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(write.getByText('Write your message before sending.')).toBeVisible();
  await expect(write.getByLabel('Your message')).toHaveAttribute('aria-invalid', 'true');
  await write.getByLabel('Your message').fill('Hi Ciarán,\n\nThe side gate is open on the day.');
  await write.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(toast(page, 'Sent')).toBeVisible();
  // It is in the thread as written, marked as theirs.
  const theirs = page.getByRole('list', { name: 'Messages with Ciarán' }).getByRole('listitem');
  await expect(theirs.last()).toContainText('You');
  await expect(theirs.last()).toContainText('The side gate is open on the day.');
  await expect(theirs.last()).not.toContainText('the assistant');
  await expect(rows.filter({ hasText: 'Ciarán' })).toContainText(
    'You: The side gate is open on the day.',
  );
  await shot(page, 'inbox-written-1280');
  // And it reaches him as written, saying who wrote it.
  await expect(async () => {
    await page.goto('/dev/outbox');
    const written = mailTo(page, ciaran.email).filter({ hasText: 'The side gate is open' });
    await expect(written).toHaveCount(1, { timeout: 1000 });
    await expect(written).toContainText('From "Ann Power, Halcyon Lettings via Gaff"');
    expect(await written.locator('pre').evaluate((pre) => pre.textContent)).toBe(
      'Hi Ciarán,\n\nThe side gate is open on the day.',
    );
  }).toPass({ timeout: 20_000 });
});

test('UX-NV-17: an email Gaff couldn’t place asks which home it is about, and a forwarding confirmation has its code or link read out with a copy button', async ({
  page,
  context,
}) => {
  test.slow();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signUpOperator(page);
  // A home taking enquiries, with no advert address Gaff could match an enquiry to.
  await createLettingThroughUi(page, '4 Main Street');
  await goLiveThroughUi(page);
  const to = await gaffAddress(page);
  const aoife = aRenter('Aoife Byrne');
  await sendTestEmail(page, {
    to,
    ...enquiryFrom(aoife, 'Hi, is the apartment still available?\nThanks, Aoife'),
  });
  await sendTestEmail(page, { to, ...gmailForwardingConfirmation });
  await sendTestEmail(page, { to, ...outlookForwardingConfirmation });

  const rows = conversations(page).getByRole('listitem');
  await expect(async () => {
    await page.goto('/inbox');
    await expect(rows).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/inbox');
    // Each is a conversation that needs a person, named by who sent it and what it says.
    await expect(rows.filter({ hasText: 'Gmail Team' })).toContainText(
      'Gmail Forwarding Confirmation',
    );
    await expect(rows.filter({ hasText: 'Daft.ie' })).toContainText('New enquiry');
    for (const row of await rows.all()) await expect(row).toContainText('Needs you');
    await expectAccessible(page);
    await screenshot(page, `inbox-emails-${width}`);

    // A forwarding confirmation from Gmail: the code, read out, with a copy button.
    await rows.filter({ hasText: 'Gmail Team' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/inbox\/email-[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Gmail Team' })).toBeVisible();
    const gmail = page.getByRole('region', { name: 'Gmail’s confirmation code' });
    await expect(gmail.getByText('123456789', { exact: true })).toBeVisible();
    await expect(gmail).toContainText(
      'Gmail is checking that mail from ann@halcyon.test should be forwarded to Gaff.',
    );
    await expect(gmail).toContainText('Type it into Gmail’s forwarding settings.');
    await gmail.getByRole('button', { name: 'Copy the confirmation code' }).click();
    await expect(gmail.getByText('Copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('123456789');
    // It can't be an enquiry, so there is no home to choose: one answer.
    await expect(page.getByRole('group', { name: 'Which home is this about?' })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'It’s not an enquiry' })).toBeVisible();
    // The email itself is underneath.
    await expect(page.getByRole('list', { name: 'The email' })).toContainText(
      'has requested to automatically forward mail',
    );
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `inbox-email-confirmation-${width}`);

    // Outlook's: a code and a link on Outlook's own site, each with a copy button.
    await page.goto('/inbox');
    await rows.filter({ hasText: 'Microsoft Outlook' }).getByRole('link').click();
    const outlook = page.getByRole('region', { name: 'Outlook’s confirmation code' });
    await expect(outlook.getByText('482913', { exact: true })).toBeVisible();
    const link = 'https://outlook.live.com/mail/options/forwarding/verify?t=made-up-token';
    await expect(outlook.getByRole('link', { name: link })).toHaveAttribute('href', link);
    await outlook.getByRole('button', { name: 'Copy link to the confirmation' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `inbox-email-confirmation-link-${width}`);

    // An enquiry Gaff couldn't match: one question, with the homes taking enquiries as choices.
    await page.goto('/inbox');
    await rows.filter({ hasText: 'Daft.ie' }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Daft.ie' })).toBeVisible();
    const which = page.getByRole('group', { name: 'Which home is this about?' });
    await expect(which.getByRole('radio')).toHaveCount(2);
    await expect(which.getByLabel('4 Main Street')).not.toBeChecked();
    await expect(which.getByLabel('It’s not an enquiry')).not.toBeChecked();
    expect(await inkButtons(page)).toBe(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `inbox-email-which-home-${width}`);
  }

  // Nothing is assumed: with no answer, the question says so, at the question.
  const which = page.getByRole('group', { name: 'Which home is this about?' });
  await main(page).getByRole('button', { name: 'Done' }).click();
  await expect(which.getByText('Choose a home, or say it’s not an enquiry.')).toBeVisible();
  await expectAccessible(page);
  // Matched to a home, it becomes that renter's conversation, and Gaff answers it.
  await which.getByLabel('4 Main Street').check();
  await main(page).getByRole('button', { name: 'Done' }).click();
  await expect(toast(page, 'Matched. Gaff is answering it now.')).toBeVisible();
  await expect(page).toHaveURL(/\/inbox\/renter-[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Aoife Byrne' })).toBeVisible();
  await expect(main(page).getByRole('link', { name: '4 Main Street', exact: true })).toBeVisible();
  await expect(async () => {
    await page.goto('/dev/outbox');
    await expect(
      mailTo(page, aoife.email).filter({
        has: page.getByRole('heading', { name: 'Your enquiry about 4 Main Street' }),
      }),
    ).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // "It's not an enquiry" sets an email aside. It leaves Inbox, and nothing was sent anywhere.
  await page.goto('/inbox?show=all');
  await rows.filter({ hasText: 'Gmail Team' }).getByRole('link').click();
  await main(page).getByRole('button', { name: 'It’s not an enquiry' }).click();
  await expect(toast(page, 'Set aside')).toBeVisible();
  await expect(page).toHaveURL(/\/inbox\?show=all$/);
  await expect(rows.filter({ hasText: 'Gmail Team' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Microsoft Outlook' })).toHaveCount(1);
});

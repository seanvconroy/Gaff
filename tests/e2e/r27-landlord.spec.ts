import { expect, test } from '@playwright/test';
import { daftEnquiry } from '../fixtures/emails';
import { onPhone } from './journeys';
import { expectFramePageAtBothWidths } from './renter';
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
} from './support';

const OWNER = 'tom.walsh@example.ie';

test('R27, UX-OW-1, UX-OW-2, UX-OW-4, UX-OP-1 to UX-OP-4: the agent shares a letting from its menu, and the owner follows it on one screen, with renters only as "Applicant N"', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  const lettingUrl = page.url().replace(/\?.*$/, '');
  // UX-OW-1: asked once, just after go-live, where Gaff doesn't know the owner yet.
  await expect(page.getByText('Letting this for an owner?')).toBeVisible();
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await expect(async () => {
    await page.goto(`${lettingUrl}/shortlist`);
    await expect(page.getByLabel('Invite Aoife Byrne')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('1 invited to book a viewing')).toBeVisible();

  // UX-OW-2: "Share with the owner" is in the letting's menu, a focused task with one button.
  await page.goto(lettingUrl);
  await page.getByRole('button', { name: 'More for 12 Ranelagh Road' }).click();
  await page.getByRole('menuitem', { name: 'Share with the owner' }).click();
  await expect(page.getByRole('heading', { name: 'Share with the owner' })).toBeVisible();
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByLabel('Owner’s name')).toHaveAccessibleDescription(/.+/);
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill(OWNER);
  await expectAccessible(page);
  await screenshot(page, 'wp13-share-with-owner');
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  // No link is shown to the agent: it goes to the owner by email.
  expect(await page.content()).not.toMatch(/\/l\/[A-Za-z0-9_-]{43}/);
  await expectAccessible(page);

  // The owner, on their phone, with no account.
  let link = '';
  await expect(async () => {
    link = await linkInEmail(OWNER, '12 Ranelagh Road: follow the letting');
  }).toPass({ timeout: 20_000 });
  const tom = await onPhone(browser, link);
  const owner = tom.page;
  await expect(owner.getByText('12 Ranelagh Road').first()).toBeVisible();
  // UX-OP-1: where it stands, in a sentence, and what's been decided, with who decided.
  await expect(owner.locator('[data-owner="standing"]')).toHaveText(/Viewings|invited to view/);
  await expect(owner.getByText('1 person invited to view.')).toBeVisible();
  await expect(
    owner.getByText(/^Chosen by Ann Power on .+, from the ranked list\.$/),
  ).toBeVisible();
  // UX-OP-2: no names, contact details or message text before the approval.
  const noNames = async () =>
    expect(await owner.content()).not.toMatch(/Aoife|Byrne|aoife\.byrne|087 123 4567|parking/i);
  // UX-OP-4: the page says how to reach the agent.
  await expect(owner.getByText(/^To reach Halcyon Lettings, reply to their email/)).toBeVisible();
  await noNames();
  await expectFramePageAtBothWidths(owner, 'owner', 'wp13-owner-page');
  await screenshot(owner, '33-landlord-view');

  // UX-OP-3: the whole record is behind one link, with renters as "Applicant 1", and none of
  // Gaff's internal steps.
  await owner.getByText('See everything that’s happened').click();
  await expect(owner.getByText('An enquiry arrived').first()).toBeVisible();
  await expect(owner.getByText(/Applicant 1/).first()).toBeVisible();
  const record = await owner.locator('body').innerText();
  expect(record).not.toMatch(/Fixed wording|Answers drafted|drafted|message\.sent/i);
  await noNames();
  await expectAccessible(owner);
  await expectNoSidewaysScroll(owner);
  await screenshot(owner, 'wp13-owner-record');

  // UX-OW-4: the agent sees when it was last opened, and can stop sharing at any time.
  await page.goto(`${lettingUrl}/owner`);
  await expect(page.getByRole('heading', { name: 'Shared with Tom Walsh' })).toBeVisible();
  await expect(page.getByText(/^Tom last opened it on /)).toBeVisible();
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByRole('heading', { name: 'Stopped sharing' })).toBeVisible();
  await owner.reload();
  await expect(owner.getByRole('heading', { name: 'This link has ended' })).toBeVisible();
  await expectAccessible(owner);
  await tom.context.close();
});

import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  enterEmailedCode,
  expectAccessible,
  expectNoSidewaysScroll,
  latestLinkFor,
  screenshot,
  signIn,
  signUpOperator,
  uniqueEmail,
} from './support';

async function invite(page: Page, email: string, role: 'Agent' | 'Admin' = 'Agent'): Promise<void> {
  await page.goto('/settings/team');
  await page.getByLabel('Their work email').fill(email);
  await page.getByLabel(new RegExp(`^${role}:`)).check();
  await page.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(page.getByText(`We’ve emailed an invitation to ${email}.`)).toBeVisible();
}

/** Opens the invitation in a browser of the invited person's own, signs in by code and joins. */
async function join(browser: Browser, email: string, team: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(await latestLinkFor(email));
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await enterEmailedCode(page, email);
  await page.getByRole('button', { name: `Join ${team}` }).click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  return page;
}

test('AU9: an invitation is for the person it was sent to, and nobody else', async ({
  page,
  browser,
}) => {
  await signUpOperator(page, 'Sorrel Lettings');
  const invited = uniqueEmail('dara');
  await invite(page, invited);
  const link = await latestLinkFor(invited);

  // Someone else has the link: forwarded, or a shared inbox. They're signed in as themselves.
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const other = await context.newPage();
  const otherEmail = uniqueEmail('someone.else');
  await signIn(other, otherEmail);
  await other.goto(link);
  await expect(other.getByRole('heading', { name: 'Join Sorrel Lettings on Gaff' })).toBeVisible();
  await expect(
    other.getByText(
      `This invitation is for ${invited}, and you’re signed in as ${otherEmail}. Sign in as ${invited} to join, or ask whoever invited you to send it to ${otherEmail} instead.`,
    ),
  ).toBeVisible();
  await expect(other.getByRole('button', { name: /^Join / })).toHaveCount(0);
  await expectAccessible(other);
  await expectNoSidewaysScroll(other);
  await screenshot(other, 'au9-invitation-for-someone-else');

  // The person it's for: sign out of the other account, and sign in with the invited address.
  await other.getByRole('button', { name: `Sign out and use ${invited}` }).click();
  await expect(other.getByText(`This invitation is for ${invited}.`)).toBeVisible();
  await expect(other.getByLabel('Your email address')).toHaveValue(invited);
  await expect(other.getByLabel('Your email address')).not.toBeEditable();
  await expectAccessible(other);
  await expectNoSidewaysScroll(other);
  await screenshot(other, 'au9-join-sign-in');
  await other.getByRole('button', { name: 'Email me a code' }).click();
  await enterEmailedCode(other, invited);
  await other.getByRole('button', { name: 'Join Sorrel Lettings' }).click();
  await expect(other.getByRole('heading', { name: 'Profile' })).toBeVisible();

  // Used once: the link is finished.
  await other.goto(link);
  await expect(other.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible();
  await expectAccessible(other);
  await context.close();
});

test('AU9, AU10: an admin sends an invitation again, cancels one, changes a role and removes someone', async ({
  page,
  browser,
}) => {
  await signUpOperator(page, 'Foxglove Lettings');
  const first = uniqueEmail('eimear');
  const second = uniqueEmail('fionn');
  await invite(page, first);
  await invite(page, second, 'Admin');
  const firstLink = await latestLinkFor(first);
  const secondLink = await latestLinkFor(second);

  await page.goto('/settings/team');
  const waiting = page.getByRole('region', { name: 'Invitations waiting' });
  await expect(waiting.getByRole('row')).toHaveCount(3);
  await expect(waiting.getByRole('row', { name: new RegExp(first) })).toContainText('Agent');
  await expect(waiting.getByRole('row', { name: new RegExp(second) })).toContainText('Admin');
  await expectAccessible(page);
  await screenshot(page, 'au9-invitations-waiting');

  // Sent again: a new link, and the earlier one stops working.
  await waiting.getByRole('button', { name: `Send again to ${first}` }).click();
  await expect(
    page.getByText(
      'We’ve emailed the invitation again, with a new link. The earlier link no longer works.',
    ),
  ).toBeVisible();
  expect(await latestLinkFor(first)).not.toBe(firstLink);
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(firstLink);
  await expect(
    stranger.getByRole('heading', { name: 'This invitation has expired' }),
  ).toBeVisible();

  // Cancelled: its link stops working too.
  await waiting.getByRole('button', { name: `Cancel the invitation to ${second}` }).click();
  await expect(
    page.getByText('The invitation is cancelled, and its link no longer works.'),
  ).toBeVisible();
  await expect(waiting.getByRole('row')).toHaveCount(2);
  await stranger.goto(secondLink);
  await expect(
    stranger.getByRole('heading', { name: 'This invitation has expired' }),
  ).toBeVisible();
  await stranger.context().close();

  // The colleague joins with the new link, and sets their name.
  const colleague = await join(browser, first, 'Foxglove Lettings');
  await colleague.getByLabel('Your name, as renters see it').fill('Eimear Nolan');
  await colleague.getByLabel('Your own PSRA licence number').fill('004321');
  await colleague.getByRole('button', { name: 'Save my profile' }).click();
  await expect(colleague.getByText('Saved.')).toBeVisible();

  // Everyone on the team sees who's on it; only admins can change it.
  await colleague.goto('/settings/team');
  await expect(colleague.getByRole('row', { name: /Eimear Nolan/ })).toContainText('Agent');
  await expect(colleague.getByRole('button', { name: /^(Remove|Make) / })).toHaveCount(0);
  await expect(colleague.getByRole('heading', { name: 'Invite a colleague' })).toHaveCount(0);
  await expectAccessible(colleague);

  // The admin makes them an admin, then an agent again.
  await page.goto('/settings/team');
  await expect(page.getByRole('region', { name: 'Invitations waiting' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Make Eimear Nolan an admin' }).click();
  await expect(page.getByText('Their role is changed.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Eimear Nolan/ })).toContainText('Admin');
  await expectAccessible(page);
  await screenshot(page, 'au10-team');
  await colleague.reload();
  await expect(colleague.getByRole('heading', { name: 'Invite a colleague' })).toBeVisible();
  await page.getByRole('button', { name: 'Make Eimear Nolan an agent' }).click();
  await expect(page.getByRole('row', { name: /Eimear Nolan/ })).toContainText('Agent');

  // Removed: what they could see here ends at once, and their own account stays.
  await page.getByRole('button', { name: 'Remove Eimear Nolan' }).click();
  await expect(
    page.getByText('They’ve been removed from the team. What they could see here ended at once.'),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Eimear Nolan/ })).toHaveCount(0);
  await colleague.goto('/settings/team');
  await expect(colleague).toHaveURL(/\/welcome$/);
  await colleague.goto('/account/security');
  await expect(colleague.getByRole('heading', { name: 'How you sign in' })).toBeVisible();
  await colleague.context().close();
});

test('AU9: the team page fits a phone with an invitation waiting', async ({ page }) => {
  await signUpOperator(page, 'Bramble Lettings');
  await invite(page, uniqueEmail('grainne.with.quite.a.long.name.at.the.agency'));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/settings/team');
  await expect(page.getByRole('heading', { name: 'Invitations waiting' })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);
});

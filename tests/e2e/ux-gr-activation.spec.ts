import { expect, test, type Page } from '@playwright/test';
import { loadTokens } from '../../scripts/tokens/lib';
import { daftEnquiry } from '../fixtures/emails';
import { forwardingNowWorks, setupFinishedLongAgo } from './activation';
import {
  addHomeThroughUi,
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  screenshot,
  sendTestEmail,
  signIn,
  signUpLandlord,
  signUpOperator,
  toGoLiveThroughUi,
  uniqueEmail,
  watchTheTestEnquiry,
} from './support';
import { aColleagueOf, viewingsWereYesterday } from './today';

/**
 * Work package WP-27: activation (section 9 of the UX redesign). The setup checklist for each
 * kind of user, one prompt at a time, and where Gaff's name appears. At 390px and 1280px: one
 * design, the same words and steps at both.
 */
const widths = [
  ['390', { width: 390, height: 844 }],
  ['1280', { width: 1280, height: 900 }],
] as const;

const tokens = loadTokens();
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const ink = rgb(tokens.colors['ink']!.light);

const main = (page: Page) => page.getByRole('main');
const checklist = (page: Page) => page.getByRole('region', { name: 'Get set up' });
/** How many of the screen's buttons are primary (ink). */
const primaries = async (page: Page) =>
  (
    await main(page)
      .locator('a, button')
      .evaluateAll((controls) => controls.map((c) => getComputedStyle(c).backgroundColor))
  ).filter((fill) => fill === ink).length;

/** The checklist at both widths: its count, its next step and that step's one button. */
async function expectChecklist(
  page: Page,
  shot: string,
  expected: { done: string; next: string; button: string },
) {
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(checklist(page).getByText(expected.done)).toBeVisible();
    await expect(checklist(page).getByRole('heading', { name: expected.next })).toBeVisible();
    // UX-GR-1, UX-HM-6: one next step with one button, Today's only primary. No way to dismiss.
    await expect(checklist(page).getByRole('link')).toHaveText([expected.button]);
    await expect(checklist(page).getByRole('button')).toHaveCount(0);
    expect(await primaries(page)).toBe(1);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `${shot}-${width}`);
  }
}

test('UX-GR-1 to UX-GR-3, UX-AG-13: a new agency admin completes the checklist step by step', async ({
  page,
}) => {
  test.slow();
  const admin = await signUpOperator(page);

  // First visit: two steps, the first to add a letting. Forwarding isn't on it yet (UX-GR-2).
  await expectChecklist(page, 'ux-gr-checklist-agency-start', {
    done: '0 of 2 done',
    next: 'Add your first letting',
    button: 'Add a letting',
  });
  await expect(checklist(page).getByText('Invite your team')).toBeVisible();
  await expect(checklist(page).getByText(/Daft/)).toHaveCount(0);
  await checklist(page).getByRole('link', { name: 'Add a letting' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tell Gaff about the home' }),
  ).toBeVisible();

  // It goes live, advertised on Daft. Forwarding is offered; closing it lands on the home.
  await createLettingThroughUi(page);
  await toGoLiveThroughUi(page);
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await page.getByRole('checkbox', { name: 'Daft', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Where do your Daft enquiries arrive?' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();

  // UX-GR-3: live isn't done. The first step moves on to watching Gaff answer an enquiry.
  await expectChecklist(page, 'ux-gr-checklist-agency-test', {
    done: '0 of 3 done',
    next: 'See Gaff answer an enquiry',
    button: 'Send a test enquiry',
  });
  await checklist(page).getByRole('link', { name: 'Send a test enquiry' }).click();
  await watchTheTestEnquiry(page);
  await expect(page).toHaveURL(/\/today$/);

  // Forwarding, for the portal the home is on.
  await expectChecklist(page, 'ux-gr-checklist-agency-forwarding', {
    done: '1 of 3 done',
    next: 'Send your Daft enquiries to Gaff',
    button: 'Set up forwarding',
  });
  await checklist(page).getByRole('link', { name: 'Set up forwarding' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Where do your Daft enquiries arrive?' }),
  ).toBeVisible();
  // The rule's test comes back (the forwarding journeys do this through a mailbox's steps).
  await forwardingNowWorks(admin);

  // UX-AG-13: the team, the checklist's last step.
  await expectChecklist(page, 'ux-gr-checklist-agency-team', {
    done: '2 of 3 done',
    next: 'Invite your team',
    button: 'Invite your team',
  });
  await checklist(page).getByRole('link', { name: 'Invite your team' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite your team' })).toBeVisible();
  // Opened from Today, it offers "It's just me" too.
  await expect(page.getByRole('button', { name: 'It’s just me' })).toBeVisible();
  await page.getByLabel('Email addresses').fill(uniqueEmail('brid'));
  await page.getByRole('button', { name: 'Send invites' }).click();
  await expect(page.getByRole('heading', { name: 'Invite sent' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();

  // Complete: "You're all set", once, and Today has no primary button from now on.
  await expect(page.getByText('You’re all set. Anything that needs you shows here.')).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
  await expectAccessible(page);
  await screenshot(page, 'ux-gr-checklist-all-set-390');
  await page.reload();
  await expect(page.getByText('You’re all set.', { exact: false })).toHaveCount(0);
  await expect(checklist(page)).toHaveCount(0);
  expect(await primaries(page)).toBe(0);
});

test('UX-GR-1, UX-GR-3: a private landlord’s checklist is their home, and its first go-live ends at the test enquiry', async ({
  page,
}) => {
  test.slow();
  await signUpLandlord(page);
  await expectChecklist(page, 'ux-gr-checklist-landlord', {
    done: '0 of 1 done',
    next: 'Add your home',
    button: 'Add your home',
  });
  // No team to invite, and no identity check on the list (UX-GR-2).
  await expect(checklist(page).getByText(/Invite|identity|bank/i)).toHaveCount(0);

  await addHomeThroughUi(page, '4 Harbour View');
  await toGoLiveThroughUi(page);
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // UX-GR-3: straight to the test enquiry, watched being answered, in the first session.
  await expect(page).toHaveURL(/\/test-enquiry\?live=1$/);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Send a test enquiry' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-gr-first-test-enquiry-${width}`);
  }
  await watchTheTestEnquiry(page);
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();

  await page.goto('/today');
  await expect(page.getByText('You’re all set. Anything that needs you shows here.')).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
});

test('UX-GR-4: an agent who joins by invite has no checklist; Today opens on what needs them, or on "Add a letting"', async ({
  page,
}) => {
  const admin = await signUpOperator(page);
  const agent = await aColleagueOf(admin, 'Bríd Agent');
  await page.context().clearCookies();
  await signIn(page, agent);
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(checklist(page)).toHaveCount(0);
    await expect(main(page).getByRole('link')).toHaveText(['Add a letting']);
    expect(await primaries(page)).toBe(0);
    await expectAccessible(page);
    await screenshot(page, `ux-gr-invited-agent-${width}`);
  }
});

test('UX-GR-5, UX-GR-6: with two prompts due, only the higher shows; "Not now" makes way for the next; no prompt blocks a task', async ({
  page,
}) => {
  test.slow();
  const admin = await signUpOperator(page);
  await createLettingThroughUi(page);
  await goLiveThroughUi(page);
  // Setup was finished long ago, so the checklist isn't Today's prompt.
  await setupFinishedLongAgo(admin);
  // Someone has answered, and the home's viewings are over with none to come.
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });
  await viewingsWereYesterday('12 Ranelagh Road', admin);

  // Two prompts are due: "Add viewing times" (3rd in section 9's table) and "Invite your team"
  // (5th, a sole admin with a live letting). Only the higher shows.
  const prompts = main(page).locator('[data-prompt]');
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await expect(async () => {
      await page.goto('/today');
      await expect(prompts).toHaveCount(1, { timeout: 1000 });
    }).toPass();
    const prompt = page.getByRole('complementary', { name: 'Add viewing times' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('link', { name: 'Add viewing times' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Invite your team' })).toHaveCount(0);
    // UX-GR-6: in the page's flow, after Needs you: not a banner across the top, not a pop-up.
    expect(await prompt.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    const needsYouTop = (await page.getByRole('region', { name: 'Needs you' }).boundingBox())!.y;
    expect((await prompt.boundingBox())!.y).toBeGreaterThan(needsYouTop);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // It is never the primary button (UX-HM-6).
    expect(await primaries(page)).toBe(0);
    await expectAccessible(page);
    await screenshot(page, `ux-gr-one-prompt-${width}`);
  }

  // No prompt blocks a task: the row beside it opens its task at once.
  await page
    .getByRole('region', { name: 'Needs you' })
    .getByRole('link', { name: /^Choose who views/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Choose who views' })).toBeVisible();

  // "Not now": it waits fourteen days, and the next one due takes its place. Still one.
  await page.goto('/today');
  await page.getByRole('button', { name: 'Not now (Add viewing times)' }).click();
  await expect(page.getByRole('complementary', { name: 'Invite your team' })).toBeVisible();
  await expect(prompts).toHaveCount(1);
  await expectAccessible(page);
  await screenshot(page, 'ux-gr-next-prompt-390');
  // The letting's own page doesn't offer the declined one either.
  await page.goto('/lettings');
  await page
    .getByRole('link', { name: /12 Ranelagh Road/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: '12 Ranelagh Road' })).toBeVisible();
  await expect(main(page).locator('[data-prompt]')).toHaveCount(0);
});

test('UX-GR-7, UX-GR-8: Gaff’s wordmark and "Run with Gaff" are where section 9 says, and nowhere else', async ({
  page,
}) => {
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    // A renter's page: Gaff's wordmark with the lister's name; no "Run with Gaff".
    await page.goto('/dev/ui/frame?for=renter');
    await expect(page.getByRole('banner').getByRole('img', { name: 'Gaff' })).toHaveCount(1);
    await expect(page.getByText('Let by Halcyon Lettings', { exact: true })).toBeVisible();
    await expect(page.getByText('Run with Gaff')).toHaveCount(0);

    // An owner's and a referee's: the agency's name, and Gaff only as the footer's one line.
    for (const reader of ['owner', 'referee']) {
      await page.goto(`/dev/ui/frame?for=${reader}`);
      await expect(page.getByRole('img', { name: 'Gaff' })).toHaveCount(0);
      await expect(page.getByText('Run with Gaff', { exact: true })).toHaveCount(1);
      await expect(page.getByRole('contentinfo').getByText('Run with Gaff')).toBeVisible();
      const words = await page.locator('body').innerText();
      expect(words.match(/Gaff/g)).toHaveLength(1);
      await expect(page.locator('[data-prompt]')).toHaveCount(0);
      for (const href of ['/sign-in', '/welcome', '/lettings/new', '/']) {
        await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
      }
      await expectAccessible(page);
      await screenshot(page, `ux-gr-placement-${reader}-${width}`);
    }
  }
});

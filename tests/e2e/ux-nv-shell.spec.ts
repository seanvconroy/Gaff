import { expect, test, type Page } from '@playwright/test';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  isoDateInDays,
  openAccountMenu,
  screenshot,
  signIn,
  signUpLandlord,
  signUpOperator,
  signUpRenter,
  uniqueEmail,
} from './support';

/**
 * Work package WP-3: the shell and the navigation. One bar for everyone: a top bar at 900px and
 * up, a tab bar at the foot of the screen below it. Each journey runs at 390px and 1280px.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
/** The avatar shows the person's initials, so its name holds them: "AP, account" (WCAG 2.5.3). */
const avatar = (page: Page) => page.getByRole('banner').getByRole('button', { name: /, account$/ });
const wordmark = (page: Page) => page.getByRole('link', { name: 'Gaff', exact: true });
const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;

/** UX-NV-3 and UX-NV-4: where the bar's parts are, at this width. */
async function expectBarLayout(page: Page, viewport: { width: number; height: number }) {
  const nav = await box(mainNav(page));
  const mark = await box(wordmark(page));
  const account = await box(avatar(page));
  // The wordmark is top left and the avatar top right, at every width.
  expect(mark.y + mark.height).toBeLessThanOrEqual(64);
  expect(mark.x).toBeLessThan(viewport.width / 4);
  expect(account.y + account.height).toBeLessThanOrEqual(64);
  expect(account.x).toBeGreaterThan((viewport.width * 3) / 4);
  if (viewport.width > 900) {
    // A top bar: the destinations in its middle, between the wordmark and the avatar.
    expect(nav.y + nav.height).toBeLessThanOrEqual(65);
    expect(Math.abs(nav.x + nav.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(mark.x + mark.width).toBeLessThan(nav.x);
    expect(account.x).toBeGreaterThan(nav.x + nav.width);
  } else {
    // A tab bar across the foot of the screen, each tab an icon over its label.
    expect(nav.y + nav.height).toBeCloseTo(viewport.height, 0);
    expect(nav.width).toBeCloseTo(viewport.width, 0);
    for (const link of await mainNav(page).getByRole('link').all()) {
      const icon = await box(link.locator('svg'));
      const label = await box(link.locator('span').first());
      expect(icon.y + icon.height).toBeLessThanOrEqual(label.y + 1);
    }
  }
}

test('UX-NV-1 to UX-NV-5: anyone running lettings has four destinations, in a top bar on a desktop and a tab bar on a phone', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  // A letting still being set up: one thing needs a person, so Today carries a count.
  await createLettingThroughUi(page);
  const lettingUrl = page.url().replace(/\/viewings.*$/, '');
  const nav = mainNav(page);

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');

    // UX-NV-1: exactly four, in order, and nothing else in the bar. There is no sidebar.
    await expect(nav.getByRole('link')).toHaveText([/^Today/, 'Lettings', 'Calendar', 'Inbox']);
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
    for (const gone of ['Approvals', 'Questions', 'Needs attention', 'Settings', 'Sign out']) {
      await expect(nav.getByText(gone)).toHaveCount(0);
    }
    await expectBarLayout(page, viewport);

    // UX-NV-5: Today counts what needs a person; Inbox has nothing waiting, so no count.
    await expect(nav.getByRole('link', { name: 'Today 1 thing needs you' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();

    for (const [label, path, heading] of [
      ['Today', '/today', 'Today'],
      ['Lettings', '/lettings', 'Lettings'],
      ['Calendar', '/calendar', 'Calendar'],
      ['Inbox', '/inbox', 'Inbox'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      // Today shows still shapes while it loads (section 3, "States"): wait for the page itself.
      await expect(page.getByText('Finding what needs you.')).toHaveCount(0);
      // The page you're on is marked for screen readers, and only that one.
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current]')).toHaveCount(1);
      await expectNoSidewaysScroll(page);
      await expectAccessible(page);
      await screenshot(page, `nv-letting-${label.toLowerCase()}-${width}`);
    }

    // Lettings lists every home (UX-NV-9); Calendar says what will be there.
    await page.goto('/lettings');
    await expect(page.getByRole('link', { name: '12 Ranelagh Road', exact: true })).toBeVisible();
    await page.goto('/calendar');
    await expect(
      page.getByRole('heading', { name: 'Viewing times for every home will appear here.' }),
    ).toBeVisible();

    // UX-NV-2: Approvals, Questions and Needs attention aren't pages any more. Their work is
    // done in Inbox, which says what will appear there while it is empty.
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
    for (const gone of ['/approvals', '/questions', '/attention']) {
      expect((await page.request.get(gone)).status()).toBe(404);
    }

    // Every page of a letting, and settings, sit in the same shell.
    for (const path of [lettingUrl, `${lettingUrl}/viewings`, `${lettingUrl}/timeline`]) {
      await page.goto(path);
      await expect(nav.getByRole('link', { name: 'Lettings' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expectBarLayout(page, viewport);
      await expectNoSidewaysScroll(page);
    }
    await page.goto('/settings');
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
    await expectBarLayout(page, viewport);
    await expectNoSidewaysScroll(page);
  }

  // UX-NV-3: on a desktop the bar stays at the top when the page scrolls, and lifts off it.
  // Settings is the page long enough to scroll: Today with nothing waiting is a few lines.
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/settings');
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const header = page.getByRole('banner');
  expect((await box(header)).y).toBe(0);
  await expect(header).toHaveAttribute('data-scrolled', '');
  await expect(header).not.toHaveCSS('box-shadow', 'none');

  // UX-NV-5: the count follows what the person does, without loading the page again. Finishing
  // set-up was the one thing waiting, so the count goes as the letting goes live.
  await page.setViewportSize(desktop);
  await page.goto(lettingUrl);
  await goLiveThroughUi(page);
  await expect(nav.getByRole('link', { name: 'Today', exact: true })).toBeVisible();
});

test('UX-NV-4: the tab bar never wraps, down to 360px wide, whatever the counts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const side of ['letting', 'renting'] as const) {
    await page.goto(`/dev/ui/nav?side=${side}`);
    const tabs = await mainNav(page)
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => {
          const label = link.querySelector('span')!;
          const badge = link.querySelector('[aria-hidden="true"]:not(svg)');
          const tab = link.getBoundingClientRect();
          return {
            words: label.textContent ?? '',
            lines: label.getClientRects().length,
            labelInside:
              label.getBoundingClientRect().left >= tab.left &&
              label.getBoundingClientRect().right <= tab.right,
            badgeInside: !badge || badge.getBoundingClientRect().right <= tab.right,
            top: tab.top,
            height: tab.height,
          };
        }),
      );
    expect(tabs.length).toBe(side === 'letting' ? 4 : 3);
    for (const tab of tabs) {
      // One word, on one line, inside its own tab; every tab the same 64px.
      expect(tab.words).toMatch(/^\S+$/);
      expect(tab.lines, tab.words).toBe(1);
      expect(tab.labelInside, tab.words).toBe(true);
      expect(tab.badgeInside, tab.words).toBe(true);
      expect(tab.height, tab.words).toBe(64);
      expect(tab.top).toBe(tabs[0]!.top);
    }
    // A count past 99 stops growing, and is read out in words.
    if (side === 'renting') {
      const enquiries = mainNav(page).getByRole('link', {
        name: 'Enquiries 120 things need you',
      });
      await expect(enquiries).toContainText('99+');
    }
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `nv-${side}-360`);
  }
});

test('UX-NV-8: the account menu on the avatar holds the name and context, Profile, settings, Help and Sign out, and works by keyboard', async ({
  page,
}) => {
  test.slow();
  const email = await signUpOperator(page);

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');

    // Enter opens it, and the first row takes focus.
    await expect(avatar(page)).toHaveAccessibleName('AP, account');
    await avatar(page).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu).toBeVisible();
    const dialog = page.getByRole('dialog', { name: 'Account' });
    await expect(dialog.getByText('Ann Power')).toBeVisible();
    await expect(dialog.getByText('Halcyon Lettings')).toBeVisible();
    // UX-AC-13: the roles they can still add, then the rest. One context, so no switcher.
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Find a home to rent',
      'Let a home I own',
      'Profile',
      'Agency settings',
      'Help',
      'Sign out',
    ]);
    // Team belongs to a later package: it isn't a link to nowhere.
    await expect(menu.getByText('Team')).toHaveCount(0);

    // The arrows, Home and End move through the rows, and round the ends.
    await expect(menu.getByRole('menuitem', { name: 'Find a home to rent' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Let a home I own' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Profile' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Find a home to rent' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem', { name: 'Find a home to rent' })).toBeFocused();
    await expectAccessible(page);
    await screenshot(page, `nv-account-menu-${width}`);

    // Escape closes it, and focus goes back to the avatar.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(avatar(page)).toBeFocused();

    // The down arrow opens it too; Enter on a row goes there.
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Ann Power')).toBeVisible();
    await expect(page.getByRole('main').getByText(email)).toBeVisible();
    await expect(mainNav(page).locator('[aria-current]')).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `nv-profile-${width}`);

    await (await openAccountMenu(page)).getByRole('menuitem', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    await expectAccessible(page);

    await (await openAccountMenu(page)).getByRole('menuitem', { name: 'Agency settings' }).click();
    await expect(page.getByRole('heading', { name: 'Your Gaff address' })).toBeVisible();
  }

  // UX-AC-13: "Find a home to rent" adds Renting, and opens Search on the renting side.
  await (
    await openAccountMenu(page)
  )
    .getByRole('menuitem', { name: 'Find a home to rent' })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: 'Homes to rent will appear here.' }),
  ).toBeVisible();
  await expect(mainNav(page).getByRole('link')).toHaveText(['Search', 'Saved', 'Enquiries']);

  await (await openAccountMenu(page)).getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  // Signed out, the letting side asks for sign-in again.
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('UX-NV-19, UX-NV-21: the renting side has the same bar, with Search, Saved and Enquiries', async ({
  page,
}) => {
  test.slow();
  // Someone who said, at first run, that they're looking for a home (UX-AC-6).
  await signUpRenter(page);
  const nav = mainNav(page);

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/saved');
    await expect(nav.getByRole('link')).toHaveText(['Search', 'Saved', 'Enquiries']);
    await expect(nav.getByRole('link', { name: 'Saved' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Homes you save appear here.' })).toBeVisible();
    // The same bar as the letting side: only the destinations differ.
    await expectBarLayout(page, viewport);
    await expect(page.getByRole('banner').getByRole('link', { name: 'List a home' })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `nv-renting-saved-${width}`);

    await nav.getByRole('link', { name: 'Enquiries' }).click();
    await expect(page).toHaveURL(/\/enquiries$/);
    await expect(nav.getByRole('link', { name: 'Enquiries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('heading', { name: 'Homes you ask to view appear here.' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search homes' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `nv-renting-enquiries-${width}`);

    // Search is the public site's first screen, and where the renting side opens.
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.getByRole('link', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { name: 'Homes to rent will appear here.' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `nv-renting-search-${width}`);
  }

  // UX-NV-8, UX-AC-13: a person who only rents sees the ways to let in the menu, and no
  // agency settings. "List a home" is in the header beside it.
  const menu = await openAccountMenu(page);
  await expect(page.getByRole('dialog', { name: 'Account' }).getByText('Renting')).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Let a home I own',
    'Join or set up an agency',
    'Profile',
    'Help',
    'Sign out',
  ]);
  await expectAccessible(page);
  await page.keyboard.press('Escape');

  // UX-NV-21: nothing can need a renter yet, so Enquiries carries no count; when something does,
  // the bar shows it and reads it out (the made-up counts on the development page).
  await expect(nav.getByRole('link', { name: 'Enquiries', exact: true })).toBeVisible();
  await page.goto('/dev/ui/nav?side=renting');
  await expect(nav.getByRole('link', { name: 'Enquiries 120 things need you' })).toBeVisible();
});

test('UX-NV-20: a signed-out visitor sees the wordmark, "List a home" and "Sign in", and signing in moves nothing', async ({
  page,
}) => {
  test.slow();
  const places: Record<string, { mark: number; signInRight: number; signInLeft: number }> = {};
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    // The public site's first screen: nobody is sent to sign in.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Homes to rent will appear here.' }),
    ).toBeVisible();

    const header = page.getByRole('banner');
    const listAHome = header.getByRole('link', { name: 'List a home' });
    const signInLink = header.getByRole('link', { name: 'Sign in' });
    await expect(wordmark(page)).toHaveAttribute('href', '/');
    await expect(header.getByRole('link')).toHaveCount(3);
    // No destinations until someone signs in, and so no tab bar.
    await expect(mainNav(page)).toHaveCount(0);
    // The three sit on one row: the wordmark on the left, then "List a home", then "Sign in".
    const [mark, list, signInBox] = [
      await box(wordmark(page)),
      await box(listAHome),
      await box(signInLink),
    ];
    expect(mark.x + mark.width).toBeLessThan(list.x);
    expect(list.x + list.width).toBeLessThanOrEqual(signInBox.x);
    expect(signInBox.y + signInBox.height).toBeLessThanOrEqual(64);
    places[width] = {
      mark: mark.x,
      signInLeft: signInBox.x,
      signInRight: signInBox.x + signInBox.width,
    };
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `nv-signed-out-${width}`);
  }

  // It still fits at 360px.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await expectNoSidewaysScroll(page);

  // Saved and Enquiries are for someone signed in.
  await page.goto('/saved');
  await expect(page).toHaveURL(/\/sign-in$/);
  // "List a home" goes to sign-in, and carries where to go on to afterwards.
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'List a home' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Flettings%2Fnew$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Signed in, "Sign in" has become the avatar, in its place, and nothing else has moved.
  await signIn(page, uniqueEmail('aoife'));
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/?rent=1');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'List a home' })).toBeVisible();
    const before = places[width]!;
    const account = await box(avatar(page));
    expect((await box(wordmark(page))).x).toBe(before.mark);
    // The avatar sits where "Sign in" was, at the same right-hand edge (its circle is 4px in).
    expect(Math.abs(account.x + account.width - before.signInRight)).toBeLessThanOrEqual(4);
    expect(account.x).toBeGreaterThanOrEqual(before.signInLeft);
    const list = await box(header.getByRole('link', { name: 'List a home' }));
    expect(list.x + list.width).toBeLessThanOrEqual(account.x);
  }
});

test('UX-NV-6, UX-FL-1, UX-FL-3: adding a letting opens full screen without the navigation, shows errors at the field, and closing it goes back to where it started', async ({
  page,
}) => {
  test.slow();
  await signUpOperator(page);

  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(mainNav(page)).toBeVisible();
    await page.getByRole('link', { name: 'Add a letting' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Add a letting' })).toBeVisible();

    // UX-NV-6: no navigation, at either width: no bar, no tabs, no avatar.
    await expect(mainNav(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /account/i })).toHaveCount(0);
    await expect(wordmark(page)).toHaveCount(0);

    // UX-FL-1: its own header, with Close on the left and the progress in segments.
    const close = page.getByRole('link', { name: 'Close' });
    expect((await box(close)).x).toBeLessThan(viewport.width / 2);
    const progress = page.getByRole('list', { name: 'Add a letting' });
    await expect(progress.getByRole('listitem')).toHaveCount(3);
    await expect(progress.locator('[aria-current="step"]')).toContainText('The home');
    // Nothing is kept until the letting is saved, so nothing promises "Save and exit" yet.
    await expect(page.getByText('Save and exit')).toHaveCount(0);

    // A fixed footer with the one primary button: across the width on a phone.
    const primary = page.getByRole('button', { name: 'Continue' });
    const button = await box(primary);
    expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
    expect(button.y).toBeGreaterThan(viewport.height - 80);
    if (width === '390') expect(button.width).toBeCloseTo(viewport.width - 32, 0);
    else expect(button.width).toBeLessThan(200);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `nv-focused-task-${width}`);

    // UX-FL-3: pressing the button with errors. No box at the top; each error is at its field;
    // focus goes to the first; a screen reader hears how many.
    await primary.click();
    await expect(page.getByRole('status').filter({ hasText: 'another look' })).toHaveText(
      '4 things need another look',
    );
    await expect(page.getByText('That didn’t save yet')).toHaveCount(0);
    await expect(page.getByLabel('Address', { exact: true })).toBeFocused();
    await expect(page.locator('#field-addressLine1-error')).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `nv-focused-task-errors-${width}`);

    // An error goes as its field is edited, and comes back on leaving it with something wrong.
    const rent = page.getByLabel('Rent a month');
    await rent.fill('lots');
    await expect(page.locator('#field-rent-error')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('#field-rent-error')).toBeVisible();

    // The second step has Back in the footer, to the left of the primary button.
    await page.getByLabel('Address', { exact: true }).fill('12 Ranelagh Road');
    await page.getByLabel('Area').fill('Ranelagh, Dublin 6');
    await rent.fill('1850');
    await page.getByLabel('Available from').fill(isoDateInDays(30));
    await primary.click();
    await expect(page.getByRole('heading', { name: 'Key facts' })).toBeFocused();
    await expect(progress.locator('[aria-current="step"]')).toContainText('Key facts');
    const back = page.getByRole('button', { name: 'Back' });
    expect((await box(back)).x).toBeLessThan((await box(primary)).x);
    await expectAccessible(page);

    // Closing it goes back to where it was opened, and the navigation is there again.
    await close.click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(mainNav(page)).toBeVisible();
  }

  // From Lettings, it goes back to Lettings; and only a page of Gaff's own is ever gone back to.
  await page.goto('/lettings');
  await page.getByRole('link', { name: 'Add a letting' }).click();
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/lettings$/);
  await page.goto('/lettings/new?from=https://example.ie/today');
  await expect(page.getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/lettings');
});

test('UX-NV-7: a private landlord with one home has the same four destinations, and Lettings opens straight on that home', async ({
  page,
}) => {
  test.slow();
  // UX-AC-7: she says she's letting a home she owns, and lands in "Add your home".
  await signUpLandlord(page, 'Mary Byrne');
  await page.goto('/today');
  await expect(page).toHaveURL(/\/today$/);
  const nav = mainNav(page);
  await expect(nav.getByRole('link')).toHaveText(['Today', 'Lettings', 'Calendar', 'Inbox']);

  // No home yet: Lettings says so, with the one way to add one.
  await nav.getByRole('link', { name: 'Lettings' }).click();
  await expect(page).toHaveURL(/\/lettings$/);
  await expect(page.getByRole('heading', { name: 'No lettings yet' })).toBeVisible();

  // One home: no list of one.
  await createLettingThroughUi(page);
  const home = page.url().replace(/\/viewings.*$/, '');
  await nav.getByRole('link', { name: 'Lettings' }).click();
  await expect(page).toHaveURL(home);
  await expect(page.getByRole('heading', { level: 1, name: '12 Ranelagh Road' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Lettings' })).toHaveAttribute('aria-current', 'page');

  // Their settings are in the account menu too, and aren't called an agency's.
  const menu = await openAccountMenu(page);
  await expect(
    page.getByRole('dialog', { name: 'Account' }).getByText('My own homes'),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Agency settings' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A second home: now there is a list.
  await createLettingThroughUi(page, '4 Harbour View');
  await nav.getByRole('link', { name: 'Lettings' }).click();
  await expect(page).toHaveURL(/\/lettings$/);
  await expect(page.getByRole('link', { name: '4 Harbour View', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '12 Ranelagh Road', exact: true })).toBeVisible();
});

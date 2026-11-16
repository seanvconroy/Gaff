import { expect, type Page } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, screenshot } from './support';

/** The two widths every screen is checked at (rules for every package, 3). */
export const FRAME_WIDTHS = [390, 1280] as const;

/**
 * UX-PP-1 to UX-PP-9: the page that is open stands in the frame of every private page, at 390px
 * and at 1280px, with a screenshot of each. A renter's page carries the wordmark and "Talk to a
 * person"; an owner's or a referee's carries the agency's name, and "Run with Gaff" in its footer.
 * No page carries the old standing line about an AI assistant, or anything that invites an owner
 * or a referee to use Gaff. The page is put back to the size it was.
 */
export async function expectPrivateFrame(
  page: Page,
  frame: {
    audience: 'renter' | 'owner' | 'referee';
    /** The lister's name, where the link still names one. */
    lister: string | null;
    /** The address the home block shows, where the page is about a home. */
    home?: string;
    /** The PSRA licence the footer shows, where the lister has one. */
    licence?: string;
    /** Screenshots are saved as `<shots>-390` and `<shots>-1280`. */
    shots?: string;
  },
): Promise<void> {
  const was = page.viewportSize();
  const header = page.getByRole('banner');
  const footer = page.getByRole('contentinfo');
  for (const width of FRAME_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(`[data-frame="${frame.audience}"]`)).toBeVisible();

    if (frame.audience === 'renter') {
      await expect(header.getByRole('img', { name: 'Gaff' })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Talk to a person' })).toBeVisible();
    } else {
      await expect(header.getByRole('button', { name: 'Talk to a person' })).toHaveCount(0);
      if (frame.lister) {
        await expect(header.getByText(frame.lister, { exact: true })).toBeVisible();
        await expect(header.getByRole('img', { name: 'Gaff' })).toHaveCount(0);
      }
    }

    if (frame.home) {
      await expect(page.getByText(frame.home, { exact: true }).first()).toBeVisible();
      // UX-PP-5: one summary line: the rent, the kind of home, and a date while that's useful.
      await expect(page.getByText(/^€[\d,]+ a month · /)).toBeVisible();
      if (frame.audience === 'renter' && frame.lister) {
        await expect(page.getByText(`Let by ${frame.lister}`, { exact: true })).toBeVisible();
      }
    }

    if (frame.lister) {
      await expect(footer.getByText(frame.lister, { exact: true })).toBeVisible();
      if (frame.licence) {
        await expect(footer.getByText(`PSRA licence ${frame.licence}`)).toBeVisible();
      } else {
        await expect(footer.getByText(/PSRA licence/)).toHaveCount(0);
      }
      if (frame.audience === 'renter') {
        await expect(footer.getByRole('link', { name: 'How we use your details' })).toBeVisible();
        await expect(footer.getByText('Run with Gaff')).toHaveCount(0);
      } else {
        // UX-PP-9, Q45: one quiet line, how to reach the agency, and no way into Gaff.
        await expect(footer.getByText('Run with Gaff', { exact: true })).toBeVisible();
        await expect(footer.getByText(`To reach ${frame.lister}, reply to their email.`)).toBeVisible();
        await expect(footer.getByRole('link')).toHaveCount(0);
        await expect(page.getByText(/sign up for gaff|try gaff|create an account/i)).toHaveCount(0);
      }
    } else {
      await expect(footer).toHaveCount(0);
    }

    // UX-PP-3, UX-PP-6 (Q46): the frame carries no standing line about the assistant.
    await expect(page.getByText(/AI letting assistant/)).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    if (frame.shots) await screenshot(page, `${frame.shots}-${width}`);
  }
  if (was) await page.setViewportSize(was);
}

/**
 * UX-PP-3, UX-AI-2 (rule 6): "Talk to a person" opens a sheet, focus goes into it and stays in
 * it, Escape closes it, and focus goes back to the button. Replying to any email is always
 * offered; a phone number only where the lister has one.
 */
export async function expectTalkToAPerson(
  page: Page,
  expected: { lister: string | null; phone?: string; shots?: string },
): Promise<void> {
  const open = page.getByRole('button', { name: 'Talk to a person' });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Talk to a person' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Reply to any email', { exact: true })).toBeVisible();
  await expect(
    sheet.getByText(
      expected.lister
        ? `Reply to any email from us and say you’d like to talk to a person. Someone at ${expected.lister} will answer you.`
        : 'Reply to any email from us and say you’d like to talk to a person. Someone will answer you.',
    ),
  ).toBeVisible();
  if (expected.phone) {
    const ring = sheet.getByRole('link', { name: `Ring ${expected.phone}` });
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute('href', `tel:${expected.phone.replace(/[^\d+]/g, '')}`);
  } else {
    await expect(sheet.getByRole('link')).toHaveCount(0);
    await expect(sheet.getByText(/Ring /)).toHaveCount(0);
  }
  await expectAccessible(page);
  if (expected.shots) await screenshot(page, expected.shots);

  // Focus is inside the sheet, and Tab never leaves it.
  const inside = () => sheet.evaluate((el) => el.contains(document.activeElement));
  expect(await inside(), 'focus moved into the sheet').toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(), 'focus stays in the sheet').toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await inside(), 'focus stays in the sheet going back').toBe(true);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();

  // The Done button closes it too, and focus comes back the same way.
  await open.click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
}

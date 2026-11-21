import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadTokens } from '../../scripts/tokens/lib';
import {
  expectAccessible,
  expectFocusRings,
  expectNoSidewaysScroll,
  screenshot,
  settled,
} from './support';

/**
 * Work package WP-2: the design system's components, on the development page that shows each one
 * and its states (/dev/ui) and the flow shell's example (/dev/ui/flow). Nothing here touches the
 * database. The clock is fixed, so the calendar always opens on the same month.
 */
const tokens = loadTokens();
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

/** Sunday 15 November 2026, midday in Ireland. */
const NOW = new Date('2026-11-15T12:00:00Z');

async function open(page: Page, path = '/dev/ui', viewport = desktop): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize(viewport);
  await page.goto(path);
}

const focused = (page: Page) => page.locator(':focus');

/** Whether focus is anywhere it shouldn't be while a sheet, menu or picker is open. */
const focusEscaped = (dialog: Locator) =>
  dialog.evaluate((el) => {
    const active = document.activeElement;
    return !!active && active !== document.body && !el.contains(active);
  });

test('UX-DS-16: the component page shows every component and its states at 390px and 1280px, in light and dark, with no accessibility problems', async ({
  page,
}) => {
  test.slow();
  for (const [name, viewport] of widths) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await open(page, '/dev/ui', viewport);
      await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
      for (const component of [
        'Wordmark',
        'Colour',
        'Type',
        'Button',
        'Field',
        'Choice card and choice row',
        'Option row',
        'Chips',
        'Segmented progress',
        'Sheet and dialog, menu, toast',
        'Date and time pickers',
        'Address search',
        'Place search',
        'Photo uploader',
        'Code input',
        'Skeleton',
        'Avatar and badge',
        'Status pill, notice and outcome',
        'Cards, rows and lists',
        'Calendar',
        'Search box with chips',
        'Home card',
        'Thread and reply box',
      ]) {
        await expect(
          page.getByRole('heading', { level: 2, name: component, exact: true }),
        ).toBeVisible();
      }
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        rgb(tokens.colors['surface-0']![colorScheme]),
      );
      await expectNoSidewaysScroll(page);
      await expectAccessible(page);
      await screenshot(page, `ui-components-${name}-${colorScheme}`);
    }
  }
});

test('UX-DS-13, UX-DS-15: every button, input and select is 48px high, and nothing has a target under 44px, at both widths', async ({
  page,
}) => {
  // expectAccessible measures every control and target on the page (tests/e2e/support.ts), so
  // every journey holds its own screens to this. Here: the components, and what they open.
  for (const [, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'More for 12 Ranelagh Road' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Viewing date' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Until' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await open(page, '/dev/ui/flow?step=3', viewport);
    await expectAccessible(page);

    // The sizes themselves: a button, a field, a select and a picker are all 48px.
    await open(page, '/dev/ui', viewport);
    for (const control of [
      page.getByRole('button', { name: 'Send invitations' }),
      page.getByRole('button', { name: 'Not now', exact: true }),
      page.getByLabel('Address', { exact: true }),
      page.getByLabel('Type of home'),
      page.getByRole('button', { name: 'Viewing date' }),
      page.getByRole('button', { name: 'More for 12 Ranelagh Road' }),
    ]) {
      expect((await control.boundingBox())!.height).toBe(48);
    }
  }
});

test('UX-DS-14: an input is short, medium or the full width of its column', async ({ page }) => {
  await open(page);
  const width = async (label: string) =>
    (await page.getByLabel(label, { exact: true }).boundingBox())!.width;
  expect(await width('Eircode (optional)')).toBe(parseFloat(tokens.sizes['size-field-short']!));
  expect(await width('PSRA licence number')).toBe(parseFloat(tokens.sizes['size-field-medium']!));
  expect(await width('Address')).toBe(parseFloat(tokens.sizes['size-task']!));
});

test('UX-DS-2, UX-DS-3: the primary button is ink; a chosen card takes the brand edge and tint; a status never borrows the brand colour', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Send invitations' })).toHaveCSS(
    'background-color',
    rgb(tokens.colors['ink']!.light),
  );
  await expect(page.getByRole('button', { name: 'Remove from the team' })).toHaveCSS(
    'background-color',
    rgb(tokens.colors['danger']!.light),
  );

  // Choice cards are real radios: the arrows move the choice, and the chosen card is marked.
  const cards = page.getByRole('group', { name: 'Who are you letting for?' });
  const mine = cards.getByRole('radio', { name: 'My own home' });
  const agency = cards.getByRole('radio', { name: 'Other people' });
  await expect(mine).toBeChecked();
  await mine.focus();
  await page.keyboard.press('ArrowRight');
  await expect(agency).toBeChecked();
  const chosen = cards
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: 'Other people' }) });
  await expect(chosen).toHaveCSS('border-top-color', rgb(tokens.colors['brand']!.light));
  await expect(chosen).toHaveCSS('background-color', rgb(tokens.colors['brand-bg']!.light));
  expect((await chosen.boundingBox())!.height).toBeGreaterThanOrEqual(72);

  // The assistant's work carries Gaff's colour; information stays teal.
  await expect(page.getByText('Drafted by AI').first()).toHaveCSS(
    'color',
    rgb(tokens.colors['brand-text']!.light),
  );
  await expect(page.getByText('Viewing booked', { exact: true }).last()).toHaveCSS(
    'color',
    rgb(tokens.colors['info']!.light),
  );
});

test('UX-DS-23: the wordmark is a drawing named "Gaff", and its small size is 20px high', async ({
  page,
}) => {
  await open(page);
  const marks = page.getByRole('main').getByRole('img', { name: 'Gaff' });
  await expect(marks).toHaveCount(2);
  expect((await marks.nth(1).boundingBox())!.height).toBeCloseTo(20, 0);
  // Nothing clips the drawing: a clip snapped to whole pixels would shave the foot of the "g".
  await expect(marks.first()).toHaveCSS('overflow', 'visible');
  // Its lettering is outlines: no text is set, so no font is needed for it.
  await expect(marks.first().locator('path')).toHaveCount(2);
  expect(await marks.first().textContent()).toBe('');
  await expect(marks.first().locator('path').last()).toHaveCSS(
    'fill',
    rgb(tokens.colors['brand']!.light),
  );
});

test('UX-DS-21: a sheet is a dialog in the middle on a desktop and slides up from the bottom on a phone; focus stays inside, Escape closes it, and focus returns', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const opener = page.getByRole('button', { name: 'Change the viewing time' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Change the viewing time' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused();

    // UX-DS-27: two layouts, either side of 900px.
    await settled(page);
    const box = (await sheet.boundingBox())!;
    if (name === '390') {
      expect(box.width).toBe(390);
      expect(box.y + box.height).toBeCloseTo(844, 0);
    } else {
      expect(box.width).toBe(480);
      expect(box.x + box.width / 2).toBeCloseTo(640, 0);
      expect(box.y + box.height).toBeLessThan(800);
    }
    await expectAccessible(page);
    await screenshot(page, `ui-sheet-${name}`);

    // Tab goes round the sheet's own controls and never reaches the page behind.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await focusEscaped(sheet), 'focus left the sheet').toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();

    // Closed and opened again at once, it stays open: the first close's late event can't shut it.
    await page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
    await expect(sheet).toBeVisible();

    // Its own buttons close it too, and focus returns the same way.
    await sheet.getByRole('button', { name: 'Save the new time' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Moved to 6:30pm.')).toBeVisible();
    await expect(opener).toBeFocused();
  }
});

test('UX-DS-21: a menu opens beside its button on a desktop and as a sheet on a phone; the arrows move, Enter chooses, Escape and Tab close it, and focus returns', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const button = page.getByRole('button', { name: 'More for 12 Ranelagh Road' });
    const menu = page.getByRole('menu', { name: 'More for 12 Ranelagh Road' });
    const item = (label: string) => menu.getByRole('menuitem', { name: label });
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(item('Edit the home')).toBeFocused();

    await settled(page);
    const panel = (await page.getByRole('dialog').boundingBox())!;
    const anchor = (await button.boundingBox())!;
    if (name === '390') {
      expect(panel.width).toBe(390);
      expect(panel.y + panel.height).toBeCloseTo(844, 0);
    } else {
      expect(panel.x).toBeCloseTo(anchor.x, 0);
      expect(panel.y).toBeCloseTo(anchor.y + anchor.height + 8, 0);
    }
    await expectAccessible(page);
    await screenshot(page, `ui-menu-${name}`);

    await page.keyboard.press('ArrowDown');
    await expect(item('Share with the owner')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item('Withdraw this letting')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item('Edit the home')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(item('Withdraw this letting')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(item('Edit the home')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();

    // The down arrow opens it too; Enter chooses; focus goes back to the button.
    await page.keyboard.press('ArrowDown');
    await expect(item('Edit the home')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(page.getByText('You chose: Share with the owner.')).toBeVisible();
    await expect(button).toBeFocused();

    // Tab closes it rather than wandering off into the page.
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test('UX-DS-21: the date picker shows dates in words, works by keyboard (arrows, Home, End, Page Up and Down, Enter, Escape) and never offers a date outside its range', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const field = page.getByRole('button', { name: 'Viewing date' });
    await expect(field).toContainText('Choose a date');
    // No browser date control anywhere among the new components.
    await expect(page.locator('input[type=date], input[type=time]')).toHaveCount(0);

    await field.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Choose a date' });
    await expect(picker).toBeVisible();
    const month = picker.getByRole('heading', { level: 3 });
    await expect(month).toHaveText('November 2026');
    // Monday first.
    await expect(picker.getByRole('columnheader').first()).toHaveText('Mo');
    // Today is Sunday 15 November; the earliest date allowed is the 16th, so that has focus.
    await expect(focused(page)).toHaveAccessibleName('Monday 16 November');
    await expect(picker.getByRole('button', { name: 'Sunday 15 November' })).toBeDisabled();
    await expect(picker.getByRole('button', { name: 'Sunday 15 November' })).toHaveAttribute(
      'aria-current',
      'date',
    );
    await expect(picker.getByRole('button', { name: 'Previous month' })).toBeDisabled();

    await settled(page);
    if (name === '390') {
      const box = (await picker.boundingBox())!;
      expect(box.width).toBe(390);
      expect(box.y + box.height).toBeCloseTo(844, 0);
    } else {
      const box = (await picker.boundingBox())!;
      const anchor = (await field.boundingBox())!;
      expect(box.x).toBeCloseTo(anchor.x, 0);
      expect(box.width).toBeLessThan(400);
    }
    await expectAccessible(page);
    await screenshot(page, `ui-date-picker-${name}`);

    await page.keyboard.press('ArrowLeft'); // can't go before the earliest date
    await expect(focused(page)).toHaveAccessibleName('Monday 16 November');
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveAccessibleName('Tuesday 17 November');
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveAccessibleName('Tuesday 24 November');
    await page.keyboard.press('End');
    await expect(focused(page)).toHaveAccessibleName('Sunday 29 November');
    await page.keyboard.press('Home');
    await expect(focused(page)).toHaveAccessibleName('Monday 23 November');
    await page.keyboard.press('ArrowUp');
    await expect(focused(page)).toHaveAccessibleName('Monday 16 November');
    await page.keyboard.press('PageDown');
    await expect(month).toHaveText('December 2026');
    await expect(focused(page)).toHaveAccessibleName('Wednesday 16 December');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown'); // past the latest date: it stops there
    await expect(month).toHaveText('January 2027');
    await expect(focused(page)).toHaveAccessibleName('Sunday 31 January 2027');
    await expect(picker.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await page.keyboard.press('PageUp');
    await expect(focused(page)).toHaveAccessibleName('Thursday 31 December');

    // Tab reaches the month buttons and stays in the picker.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await focusEscaped(picker), 'focus left the date picker').toBe(false);
    }

    // Escape closes it with nothing chosen.
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toContainText('Choose a date');

    // Enter chooses: the field says the date in words, and the form gets the date it expects.
    await page.keyboard.press('ArrowDown');
    await expect(picker).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(picker).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toContainText('Tuesday 17 November');
    await expect(field).toHaveAccessibleName('Viewing date Tuesday 17 November');
    await expect(page.locator('input[name="demo-date"]')).toHaveValue('2026-11-17');

    // It opens again on what was chosen, and a press on a day chooses that day.
    await field.click();
    await expect(focused(page)).toHaveAccessibleName('Tuesday 17 November');
    await expect(focused(page)).toHaveAttribute('aria-pressed', 'true');
    await picker.getByRole('button', { name: 'Next month' }).click();
    await picker.getByRole('button', { name: 'Friday 4 December' }).click();
    await expect(field).toContainText('Friday 4 December');
    await expect(page.locator('input[name="demo-date"]')).toHaveValue('2026-12-04');

    // A field that needs another look says so in words, tied to the control.
    await expect(page.getByRole('button', { name: 'Pay by' })).toHaveAccessibleDescription(
      /Choose a date to pay by/,
    );
  }
});

test('UX-DS-21: the time picker lists times as "6:30pm", works by keyboard (arrows, Home, End, Enter, Escape) and returns focus', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const field = page.getByRole('button', { name: 'Until' });
    await expect(field).toContainText('6:30pm');
    await field.focus();
    await page.keyboard.press('Enter');
    const list = page.getByRole('listbox', { name: 'Choose a time' });
    await expect(list).toBeVisible();
    await expect(focused(page)).toHaveText('6:30pm');
    await expect(focused(page)).toHaveAttribute('aria-selected', 'true');
    await expectAccessible(page);
    await screenshot(page, `ui-time-picker-${name}`);

    await settled(page);
    const panel = (await page.getByRole('dialog', { name: 'Choose a time' }).boundingBox())!;
    if (name === '390') expect(panel.width).toBe(390);
    else expect(panel.y + panel.height).toBeLessThanOrEqual(800);

    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveText('6:45pm');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(focused(page)).toHaveText('6:15pm');
    await page.keyboard.press('Home');
    await expect(focused(page)).toHaveText('7am');
    await page.keyboard.press('ArrowUp'); // nothing before the first
    await expect(focused(page)).toHaveText('7am');
    await page.keyboard.press('End');
    await expect(focused(page)).toHaveText('10pm');

    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toContainText('6:30pm');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toContainText('7pm');
    await expect(page.locator('input[name="demo-time-chosen"]')).toHaveValue('19:00');

    // A press chooses too. This one runs from 8am to 9pm, every half hour.
    const from = page.locator('#field-demo-time');
    await from.click();
    await expect(focused(page)).toHaveText('8am');
    await page.getByRole('option', { name: '9:30am' }).click();
    await expect(from).toContainText('9:30am');
    await expect(page.locator('input[name="demo-time"]')).toHaveValue('09:30');
  }
});

test('the code input is six boxes with the number keyboard; it takes typing and a paste, and sends itself when the sixth digit goes in', async ({
  page,
}) => {
  for (const [, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const code = page.getByLabel('Enter the 6-digit code', { exact: true });
    await expect(code).toHaveAttribute('inputmode', 'numeric');
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    const boxes = page
      .locator('div')
      .filter({ has: code })
      .last()
      .locator('[aria-hidden="true"] > span');
    await expect(boxes).toHaveCount(6);

    // Letters are left out; five digits don't send it.
    await code.focus();
    await page.keyboard.type('4a8 29-1');
    await expect(code).toHaveValue('48291');
    await expect(boxes.nth(4)).toHaveText('1');
    await expect(
      page.getByText('When the sixth digit goes in, the code sends itself.'),
    ).toBeVisible();
    await page.keyboard.type('3');
    await expect(page.getByText('Sent 482913 without a button.')).toBeVisible();

    // A paste with a space in it, or a whole sentence, works.
    await code.fill('');
    await code.evaluate((input) => {
      const data = new DataTransfer();
      data.setData('text', 'Your Gaff code is 731 204.');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
    await expect(code).toHaveValue('731204');
    await expect(page.getByText('Sent 731204 without a button.')).toBeVisible();

    // A wrong code says what to do, at the field.
    await expect(
      page.getByLabel('Enter the 6-digit code (wrong code)', { exact: true }),
    ).toHaveAccessibleDescription(/That code isn’t right/);
  }
});

test('a toast says what happened and offers Undo, bottom left on a desktop and above the tab bar on a phone, without taking focus', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui', viewport);
    const remove = page.getByRole('button', { name: 'Remove a viewing time' });
    await remove.click();
    const toast = page.getByRole('status').filter({ hasText: 'Viewing time removed' });
    await expect(toast).toBeVisible();
    await expect(remove).toBeFocused();
    await expect(page.getByText(/11am is removed/)).toBeVisible();

    await settled(page);
    const box = (await toast.getByText('Viewing time removed').locator('..').boundingBox())!;
    if (name === '390') {
      expect(box.width).toBe(390 - 32);
      // Clear of a 64px tab bar at the foot of the screen.
      expect(box.y + box.height).toBeLessThanOrEqual(844 - 64);
    } else {
      expect(box.x).toBe(24);
      expect(box.y + box.height).toBe(800 - 24);
    }
    await expectAccessible(page);
    await screenshot(page, `ui-toast-${name}`);

    // The clock is fixed in this test, so the toast is still here: Undo takes the action back.
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/11am is in the calendar/)).toBeVisible();
    await expect(toast).toBeHidden();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  }
});

test('UX-DS-27: chips scroll sideways on a phone and wrap on a desktop; segmented progress names the current part on a phone and every part on a desktop', async ({
  page,
}) => {
  await open(page, '/dev/ui', phone);
  const chips = page.getByRole('group', { name: 'When do you want to move in?' });
  const scrolls = (group: Locator) =>
    group
      .locator('div')
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(await scrolls(chips)).toBe(true);
  await expectNoSidewaysScroll(page);
  // The last chip can be reached: it scrolls into view and takes the choice.
  await chips.getByRole('radio', { name: 'I’m not sure yet' }).check();
  await expect(chips.getByRole('radio', { name: 'I’m not sure yet' })).toBeChecked();

  const progress = page.getByRole('list', { name: '12 Ranelagh Road' });
  await expect(progress.getByRole('listitem')).toHaveCount(4);
  await expect(progress.locator('[aria-current="step"]')).toHaveText('Viewings');
  const beside = progress.locator('..').locator('p');
  await expect(beside).toBeVisible();
  await expect(beside).toHaveText('Viewings');
  // More than six steps: the words say which step.
  await expect(page.getByText('Step 3 of 8 · The home')).toBeVisible();

  await open(page, '/dev/ui', desktop);
  expect(await scrolls(chips)).toBe(false);
  await expect(beside).toBeHidden();
  const tops = await progress
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => item.lastElementChild!.getBoundingClientRect().height),
    );
  expect(tops.every((height) => height >= 16)).toBe(true);
  // Done and current parts take the brand colour; the rest wait in grey.
  const bars = await progress
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => getComputedStyle(item.firstElementChild!).backgroundColor),
    );
  expect(bars).toEqual([
    rgb(tokens.colors['brand']!.light),
    rgb(tokens.colors['brand']!.light),
    rgb(tokens.colors['border']!.light),
    rgb(tokens.colors['border']!.light),
  ]);
});

test('UX-NV-12, UX-DS-10: home cards are one column on a phone and three across on a desktop; the photo is 3:2 with 16px corners, a home without one shows a house icon, and the whole card is one link', async ({
  page,
}) => {
  const homes = page.getByRole('list', { name: 'Homes' });
  const cards = homes.getByRole('listitem');
  const lefts = async () =>
    new Set(await cards.evaluateAll((items) => items.map((i) => i.getBoundingClientRect().left)));

  await open(page, '/dev/ui', phone);
  await expect(cards).toHaveCount(4);
  expect((await lefts()).size).toBe(1);
  await expectNoSidewaysScroll(page);

  await open(page, '/dev/ui', desktop);
  expect((await lefts()).size).toBe(3);
  // The fourth card wraps to a second row, under the first.
  const tops = await cards.evaluateAll((items) => items.map((i) => i.getBoundingClientRect().top));
  expect(tops[3]).toBeGreaterThan(tops[0]!);

  // UX-DS-10: the photo, or its placeholder, is 3:2 with 16px corners; never a broken image.
  const first = cards.nth(0);
  const frames = await cards.evaluateAll((items) =>
    items.map((item) => {
      const frame = item.firstElementChild!;
      const box = frame.getBoundingClientRect();
      return {
        ratio: Math.round((box.width / box.height) * 100) / 100,
        radius: getComputedStyle(frame).borderTopLeftRadius,
      };
    }),
  );
  expect(frames).toEqual(Array(4).fill({ ratio: 1.5, radius: '16px' }));
  // The photo loads as it comes into view.
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('img')).toHaveJSProperty('complete', true);
  expect(
    await first.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(cards.nth(1).locator('img')).toHaveCount(0);
  await expect(cards.nth(1).locator('svg')).toBeVisible();

  // One link a card, named by the address alone; a press anywhere on the card lands on it.
  await expect(homes.getByRole('link')).toHaveCount(4);
  const link = first.getByRole('link', { name: '12 Ranelagh Road', exact: true });
  await first.scrollIntoViewIfNeeded();
  const photo = (await first.locator('img').boundingBox())!;
  expect(
    await link.evaluate((el, at) => el.contains(document.elementFromPoint(at.x, at.y)), {
      x: photo.x + photo.width / 2,
      y: photo.y + photo.height / 2,
    }),
  ).toBe(true);
  // "Needs you" is words with its dot, never the dot alone.
  await expect(first.getByText('Needs you')).toBeVisible();
  await expect(cards.nth(1).getByText('Needs you')).toHaveCount(0);
});

test('the flow shell fills a phone, with a fixed footer whose primary button spans the width; on a desktop the same header and footer hold a 640px column', async ({
  page,
}) => {
  for (const [name, viewport] of widths) {
    await open(page, '/dev/ui/flow', viewport);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who are you letting for?' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save and exit' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Add a letting' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveCount(0);
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, `ui-flow-${name}`);

    // The footer is fixed to the foot of the screen, 80px high, with the one primary button.
    const footer = (await page.getByRole('contentinfo').boundingBox())!;
    expect(footer.y + footer.height).toBeCloseTo(viewport.height, 0);
    expect(footer.height).toBeCloseTo(81, 0); // 80px and its hairline
    const next = page.getByRole('link', { name: 'Continue' });
    const button = (await next.boundingBox())!;
    expect(button.height).toBe(48);
    if (name === '390') expect(button.width).toBe(390 - 32);
    else expect(button.width).toBeLessThan(200);

    // The same steps, in the same order, with the same words at either width (UX-DS-25).
    await next.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'When is it free, and what’s the rent?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Add a letting' }).locator('[aria-current]'),
    ).toHaveText('The home');
    const column = (await page.getByRole('main').boundingBox())!;
    if (name === '1280') expect(column.width).toBe(640 + 32);
    else expect(column.width).toBe(390);
    await next.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'When can people view?' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ui-flow-last-step-${name}`);
    await expect(page.getByRole('link', { name: 'Finish' })).toBeVisible();

    // Back, in the footer and at the top, goes to the step before.
    await page.getByRole('contentinfo').getByRole('link', { name: 'Back' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'When is it free, and what’s the rent?' }),
    ).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: 'Back' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who are you letting for?' }),
    ).toBeVisible();
  }
});

test('M56: with its suggestions open, Tab leaves the place search for the next control; the credit in the list is a link, and never a stop that closes under the focus', async ({
  page,
}) => {
  await open(page);
  const where = page.getByRole('combobox', { name: 'Where' });
  const kinsale = page.getByRole('option', { name: /^Kinsale Town in County Cork/ });
  await where.focus();
  await expect(kinsale).toBeVisible();
  await expect(page.getByRole('link', { name: 'Places from OpenStreetMap' })).toHaveAttribute(
    'href',
    '/map-and-place-data',
  );

  // Tab leaves without picking: the list closes, and focus is on the next control in the page,
  // whichever that is, not lost.
  await page.keyboard.press('Tab');
  await expect(kinsale).toBeHidden();
  await expect(where).toHaveValue('');
  await expect(where).not.toBeFocused();
  await expect(focused(page)).toHaveCount(1);
});

test('UX-DS-20: with reduced motion on, sheets, steps and toasts arrive without moving; every stop on the component page shows the focus ring', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Change the viewing time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Change the viewing time' });
  await expect(sheet).toHaveCSS('animation-duration', '0.32s');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Change the viewing time' }).click();
  await expect(sheet).toHaveCSS('animation-duration', '0s');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true }).locator('..')).toHaveCSS(
    'animation-duration',
    '0s',
  );

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  // The pin picker draws its pin once the map knows its size, a moment after the page loads.
  // Wait for it, and hold that it was one of the stops, so it is checked on every run.
  const pin = page.getByRole('button', { name: 'The home’s pin' });
  await expect(pin).toBeVisible();
  const stops = await expectFocusRings(page);
  expect(stops, 'the stops that were checked').toContain('The home’s pin');
});

test('UX-NV-14, UX-NV-15: the thread and reply box: one screen at a time on a phone, the list beside the conversation on a desktop, with the draft and its gap in the reply box', async ({
  page,
}) => {
  const closed = page.getByRole('list', { name: 'Conversations', exact: true });
  const beside = page.getByRole('list', { name: 'Conversations, with one open' });
  const choose = page.getByRole('heading', { name: 'Choose a conversation' });
  const conversation = page.getByRole('region', { name: 'Aoife Byrne' });
  const back = conversation.getByRole('link', { name: 'Inbox' });

  // A phone: the list is a screen, and the open conversation is a screen with a way back.
  await open(page, '/dev/ui', phone);
  await expect(closed).toBeVisible();
  await expect(choose).toBeHidden();
  await expect(beside).toBeHidden();
  await expect(conversation).toBeVisible();
  await expect(back).toBeVisible();
  await expectNoSidewaysScroll(page);

  // A desktop: the list on the left, the conversation on the right, and nothing to go back to.
  await open(page, '/dev/ui', desktop);
  await expect(closed).toBeVisible();
  await expect(choose).toBeVisible();
  await expect(back).toBeHidden();
  const list = (await beside.boundingBox())!;
  const pane = (await conversation.boundingBox())!;
  expect(list.x + list.width).toBeLessThanOrEqual(pane.x);
  // The open conversation is marked in the list for screen readers, and each row is one link.
  await expect(beside.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(beside.getByRole('listitem').nth(0).getByRole('link')).toHaveCount(1);
  // What is waiting is said in words.
  await expect(beside.getByRole('listitem').nth(0)).toContainText('Needs you');
  await expect(beside.getByRole('listitem').nth(2)).toContainText('Tom · Owner');

  // Theirs on the left, ours on the right; the assistant's are marked as the assistant's.
  const messages = page.getByRole('list', { name: 'Messages with Aoife' }).getByRole('listitem');
  await expect(messages).toHaveCount(5);
  const thread = (await page.getByRole('list', { name: 'Messages with Aoife' }).boundingBox())!;
  const theirs = (await messages.nth(0).boundingBox())!;
  const ours = (await messages.nth(2).boundingBox())!;
  expect(theirs.x).toBeCloseTo(thread.x, 0);
  expect(ours.x + ours.width).toBeCloseTo(thread.x + thread.width, 0);
  await expect(messages.nth(1)).toContainText('Gaff, the assistant');
  await expect(messages.nth(2)).not.toContainText('the assistant');
  await expect(messages.nth(3)).toContainText('Sending…');
  // A message that didn't go says so in words, with an icon, in warning.
  await expect(messages.nth(4)).toContainText('Not sent');
  await expect(messages.nth(4)).toContainText('by text');

  // The reply box: the draft, the "Drafted by AI" pill, the gap with its field and one tick.
  const reply = page.getByRole('region', { name: 'Reply to Aoife' });
  await expect(reply.getByText('Drafted by AI')).toBeVisible();
  await expect(reply.getByLabel('Gaff doesn’t know: Is there a garden?')).toBeVisible();
  await expect(reply.getByLabel('Remember this for 12 Ranelagh Road')).toBeChecked();
  await expect(reply.getByRole('button')).toHaveText(['Send', 'Edit', 'Don’t send']);
});

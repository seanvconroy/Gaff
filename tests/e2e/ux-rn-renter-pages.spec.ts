import { expect, test, type Page } from '@playwright/test';
import {
  expectOnePrimary,
  expectRenterPage,
  RENTER_NOTICES,
  WIDTHS,
  type RenterNotice,
} from './renter';
import { expectAccessible, screenshot, settled } from './support';

/**
 * Work package WP-12: every page a renter or a tenant can see (UX-RN-1 to UX-RN-26), drawn from
 * made-up details at `/dev/ui/renter`, so each is checked without walking a whole letting to
 * reach it. The journeys (R9, R12, R15 to R26) walk the same pages for real.
 *
 * Each page, at 390px and 1280px: the renter's frame; WCAG 2.2 AA, 48px controls and 44px
 * targets; one primary button at most; nothing to read under 16px; only its own notices out of
 * the four the redesign allows; and a screenshot (screenshots/wp12-<page>-<width>.png).
 */

const page_ = (name: string) => `/dev/ui/renter?page=${name}`;

/** Which of the four notices (UX-PP-6) each page carries. Every other page carries none. */
const notices: Record<string, RenterNotice[]> = {
  'checks-id': ['check'],
  'checks-documents': ['check'],
  'checks-documents-read': ['check'],
  'checks-references': ['check'],
  'checks-arranged': ['check'],
  offer: ['fees'],
  pay: ['ring'],
  'pay-no-number': ['ring'],
  'offer-closed': ['deletion'],
  'offer-declined': ['deletion'],
  'home-let': ['deletion'],
  'home-closed': ['deletion'],
};

const groups: Array<[string, string[]]> = [
  [
    'UX-RN-2 to UX-RN-4: the questions, and “Thanks”',
    ['questions', 'questions-change', 'answers-sent'],
  ],
  [
    'UX-RN-5 to UX-RN-10: viewings',
    [
      'invited',
      'choose-time',
      'choose-time-day',
      'choose-time-gone',
      'confirm-time',
      'confirm-time-problem',
      'confirm-time-mobile-confirmed',
      'confirm-code',
      'confirm-code-wrong',
      'booked',
      'change-time',
      'confirm-move',
      'cancel',
      'cancelled',
      'no-times',
      'waiting-list',
      'place-offered',
      'place-open-to-all',
      'hold-ran-out',
      'not-invited-yet',
      'missed-viewing',
    ],
  ],
  [
    'UX-RN-11 to UX-RN-13: applying',
    ['after-viewing', 'apply', 'apply-check', 'apply-kept', 'applied'],
  ],
  [
    'UX-RN-14 to UX-RN-18: the checks',
    [
      'checks-start',
      'checks-id',
      'checks-id-no-tries',
      'checks-references',
      'checks-documents',
      'checks-documents-read',
      'checks-share',
      'checks-arranged',
      'checks-done',
    ],
  ],
  ['UX-RN-19, UX-RN-20: the offer', ['offer', 'decline', 'offer-closed', 'offer-declined']],
  [
    'UX-RN-21 to UX-RN-26: the tenancy',
    [
      'tenancy-agreement-coming',
      'tenancy-sign',
      'tenancy-countersign',
      'tenancy-payment-coming',
      'tenancy-pay',
      'pay',
      'pay-no-number',
      'pay-code',
      'pay-received',
      'tenancy-pps',
      'tenancy-inventory',
      'inventory',
      'inventory-confirmed',
      'tenancy-moving-in',
      'tenancy-moved-in',
    ],
  ],
  [
    'Outcomes and states: the home is let or gone, a link that has ended, loading, and a page that couldn’t load',
    ['home-let', 'home-closed', 'link-ended', 'loading', 'failed'],
  ],
];

for (const [title, names] of groups) {
  test(`${title}: one task, one primary button, nothing under 16px, only the four notices, at 390px and 1280px`, async ({
    page,
  }) => {
    test.slow();
    // Monday 16 November 2026, 10am in Ireland: the day the made-up details were written on.
    await page.clock.setFixedTime(new Date('2026-11-16T10:00:00Z'));
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      for (const name of names) {
        await page.goto(page_(name));
        await expectRenterPage(page, {
          notices: notices[name] ?? [],
          shots: `wp12-${name}-${width}`,
        });
      }
    }
  });
}

test('UX-PP-6 (Q46): across every page there are four notices, and each is on a page', async ({
  page,
}) => {
  await page.goto('/dev/ui/renter');
  const all = await page
    .getByRole('main')
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('page') ?? ''),
    );
  // Every made-up page is in a group above, so none escapes the checks.
  const checked = groups.flatMap(([, names]) => names);
  expect(all.filter(Boolean).sort()).toEqual([...checked].sort());
  expect([...new Set(Object.values(notices).flat())].sort()).toEqual([...RENTER_NOTICES].sort());
});

async function at390(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(page_(name));
}

test('UX-RN-2, UX-RN-4: the questions are one per screen, answered with taps, and no answer ends the path', async ({
  page,
}) => {
  await at390(page, 'questions');
  const question = (name: string | RegExp) => page.getByRole('heading', { level: 2, name });
  const next = page.getByRole('button', { name: 'Next', exact: true });

  // One question at a time, with the progress beside it and only "Next".
  await expect(question('How many people would live here, including you?')).toBeVisible();
  await expect(question('Do you have any pets?')).toBeHidden();
  await expect(page.getByRole('list', { name: 'A few quick questions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);

  // UX-DS-18: pressing on without an answer says what to do, at the field. No box at the top.
  await next.click();
  await expect(
    page.getByText('Choose how many people would live here, including you'),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('1 thing needs another look');
  await expectAccessible(page);

  // "6 or more" asks for the number, so the answer is exact. Six people is an answer like any.
  await page.getByRole('radio', { name: '6 or more' }).check();
  await page.getByLabel('How many people?').fill('7');
  await next.click();

  // The step is in the address, and it holds no answer.
  await expect(question('Do you have any pets?')).toBeVisible();
  await expect(page).toHaveURL(/\?page=questions&q=pets$/);
  await expect(page.getByText('Assistance dogs don’t count as pets.')).toBeVisible();
  // UX-RN-4: "Yes" to pets is an answer, not a refusal. The next question follows.
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await next.click();

  await expect(question('Could you move in by Sunday 13 December?')).toBeVisible();
  await page.getByRole('radio', { name: 'No, I’d need later' }).check();
  await expect(page.getByRole('button', { name: /When could you move in\?/ })).toBeVisible();
  await next.click();
  await expect(page.getByText('Choose the date you could move in')).toBeVisible();
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await next.click();

  await expect(question('How long would you like to stay?')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Under a year' })).toBeVisible();
  await page.getByRole('radio', { name: 'Under a year' }).check();
  // The last screen's button sends them. Nothing on the way said "sorry" or stopped them.
  await expect(page.getByRole('button', { name: 'Send my answers' })).toBeVisible();
  expect(await page.getByRole('main').innerText()).not.toMatch(
    /sorry|unfortunately|not suitable|don’t qualify|can’t apply|not eligible/i,
  );
  await expectOnePrimary(page);

  // Back, by the button and by the browser, keeps what was answered.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(question('Could you move in by Sunday 13 December?')).toBeVisible();
  await page.goBack();
  await expect(question('Do you have any pets?')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Yes', exact: true })).toBeChecked();

  // UX-RN-17: a link to a later screen opens it once the ones before are answered.
  await page.goto(page_('questions-change') + '&q=staying');
  await expect(question('How long would you like to stay?')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'A year', exact: true })).toBeChecked();
  // With nothing answered, the same address starts at the first question.
  await page.goto(page_('questions') + '&q=staying');
  await expect(question('How many people would live here, including you?')).toBeVisible();
});

test('UX-RN-3: all four questions are answered in eight taps, with nothing to type', async ({
  page,
}) => {
  await at390(page, 'questions');
  // Under 45 seconds for all four: one tap to answer and one to move on, each time.
  let taps = 0;
  for (const answer of ['2', 'No', 'Yes', 'A year']) {
    await expect(
      page.getByRole('main').locator('input:not([type=radio], [type=hidden]):visible, textarea'),
    ).toHaveCount(0);
    await page.getByRole('radio', { name: answer, exact: true }).check();
    await page.getByRole('button', { name: /^(Next|Send my answers)$/ }).click();
    taps += 2;
  }
  expect(taps).toBe(8);
  // The last tap sent them (to a made-up link, which says so). Nothing else was asked.
  await expect(page.getByText(/This link has ended\./)).toBeVisible();
});

test('UX-RN-5, UX-RN-6, UX-RN-8, UX-RN-10: days then times, a held place with no picker, and the booked page’s actions', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-16T10:00:00Z'));
  await at390(page, 'choose-time');
  // Days with places are a short row; the chosen day's times are a list of large buttons.
  const days = page.getByRole('navigation', { name: 'Days with a place' });
  await expect(days.getByRole('link')).toHaveText(['Fri 20 Nov', 'Sat 21 Nov', 'Mon 23 Nov']);
  await expect(days.getByRole('link', { name: 'Fri 20 Nov' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Friday 20 November' })).toBeVisible();
  const times = page
    .getByRole('main')
    .getByRole('listitem')
    .getByRole('link', { name: /pm$|am$/ });
  await expect(times).toHaveText(['6pm', '6:15pm', '6:30pm']);
  for (const time of await times.all()) {
    expect((await time.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  // Choosing a day or a time moves on; nothing is booked from this screen.
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
  await expect(days.getByRole('link', { name: 'Sat 21 Nov' })).toHaveAttribute(
    'href',
    /\/book\?day=2026-11-21$/,
  );
  await expect(times.first()).toHaveAttribute('href', /\/book\?slot=[0-9a-f-]{36}$/);

  // A group viewing says how many places are left, in words.
  await page.goto(page_('choose-time-day'));
  await expect(page.getByText('Group viewing, 3 places left')).toBeVisible();

  // UX-RN-7: the confirm step: the day, time and address. P16: a new booking asks for a mobile,
  // to confirm by text code, and nothing else.
  await page.goto(page_('confirm-time'));
  await expect(page.getByText('Friday 20 November, 6:15pm')).toBeVisible();
  await expect(page.getByText('12 Ranelagh Road, Ranelagh, Dublin 6')).toBeVisible();
  const mobile = page.getByLabel('Your mobile number');
  // Q12: never filled in from the enquiry.
  await expect(mobile).toHaveValue('');
  await expect(page.getByRole('main').locator('input:not([type=hidden])')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Text me a code' })).toBeVisible();
  // Asked once: a number they confirmed is shown, masked, with "Change", not asked for again.
  await page.goto(page_('confirm-time-mobile-confirmed'));
  await expect(page.getByLabel('Your mobile number')).toHaveCount(0);
  await expect(page.getByText('087 ••• 4567')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change the mobile number' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book this viewing' })).toBeVisible();
  // Moving a booking asks nothing about the mobile.
  await page.goto(page_('confirm-move'));
  await expect(page.getByLabel('Your mobile number')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move my viewing' })).toBeVisible();
  // P16: the code screen: where it went, masked; a wrong code is said at the field. Where texts
  // aren't sent (the test copy), the code is on the screen.
  await page.goto(page_('confirm-code'));
  await expect(page.getByRole('heading', { name: 'Enter the code we texted you' })).toBeVisible();
  await expect(page.getByText(/to 087 ••• 4567\. It works for 10 minutes\./)).toBeVisible();
  await expect(page.getByLabel('The code from the text')).toBeVisible();
  await page.goto(page_('confirm-code-wrong'));
  await expect(
    page.getByText('That code isn’t right. Check the text and try again.'),
  ).toBeVisible();
  await expect(page.getByText('here’s your code: 123456.')).toBeVisible();

  // UX-RN-6, UX-RN-10: one time on offer, so no picker; the hold's end is in words.
  await page.goto(page_('place-offered'));
  await expect(page.getByRole('heading', { name: 'A place has opened up' })).toBeVisible();
  await expect(page.getByText('Friday 20 November, 6:15pm')).toBeVisible();
  await expect(page.getByText('It’s yours until 8:40pm today.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take this place' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Days with a place' })).toHaveCount(0);

  // UX-RN-8: the booked page is a confirmation: calendar, directions, then two quiet actions.
  await page.goto(page_('booked'));
  await expect(page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add to my calendar' })).toHaveAttribute(
    'href',
    /\/viewing\.ics$/,
  );
  // On a computer, directions open OpenStreetMap; the page's own address isn't passed on.
  const directions = page.getByRole('link', { name: 'Get directions' });
  await expect(directions).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/search?query=12%20Ranelagh%20Road%2C%20Ranelagh%2C%20Dublin%206',
  );
  await expect(directions).toHaveAttribute('rel', 'noreferrer');
  await expect(page.getByRole('link', { name: 'Change the time' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancel', exact: true })).toBeVisible();
  // The form to move a viewing opens only when asked for.
  await expect(page.getByRole('main').locator('input, select, textarea')).toHaveCount(0);

  // UX-RN-9: cancelled says so, and offers one button. No booking form unasked.
  await page.goto(page_('cancelled'));
  await expect(page.getByRole('heading', { name: 'Your viewing is cancelled' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book another time' })).toBeVisible();
  await expect(page.getByRole('main').locator('input, select, textarea')).toHaveCount(0);
});

test('UX-RN-8: on a phone, “Get directions” opens the phone’s own maps app', async ({
  browser,
}) => {
  for (const [userAgent, href] of [
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      /^maps:\/\/\?daddr=12%20Ranelagh%20Road/,
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
      /^geo:0,0\?q=12%20Ranelagh%20Road/,
    ],
  ] as const) {
    const context = await browser.newContext({
      userAgent,
      viewport: { width: 390, height: 844 },
    });
    const phone = await context.newPage();
    await phone.goto(page_('booked'));
    await expect(phone.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', href);
    await context.close();
  }
});

test('UX-RN-11, UX-RN-12: applying is two questions, then a check screen with “Change” beside the name and the email', async ({
  page,
}) => {
  await at390(page, 'apply');
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(
    page.getByRole('heading', { name: 'How do you earn most of your income?' }),
  ).toBeVisible();
  await next.click();
  await expect(page.getByText('Choose how you earn most of your income.')).toBeVisible();
  await page.getByRole('radio', { name: 'Something else' }).check();
  await next.click();

  // UX-RN-12: two lines of help, one for the rule, and nothing that asks about housing support.
  await expect(
    page.getByRole('heading', { name: 'What’s your household’s take-home income each month?' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'After tax, for everyone who’d pay the rent. Include any housing support, such as HAP.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Halcyon Lettings looks for 2.5 times the rent. Everyone is asked the same.'),
  ).toBeVisible();
  // Rule 3: one field, for one amount. No tick, question or choice about HAP anywhere.
  await expect(page.getByRole('main').locator('input:not([type=hidden]):visible')).toHaveCount(1);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await next.click();
  await expect(
    page.getByText('Enter your take-home income as an amount, like 3,200.'),
  ).toBeVisible();
  await page.getByLabel('Take-home income each month').fill('3,400');
  await next.click();

  // The check screen: their name and email, each with "Change".
  await expect(page.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await expect(page.getByText('Aoife Byrne', { exact: true })).toBeVisible();
  await expect(page.getByText('aoife.byrne@example.ie', { exact: true })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Something else' })).toBeVisible();
  await expect(page.getByText('€3,400 a month')).toBeVisible();
  await expectAccessible(page);
  await expectOnePrimary(page);
  await screenshot(page, 'wp12-apply-check-screen-390');
  // UX-RN-13: one tick for someone without a profile, off by default.
  const keep = page.getByRole('checkbox', { name: 'Keep my details for next time' });
  await expect(keep).toBeVisible();
  await expect(keep).not.toBeChecked();

  await page.getByRole('button', { name: 'Change name' }).click();
  await expect(page.getByRole('heading', { name: 'What’s your name?' })).toBeVisible();
  await page.getByLabel('First and last name').fill('');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Enter your first and last name.')).toBeVisible();
  await page.getByLabel('First and last name').fill('Aoife Ní Bhroin');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await expect(page.getByText('Aoife Ní Bhroin', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByRole('heading', { name: 'Which email should we use?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Change income' }).click();
  await expect(page.getByLabel('Take-home income each month')).toHaveValue('3,400');
});

test('UX-RN-15, UX-RN-16, UX-RN-18: the checks are one at a time, each says what’s kept, and “No” to a referee loses nothing', async ({
  page,
}) => {
  // UX-RN-14: before the code, the page says only that there are checks.
  await at390(page, 'checks-start');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(page.getByText('We’ll email a six-digit code to a…@example.ie.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Check my/ })).toHaveCount(0);

  // The three as a short list: done, next, to come. Only the next one's task and button.
  await page.goto(page_('checks-documents'));
  const list = page.getByRole('list', { name: 'Your checks' }).getByRole('listitem');
  await expect(list).toHaveText([
    /Your ID.*Done/,
    /Your references.*Done/,
    /Your work and income.*Next/,
  ]);
  await expect(page.getByRole('heading', { name: 'Your work and income' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check my ID' })).toHaveCount(0);
  await expect(page.getByLabel('Their name')).toHaveCount(0);

  // UX-RN-16: one line on what's kept, who sees it and when it goes, with "More" for the rest.
  const keeps = page.locator('[data-notice="check"]');
  await expect(keeps).toContainText(
    'Only Halcyon Lettings sees your documents, and their copy is deleted once the tenancy starts or the letting closes, 30 days after you share at the latest.',
  );
  await expect(keeps.getByText(/never your PPS number or bank details/)).toBeHidden();
  await keeps.getByText('More', { exact: true }).click();
  await expect(keeps.getByText(/never your PPS number or bank details/)).toBeVisible();
  // P31, P36: what's asked by how she earns; a PPS number can stay, with how to cover it.
  await expect(page.getByText(/^Add your three most recent payslips/)).toBeVisible();
  await expect(page.getByText(/You can leave your PPS number showing/)).toBeVisible();
  await expect(page.getByLabel('Document', { exact: true })).toHaveAttribute(
    'accept',
    'application/pdf,image/jpeg,image/png',
  );
  await settled(page);
  await expectAccessible(page);

  // P38: what Gaff read, and anything to fix, in warning, never danger, never a refusal.
  await page.goto(page_('checks-documents-read'));
  await expect(page.getByText('Read by AI').first()).toBeVisible();
  const flag = page.locator('[data-flag="name_differs"]');
  await expect(flag).toContainText('The name on it isn’t Aoife Byrne, the name on your ID.');
  await expect(flag.locator('[data-pill="warning"]')).toBeVisible();
  await expect(page.locator('[data-tone="danger"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Check and share' })).toBeVisible();

  // P39, P40: exactly what will be shared, in one step; keeping them is unticked.
  await page.goto(page_('checks-share'));
  await expect(page.getByRole('heading', { name: 'Share with Halcyon Lettings' })).toBeVisible();
  await expect(
    page.getByText(
      'Verified, in the name Aoife Byrne, on Thursday 12 November. They have this already.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Your last landlord, Mary Kelly (mary.kelly@example.ie). We’ll email them a short form now.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Keep these documents for my next application' }),
  ).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Share with Halcyon Lettings' })).toBeVisible();

  // References: one referee per screen, and the opt-out is the first question.
  await page.goto(page_('checks-references'));
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(page.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await next.click();
  await expect(page.getByText('Choose whether you’ve rented before.')).toBeVisible();
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Who was your last landlord?' })).toBeVisible();
  await next.click();
  await expect(page.getByText('Enter their name.')).toBeVisible();
  await page.getByLabel('Their name').fill('Mary Kelly');
  await page.getByLabel('Their email').fill('mary.kelly@example.ie');
  await next.click();
  await expect(
    page.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();

  // UX-RN-18: "No" to both. No fields, no warning, nothing called missing: just "Send".
  await page.goto(page_('checks-references'));
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await next.click();
  await expect(
    page.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expect(
    page.getByRole('main').locator('input[type=text]:visible, input[type=email]:visible'),
  ).toHaveCount(0);
  expect(await page.getByRole('main').innerText()).not.toMatch(/missing|required|must|sorry/i);

  // With no service to start a check here, the lister arranges it, and the next isn't held up.
  await page.goto(page_('checks-arranged'));
  await expect(
    page.getByText('Halcyon Lettings will arrange this check with you.').first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
});

test('UX-RN-19 to UX-RN-25: the offer’s one total, ring-to-check, the PPS step and “Something’s not right”', async ({
  page,
}) => {
  // UX-RN-19: the terms, one total with what makes it up, one line, the deadline, then Accept.
  await at390(page, 'offer');
  await expect(page.getByRole('heading', { name: 'To pay before you move in' })).toBeVisible();
  await expect(page.getByText('€3,700', { exact: true })).toBeVisible();
  await expect(page.locator('[data-notice="fees"]')).toHaveText(
    'No other fees. You pay Halcyon Lettings directly.',
  );
  await expect(page.getByText('Answer by Sunday 22 November, 6pm.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept the offer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Decline', exact: true })).toBeVisible();
  // UX-RN-20: declining asks for no reason.
  await page.goto(page_('decline'));
  await expect(page.getByRole('heading', { name: 'Decline the offer?' })).toBeVisible();
  await expect(
    page.getByRole('main').locator('input:not([type=hidden]), textarea, select'),
  ).toHaveCount(0);

  // UX-RN-22, UX-RN-23: the total, the account, copy buttons, and the number to ring.
  await page.goto(page_('pay'));
  await expect(page.getByText('IE29 AIBK 9311 5212 3456 78')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy the IBAN' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy the reference' })).toBeVisible();
  const ring = page.locator('[data-notice="ring"]');
  await expect(ring).toContainText('Ring to check these details');
  await expect(ring).toContainText(
    'Before you pay, ring Halcyon Lettings on 01 496 0000 and check the IBAN with them.',
  );
  await expect(ring.getByRole('link', { name: 'Ring 01 496 0000' })).toHaveAttribute(
    'href',
    'tel:014960000',
  );
  // Rules 4 and 5: the only payments are the deposit and the first month's rent, to the lister.
  expect(await page.getByRole('main').innerText()).not.toMatch(/fee|pay gaff|card number/i);
  // A lister with no number on file: the tenant rings one they already have.
  await page.goto(page_('pay-no-number'));
  await expect(page.locator('[data-notice="ring"]')).toContainText(
    'Before you pay, ring Halcyon Lettings on a number you already have for them, and check the IBAN with them.',
  );
  await expect(page.getByRole('link', { name: /^Ring / })).toHaveCount(0);
  // UX-SI-12: until the code is entered, the page shows no bank details at all.
  await page.goto(page_('pay-code'));
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
  expect(await page.content()).not.toMatch(/IE29|AIBK|GAFF-/);

  // UX-RN-24: the PPS number is its own short step: one optional field, one line of why, Skip.
  await page.goto(page_('tenancy-pps'));
  await expect(page.getByRole('heading', { name: 'Your PPS number' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'PPS number' })).toBeVisible();
  await expect(page.getByRole('main').locator('input:not([type=hidden])')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  // It isn't a card under the payment details, and isn't repeated on later pages.
  for (const later of ['pay', 'tenancy-inventory', 'inventory', 'tenancy-moving-in']) {
    await page.goto(page_(later));
    await expect(page.getByText(/PPS/)).toHaveCount(0);
  }

  // UX-RN-25: room by room; each item has "Something's not right", which opens a short note.
  await page.goto(page_('inventory'));
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Kitchen',
    'Living room',
    'Bedroom',
  ]);
  await expect(page.getByRole('button', { name: /^Something’s not right: / })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'This is a fair record' })).toBeVisible();
  await page.getByRole('button', { name: 'Something’s not right: Oven' }).click();
  const note = page.getByRole('dialog', { name: 'What’s not right with the oven?' });
  await expect(note.getByLabel('A short note')).toBeVisible();
  await expect(note.getByRole('button', { name: 'Send to Halcyon Lettings' })).toBeVisible();
  await settled(page);
  await expectAccessible(page);
  await expectOnePrimary(page);
  await screenshot(page, 'wp12-inventory-note-390');
  await note.getByRole('button', { name: 'Send to Halcyon Lettings' }).click();
  await expect(note.getByText('Write a short note about what’s not right.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
  // What they've already said about an item is shown back to them.
  await expect(
    page.getByText('There’s a second tear at the back that isn’t listed.'),
  ).toBeVisible();
});

test('UX-RN-26: the tenant’s three steps are a short list that never shows a step open after a later one is done', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const steps = page
    .getByRole('list', { name: 'Your tenancy, step by step' })
    .getByRole('listitem');
  const expected: Array<[string, RegExp[]]> = [
    ['tenancy-sign', [/Sign your agreement.*Next/, /Pay.*To come/, /inventory.*To come/]],
    ['tenancy-payment-coming', [/Sign your agreement.*Done/, /Pay.*Next/, /inventory.*To come/]],
    ['tenancy-pay', [/Sign your agreement.*Done/, /Pay.*Next/, /inventory.*To come/]],
    ['tenancy-inventory', [/Sign your agreement.*Done/, /Pay.*Done/, /inventory.*Next/]],
    ['tenancy-moved-in', [/Sign your agreement.*Done/, /Pay.*Done/, /inventory.*Done/]],
  ];
  for (const [name, list] of expected) {
    await page.goto(page_(name));
    await expect(steps).toHaveText(list);
    // The step to do now is marked for screen readers too.
    expect(await steps.locator('[aria-current="step"]').count()).toBeLessThanOrEqual(1);
  }
  // Each step's one task and button: sign, then pay, then the inventory.
  await page.goto(page_('tenancy-sign'));
  await expect(page.getByRole('link', { name: 'Read and sign' })).toHaveAttribute(
    'href',
    /\/agreement$/,
  );
  await page.goto(page_('tenancy-pay'));
  await expect(page.getByRole('link', { name: 'See how to pay' })).toHaveAttribute(
    'href',
    /\/pay$/,
  );
  await page.goto(page_('tenancy-inventory'));
  await expect(page.getByRole('link', { name: 'Check the inventory' })).toHaveAttribute(
    'href',
    /\/inventory$/,
  );
});

test('States: a send that failed is said at the button, and what was answered is kept', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(page_('questions-change') + '&q=staying');
  const send = page.getByRole('button', { name: 'Send my answers' });
  await expect(send).toBeVisible();
  await page.getByRole('radio', { name: 'Longer', exact: true }).check();

  // The connection drops as they press the button.
  await context.setOffline(true);
  await send.click();
  await expect(
    page.getByText('That didn’t send. Check your connection and try again.'),
  ).toBeVisible();
  // They're on the same screen, with every answer as they left it. No error box at the top.
  await expect(
    page.getByRole('heading', { level: 2, name: 'How long would you like to stay?' }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Longer', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: 'Yes', exact: true })).toBeChecked();
  await expectOnePrimary(page);

  // With the connection back, the same button sends it. (This made-up link is nobody's, and the
  // answer from the server says so, at the button too.)
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await send.click();
  await expect(
    page.getByText('This link has ended. Reply to any email from us and we’ll help.'),
  ).toBeVisible();
  await expect(page.getByText('That didn’t send.')).toHaveCount(0);
});

test('States: a page that couldn’t load says so in one sentence, with “Try again”', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(page_('failed'));
  await expect(page.getByRole('heading', { level: 1, name: 'That didn’t work' })).toBeVisible();
  await expect(
    page.getByText('We couldn’t reach Gaff. Check your connection and try again.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // Loading: the frame is there at once, and "Talk to a person" with it.
  await page.goto(page_('loading'));
  await expect(page.locator('[data-frame="renter"]')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Opening your page');
  await expect(page.getByRole('button', { name: 'Talk to a person' })).toBeVisible();
});

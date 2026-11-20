import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { aPng } from '../fixtures/photos';
import { openLettingMenu } from './journeys';
import {
  AVAILABLE_IN_DAYS,
  confirmThePin,
  expectAccessible,
  expectNoSidewaysScroll,
  goLiveThroughUi,
  homeIdIn,
  isoDateInDays,
  pickDate,
  pickTime,
  screenshot,
  signUpOperator,
} from './support';

/**
 * BA-14: more of a home's facts (M39, M40, M44), asked in the home step without a screen of their
 * own and shown on its public page; and "Stop taking enquiries" (UX-LP-5, M52), now or at a
 * date and time, and taking them again.
 */

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

const TOUR = 'https://my.matterport.com/show/?m=gaffTestTour';

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

/** Through the real steps, with the further facts given in the home step. Ends on Photos. */
async function addHomeWithFacts(page: Page, address: string, shoot = false): Promise<void> {
  await page.goto('/lettings/new');
  await page.getByRole('link', { name: 'Fill it in myself' }).click();
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill(address);
  await page.getByLabel('Town or area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await confirmThePin(page);
  await page.getByLabel('Rent a month').fill('1850');
  await pickDate(page, 'Available from', isoDateInDays(AVAILABLE_IN_DAYS));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The home', exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Type of home' })
    .getByRole('radio', { name: 'Apartment' })
    .check();
  await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
  await page.getByLabel('BER rating').selectOption('C1');

  // M39: one line, on the same step; each fact inside it is optional.
  await page.getByText('More about the home').click();
  await page.getByRole('group', { name: 'En-suites' }).getByRole('radio', { name: '1' }).check();
  await page.getByLabel('Floor area in square metres').fill('72');
  await page.getByLabel('Which floor is it on?').selectOption('2');
  await page
    .getByRole('group', { name: 'Is there a lift?' })
    .getByRole('radio', { name: 'Yes' })
    .check();
  await page.getByLabel('Heating').selectOption('heat_pump');
  await page
    .getByRole('group', { name: 'Outdoor space' })
    .getByRole('radio', { name: 'Balcony' })
    .check();
  const appliances = page.getByRole('group', { name: 'Appliances' });
  await appliances.getByRole('checkbox', { name: 'Washing machine' }).check();
  await appliances.getByRole('checkbox', { name: 'Dishwasher' }).check();
  await page
    .getByRole('group', { name: 'Broadband' })
    .getByRole('radio', { name: 'Fibre broadband' })
    .check();
  // M44: a tour link only from YouTube, Vimeo or Matterport: the error is at the field.
  await page.getByLabel('Video or virtual tour').fill('https://example.com/tour');
  await page.getByLabel('BER number').fill('1041 23456');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('Add a link from YouTube, Vimeo or Matterport, starting https://'),
  ).toBeVisible();
  await page.getByLabel('Video or virtual tour').fill(TOUR);
  if (shoot) {
    // The field's error goes as it is edited; wait for it before looking at the screen.
    await expect(
      page.getByText('Add a link from YouTube, Vimeo or Matterport, starting https://'),
    ).toHaveCount(0);
    for (const [width, viewport] of widths) {
      await page.setViewportSize(viewport);
      // The resize starts the fields' short colour transitions: let them end first.
      await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
      await expectAccessible(page);
      await expectNoSidewaysScroll(page);
      await screenshot(page, `ba14-home-step-more-facts-${width}`);
    }
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
}

/** A live home on Gaff with the further facts, put live through the real screens. */
async function aLiveHomeWithFacts(page: Page, address: string, shoot = false) {
  await addHomeWithFacts(page, address, shoot);
  await page.getByLabel('Choose photos').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: aPng([36, 99, 168]) },
    { name: 'kitchen.png', mimeType: 'image/png', buffer: aPng([201, 140, 60]) },
  ]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(2);
  const lettingId = homeIdIn(page.url());
  await goLiveThroughUi(page);
  const [row] = await asSystem<{ ref: string }>(
    `select public_ref as ref from lettings where id = $1`,
    [lettingId],
  );
  return { homePath: `/homes/${row!.ref}`, lettingPath: `/lettings/${lettingId}` };
}

async function signedOut(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  return { context, page: await context.newPage() };
}

test('M39, M40, M44: the further facts are asked in the home step and shown on the home’s page, at both widths', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  await signUpOperator(page, `Harbour Lettings ${String(Date.now()).slice(-5)}`);
  const home = await aLiveHomeWithFacts(page, '14 Beechfield Terrace', true);

  // The Home view says them, and the tour, as the AI answers from them.
  await page.goto(`${home.lettingPath}?view=home`);
  const facts = page.locator('section[aria-labelledby="home-facts"]');
  await expect(facts.getByText('Heat pump')).toBeVisible();
  await expect(facts.getByText('2nd floor')).toBeVisible();
  await expect(facts.getByText(TOUR)).toBeVisible();

  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    await visitor.goto(home.homePath);
    await expect(visitor.getByRole('heading', { level: 1 })).toContainText('14 Beechfield Terrace');
    for (const text of [
      '1 en-suite',
      '72 m²',
      '2nd floor, with a lift',
      'Heat pump',
      'Balcony',
      'Washing machine and dishwasher',
      'Fibre broadband',
    ]) {
      await expect(visitor.getByText(text, { exact: true }).first()).toBeAttached();
    }
    await expect(visitor.getByText('BER number 104123456')).toBeVisible();
    const tour = visitor.getByRole('link', { name: /Watch the tour on Matterport/ });
    await expect(tour).toHaveAttribute('href', TOUR);
    await expect(tour).toHaveAttribute('rel', /noopener/);
    await expectAccessible(visitor);
    await expectNoSidewaysScroll(visitor);
    await screenshot(visitor, `ba14-home-page-facts-${width}`);
    await context.close();
  }
});

test('UX-LP-5, M52: stopping enquiries now and at a time, then taking them again, at both widths', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page, `Quay Lettings ${String(Date.now()).slice(-5)}`);
  const home = await aLiveHomeWithFacts(page, '9 Orchard Row');

  // At a date and time: one question, and the date and time only once it's chosen.
  await page.goto(home.lettingPath);
  let menu = await openLettingMenu(page, '9 Orchard Row');
  await menu.getByRole('menuitem', { name: 'Stop taking enquiries' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'When should enquiries stop?' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop taking enquiries' }).click();
  await expect(page.getByText('Choose when enquiries should stop')).toBeVisible();
  await page.getByLabel('At a date and time').check();
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await expectAccessible(page);
    await expectNoSidewaysScroll(page);
    await screenshot(page, `ba14-stop-enquiries-${width}`);
  }
  await page.setViewportSize(phone);
  await pickDate(page, 'Date', isoDateInDays(5));
  await pickTime(page, 'Time', '6pm');
  await page.getByRole('button', { name: 'Stop taking enquiries' }).click();
  await expect(page.getByText('Saved. Enquiries will stop at the time you set.')).toBeVisible();
  // Still open until then.
  {
    const { context, page: visitor } = await signedOut(browser, phone);
    await visitor.goto(home.homePath);
    await expect(visitor.getByRole('link', { name: 'Ask to view' })).toBeVisible();
    await context.close();
  }

  // Taking them again cancels it; then "Now".
  menu = await openLettingMenu(page, '9 Orchard Row');
  await menu.getByRole('menuitem', { name: 'Take enquiries again' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Take enquiries again?' }),
  ).toBeVisible();
  await expect(page.getByText(/This home stops taking enquiries on /)).toBeVisible();
  await page.getByRole('button', { name: 'Take enquiries again' }).click();
  await expect(page.getByText('Taking enquiries again.')).toBeVisible();

  menu = await openLettingMenu(page, '9 Orchard Row');
  await menu.getByRole('menuitem', { name: 'Stop taking enquiries' }).click();
  await page.getByLabel('Now', { exact: true }).check();
  await page.getByRole('button', { name: 'Stop taking enquiries' }).click();
  await expect(page.getByText('Enquiries have stopped.')).toBeVisible();
  await page.goto(home.lettingPath);
  await expect(
    page.getByText('Not taking enquiries. Anyone who enquires is told it has closed.'),
  ).toBeVisible();

  // The page stays and says so, with no "Ask to view"; the home is in no search.
  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    await visitor.goto(home.homePath);
    await expect(visitor.getByText('This home is no longer taking enquiries')).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Ask to view' })).toHaveCount(0);
    await expectAccessible(visitor);
    await expectNoSidewaysScroll(visitor);
    await screenshot(visitor, `ba14-enquiries-closed-page-${width}`);
    await visitor.goto('/?where=ranelagh');
    await expect(visitor.locator(`a[href^="${home.homePath}"]`)).toHaveCount(0);
    await context.close();
  }

  // Taking them again: back in search, and "Ask to view" is there.
  menu = await openLettingMenu(page, '9 Orchard Row');
  await menu.getByRole('menuitem', { name: 'Take enquiries again' }).click();
  await expect(page.getByText(/This home stopped taking enquiries on /)).toBeVisible();
  for (const [width, viewport] of widths) {
    await page.setViewportSize(viewport);
    await expectAccessible(page);
    await screenshot(page, `ba14-reopen-enquiries-${width}`);
  }
  await page.getByRole('button', { name: 'Take enquiries again' }).click();
  await expect(page.getByText('Taking enquiries again.')).toBeVisible();
  const { context, page: visitor } = await signedOut(browser, phone);
  await visitor.goto(home.homePath);
  await expect(visitor.getByRole('link', { name: 'Ask to view' })).toBeVisible();
  await visitor.goto('/?where=ranelagh');
  await expect(visitor.locator(`a[href^="${home.homePath}"]`).first()).toBeVisible();
  await context.close();
});

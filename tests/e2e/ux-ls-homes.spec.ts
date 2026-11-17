import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_CRON_SECRET, E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import {
  addHomeThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  gaffAddress,
  goLiveThroughUi,
  homeIdIn,
  licenceOf,
  screenshot,
  sendTestEmail,
  settled,
  signUpLandlord,
  signUpOperator,
} from './support';

/** Work package WP-20: homes on Gaff (UX-LT-21, UX-LS-1 to UX-LS-11). */

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
const widths = [
  ['390', phone],
  ['1280', desktop],
] as const;

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

const aPhoto = (name: string, colour: [number, number, number]) => ({
  name,
  mimeType: 'image/png',
  buffer: aPng(colour),
});

const DESCRIPTION = [
  'A bright apartment on the first floor of a red-brick terrace, five minutes’ walk from the Luas.',
  'The kitchen was refitted last year, with a gas hob, a dishwasher and a washer-dryer. Both bedrooms are doubles with fitted wardrobes, and the living room looks onto the garden.',
  'There is a small garden to the back, shared with one other apartment, and a shed for bikes.',
].join('\n');

/**
 * A live home with three photos, put live through the real screens, with a description, a
 * fact and the lister's number added as the lister would have given them. Returns where its page
 * is and the letting's own address in the workspace.
 */
async function aLiveHomeOnGaff(
  page: Page,
  address: string,
  options: { phone?: string } = {},
): Promise<{ homePath: string; lettingPath: string; ref: string }> {
  await addHomeThroughUi(page, address);
  await page
    .getByLabel('Choose photos')
    .setInputFiles([
      aPhoto('front.png', [36, 99, 168]),
      aPhoto('kitchen.png', [201, 140, 60]),
      aPhoto('garden.png', [90, 140, 90]),
    ]);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(3);
  const lettingId = homeIdIn(page.url());
  await goLiveThroughUi(page);
  const [row] = await asSystem<{ ref: string; organisation_id: string }>(
    `update lettings set description = $2 where id = $1 returning public_ref as ref, organisation_id`,
    [lettingId, DESCRIPTION],
  );
  if (options.phone) {
    await asSystem(`update organisations set phone = $2 where id = $1`, [
      row!.organisation_id,
      options.phone,
    ]);
  }
  return { homePath: `/homes/${row!.ref}`, lettingPath: `/lettings/${lettingId}`, ref: row!.ref };
}

/** A visitor with no account, at this width. */
async function signedOut(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  return { context, page: await context.newPage() };
}

/** UX-LS-11: every image on the page has loaded: none is broken. */
async function expectNoBrokenImages(page: Page): Promise<void> {
  const broken = await page.evaluate(async () => {
    const images = [...document.images];
    await Promise.all(images.map((image) => image.decode().catch(() => null)));
    return images.filter((image) => image.naturalWidth === 0).map((image) => image.src);
  });
  expect(broken).toEqual([]);
}

test('UX-LS-1 to UX-LS-11, UX-LT-21: a live letting’s page opens signed out at both widths, with no personal data, and switching "On gaff.ie" off removes it', async ({
  browser,
  page,
}) => {
  test.slow();
  const agency = `Halcyon Lettings ${String(Date.now()).slice(-5)}`;
  const operator = await signUpOperator(page, agency);
  const licence = await licenceOf(operator);
  const home = await aLiveHomeOnGaff(page, '12 Ranelagh Road', { phone: '01 234 5678' });
  // Someone has enquired: nothing about them, or that they did, is on the page (UX-LS-9).
  await sendTestEmail(page, { to: await gaffAddress(page), ...daftEnquiry });

  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    const response = await visitor.goto(home.homePath);
    expect(response?.status()).toBe(200);
    // UX-LS-11: a page search engines may find.
    expect(response?.headers()['x-robots-tag']).toBe('index, follow');

    // Title: the address and one summary line.
    await expect(
      visitor.getByRole('heading', { level: 1, name: '12 Ranelagh Road, Ranelagh, Dublin 6' }),
    ).toBeVisible();
    await expect(visitor.getByText('€1,850 a month · 2-bed apartment · Furnished')).toBeVisible();

    // Action: the rent, the one primary button, a quiet "Call", one reassurance line.
    const action = visitor.getByRole('complementary', { name: 'Ask to view' });
    await expect(action.getByText('€1,850 a month')).toBeVisible();
    await expect(action.getByRole('link', { name: 'Ask to view' })).toBeVisible();
    await expect(action.getByRole('link', { name: 'Call 01 234 5678' })).toHaveAttribute(
      'href',
      'tel:012345678',
    );
    await expect(visitor.getByText('Free. You’ll hear back either way.')).toHaveCount(1);
    await expect(visitor.locator('main [data-button="primary"]')).toHaveCount(1);
    const box = (await action.boundingBox())!;
    if (width === '390') {
      // Fixed to the foot of the screen on a phone.
      expect(Math.round(box.y + box.height)).toBe(viewport.height);
    } else {
      // To the right of the content on a desktop.
      expect(box.x).toBeGreaterThan(viewport.width / 2);
    }

    // Highlights, Gaff's letting details, the description, the BER, the lister, the report.
    await expect(visitor.getByRole('heading', { name: 'Highlights' })).toBeVisible();
    await expect(visitor.getByText('2 bedrooms')).toBeVisible();
    const details = visitor.getByRole('region', { name: 'Letting details' });
    await expect(details.getByText('Up to 3 people')).toBeVisible();
    await expect(details.getByText('No pets (assistance dogs always welcome)')).toBeVisible();
    await expect(details.getByText(/^Available from /)).toBeVisible();
    const about = visitor.getByRole('region', { name: 'About this home' });
    await expect(about.getByRole('button', { name: 'Show more' })).toBeVisible();
    await expect(visitor.getByText('BER C1')).toBeVisible();
    const letBy = visitor.getByRole('region', { name: 'Let by' });
    await expect(letBy.getByText(agency, { exact: true })).toBeVisible();
    await expect(letBy.getByText(`Ring ${agency} on 01 234 5678`)).toBeVisible();
    await expect(letBy.getByText(`PSRA licence ${licence}`)).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Report this listing' })).toBeVisible();

    // Rule 3, UX-LS-9, UX-LS-11: nothing about any person, nothing to hurry anyone.
    const text = await visitor.locator('body').innerText();
    const html = await visitor.content();
    for (const words of [text, html]) {
      expect(words).not.toMatch(/suit/i);
      expect(words).not.toMatch(/Aoife|aoife\.byrne|087 123 4567/);
      expect(words).not.toMatch(/Ann Power|@example\.ie|D06 F2X3/i);
      expect(words).not.toMatch(/enquir(y|ies|ed)|people looking|viewing/i);
      expect(words).not.toContain(home.lettingPath.slice('/lettings/'.length));
    }

    // UX-LS-11: a sharing preview of the address, the rent and the cover photo.
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '12 Ranelagh Road, Ranelagh, Dublin 6',
    );
    await expect(visitor.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      '€1,850 a month · 2-bed apartment · Furnished',
    );
    await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^http:\/\/localhost:\d+\/media\/homes\//,
    );
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);

    await expectNoBrokenImages(visitor);
    await expectNoSidewaysScroll(visitor);
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-01-home-page-${width}`);

    // The gallery: a phone swipes, with Previous and Next; a desktop shows a grid. Any photo
    // opens full screen, where Next moves on and Escape closes.
    // Measuring targets scrolled the photos along; start again from the first.
    await visitor.reload();
    const gallery = visitor.getByRole('region', { name: 'Photos of 12 Ranelagh Road' });
    if (width === '390') {
      await expect(gallery.getByText('1 of 3')).toBeVisible();
      await gallery.getByRole('button', { name: 'Next photo' }).click();
      await expect(gallery.getByText('2 of 3')).toBeVisible();
    } else {
      for (const n of [1, 2, 3]) {
        await expect(
          gallery.getByRole('button', { name: `Photo ${n} of 3, full screen` }),
        ).toBeVisible();
      }
    }
    await gallery.getByRole('button', { name: 'Photo 1 of 3, full screen' }).click();
    const full = visitor.getByRole('dialog', { name: 'Photos of 12 Ranelagh Road' });
    await expect(full.getByRole('img', { name: 'Photo 1 of 3' })).toBeVisible();
    await full.getByRole('button', { name: 'Next' }).click();
    await expect(full.getByRole('img', { name: 'Photo 2 of 3' })).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-02-gallery-full-screen-${width}`);
    await visitor.keyboard.press('Escape');
    await expect(full).toBeHidden();

    // The description: three lines, then Show more.
    await about.getByRole('button', { name: 'Show more' }).click();
    await expect(about.getByRole('button', { name: 'Show less' })).toBeVisible();

    // WP-22's seam: "Ask to view" leads to its stub, which says how to reach the lister now.
    await action.getByRole('link', { name: 'Ask to view' }).click();
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'Asking to view opens soon' }),
    ).toBeVisible();
    await expect(visitor.getByText(`Until then, ring ${agency} on 01 234 5678.`)).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-03-ask-to-view-stub-${width}`);
    await visitor.getByRole('link', { name: 'Back to the home' }).last().click();

    // UX-TS-3: "Report this listing": one question, tap answers, no account.
    await visitor.getByRole('link', { name: 'Report this listing' }).click();
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'What’s wrong with this listing?' }),
    ).toBeVisible();
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await expect(visitor.getByText('Choose what’s wrong with this listing')).toBeVisible();
    await visitor.getByRole('radio', { name: 'Something else' }).check();
    await expect(visitor.getByLabel('What’s wrong?')).toBeVisible();
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-04-report-${width}`);
    await visitor.getByLabel('What’s wrong?').fill('The photos are of a different home.');
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'Thanks for telling us' }),
    ).toBeVisible();
    await expectAccessible(visitor);
    await context.close();
  }

  // UX-LT-21: the lister switches "On gaff.ie" off on the letting's page: the page goes at once.
  await page.goto(home.lettingPath);
  const onGaff = page.getByRole('region', { name: 'On gaff.ie' });
  await expect(onGaff.getByRole('link', { name: 'See its page' })).toHaveAttribute(
    'href',
    home.homePath,
  );
  await expectAccessible(page);
  await screenshot(page, 'ux-ls-05-on-gaff-card-1280');
  await onGaff.getByRole('button', { name: 'Take it off gaff.ie' }).click();
  await expect(onGaff.getByRole('button', { name: 'Show it on gaff.ie' })).toBeVisible();

  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    const response = await visitor.goto(home.homePath);
    expect(response?.status()).toBe(404);
    await expect(visitor.getByRole('heading', { name: 'This home isn’t on Gaff' })).toBeVisible();
    await expect(visitor.getByText('12 Ranelagh Road')).toHaveCount(0);
    for (const robots of await visitor.locator('meta[name="robots"]').all()) {
      await expect(robots).toHaveAttribute('content', /noindex/);
    }
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-06-not-available-${width}`);
    await context.close();
  }

  // And on again: the same address, the same page.
  await onGaff.getByRole('button', { name: 'Show it on gaff.ie' }).click();
  await expect(onGaff.getByRole('link', { name: 'See its page' })).toBeVisible();
  const again = await page.request.get(home.homePath);
  expect(again.status()).toBe(200);
});

test('UX-LS-7: a private landlord is shown by first name only, and with no number there is no "Call"', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpLandlord(page, 'Mary Byrne');
  const home = await aLiveHomeOnGaff(page, '3 Castle Street');
  const { context, page: visitor } = await signedOut(browser, phone);
  await visitor.goto(home.homePath);
  const letBy = visitor.getByRole('region', { name: 'Let by' });
  await expect(letBy.getByText('Mary', { exact: true })).toBeVisible();
  await expect(letBy.getByText(/licence/i)).toHaveCount(0);
  expect(await visitor.locator('body').innerText()).not.toContain('Byrne');
  expect(await visitor.content()).not.toContain('Byrne');
  await expect(visitor.getByRole('link', { name: /^Call/ })).toHaveCount(0);
  await expectAccessible(visitor);
  await screenshot(visitor, 'ux-ls-07-private-landlord-390');
  await context.close();
});

test('UX-LS-10: a let home says so and offers other homes nearby, then the scheduled job removes its page', async ({
  browser,
  page,
}) => {
  test.slow();
  await signUpOperator(page);
  const home = await aLiveHomeOnGaff(page, '21 Ranelagh Road');
  await page.goto(home.lettingPath);
  await page.getByText('Close this letting').click();
  await page.getByLabel('It’s let').check();
  await page.getByRole('button', { name: 'Close the letting' }).click();
  await expect(page.getByText(/^Closed\. Everyone who enquired/)).toBeVisible();

  for (const [width, viewport] of widths) {
    const { context, page: visitor } = await signedOut(browser, viewport);
    await visitor.goto(home.homePath);
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'This home has been let' }),
    ).toBeVisible();
    await expect(visitor.getByText('21 Ranelagh Road, Ranelagh, Dublin 6')).toBeVisible();
    await expect(
      visitor.getByRole('link', { name: 'See other homes in Ranelagh' }),
    ).toHaveAttribute('href', '/?where=Ranelagh');
    await expect(visitor.getByRole('link', { name: 'Ask to view' })).toHaveCount(0);
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await settled(visitor);
    await expectAccessible(visitor);
    await screenshot(visitor, `ux-ls-08-let-${width}`);
    await context.close();
  }

  // Thirty days on, the nightly job takes the page down (rule 9: by a job, never by hand).
  await asSystem(`update lettings set let_at = now() - interval '31 days' where public_ref = $1`, [
    home.ref,
  ]);
  const daily = await page.request.get('/api/cron/daily', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(daily.ok()).toBe(true);
  await expect(async () => {
    expect((await page.request.get(home.homePath)).status()).toBe(404);
  }).toPass({ timeout: 30_000 });
  const [logged] = await asSystem<{ n: number }>(
    `select count(*)::int as n from events e join lettings l on l.id = e.letting_id
     where l.public_ref = $1 and e.type = 'letting.gaff_page_removed'`,
    [home.ref],
  );
  expect(logged!.n).toBe(1);
});

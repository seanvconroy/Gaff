import { spawn } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL, e2eEnv } from '../../playwright.config';
import { seedListers } from '../../src/server/dev/seed-homes';
import { expectAccessible, expectNoSidewaysScroll, screenshot, settled } from './support';

/**
 * BA-4: the test copy's made-up homes, as a renter meets them. `pnpm db:seed` runs against this
 * run's database, as the test copy's deploy runs it; a signed-out renter finds a seeded home by
 * its town and opens its page, with its photos. The seeded homes are taken off Gaff afterwards,
 * so the other journeys' searches see only their own homes.
 */
const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };

async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
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

/** `pnpm db:seed`, as the deploy runs it, against this run's database. Returns what it said. */
async function seed(): Promise<string> {
  const run = spawn('pnpm', ['db:seed'], {
    env: { ...process.env, ...e2eEnv },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let said = '';
  run.stdout.on('data', (chunk: Buffer) => (said += chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    run.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`The seed failed (${code})`)),
    );
  });
  return said;
}

const seededEmails = seedListers.map((lister) => lister.person.email);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  expect(await seed()).toMatch(/^Seed: \{/m);
});

test.afterAll(async () => {
  await asSystem(
    `update lettings set status = 'withdrawn' where organisation_id in (
       select m.organisation_id from memberships m join users u on u.id = m.user_id
       where u.email = any($1))`,
    [seededEmails],
  );
});

async function expectNoBrokenImages(page: Page): Promise<void> {
  const broken = await page.evaluate(async () => {
    const images = [...document.images];
    await Promise.all(images.map((image) => image.decode().catch(() => null)));
    return images.filter((image) => image.naturalWidth === 0).map((image) => image.src);
  });
  expect(broken).toEqual([]);
}

const journeys = [
  // An agency's home, in Galway.
  {
    width: '390',
    viewport: phone,
    typed: 'Salthill',
    slug: 'salthill',
    rent: '€1,950 a month',
    address: '8 Seapoint Grove',
  },
  // The private landlord's, in Cork: shown within about 150 metres of its pin (M38).
  {
    width: '1280',
    viewport: desktop,
    typed: 'Ballintemple',
    slug: 'ballintemple',
    rent: '€1,800 a month',
    address: '6 Lough View',
  },
] as const;

for (const journey of journeys) {
  test(`BA-4: a signed-out renter finds a seeded home in ${journey.typed} and opens its page (${journey.width})`, async ({
    page,
  }) => {
    await page.setViewportSize(journey.viewport);
    await page.goto('/');
    await page
      .getByRole('list', { name: 'What Gaff understood' })
      .getByRole('button', { name: 'Filters' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    const where = sheet.getByRole('combobox', { name: 'Where' });
    await where.fill(journey.typed);
    await sheet
      .getByRole('option', { name: new RegExp(`^${journey.typed}\\b`) })
      .first()
      .click();
    await sheet.getByRole('button', { name: 'Show homes' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]where=${journey.slug}(&|$)`));

    const results = page.getByRole('list', { name: /fits? what you asked$/ });
    const link = results.getByRole('link', { name: journey.rent });
    await expect(link).toBeVisible();
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba4-seeded-search-${journey.width}`);
    await expectAccessible(page);

    await link.click();
    await expect(page).toHaveURL(/\/homes\/[0-9a-f]{12}$/);
    const gallery = page.getByRole('region', { name: `Photos of ${journey.address}` });
    await expect(gallery).toBeVisible();
    if (journey.width === '390') {
      await expect(gallery.getByText('1 of 3')).toBeVisible();
    } else {
      for (const n of [1, 2, 3]) {
        await expect(
          gallery.getByRole('button', { name: `Photo ${n} of 3, full screen` }),
        ).toBeVisible();
      }
    }
    await expectNoBrokenImages(page);
    await expectNoSidewaysScroll(page);
    await settled(page);
    await screenshot(page, `ba4-seeded-home-${journey.width}`);
    await expectAccessible(page);
  });
}

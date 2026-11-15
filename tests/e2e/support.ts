import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';

/**
 * WCAG 2.2 AA (PRD non-functional requirements; design system). The page is checked as it comes
 * to rest: a step or a sheet that is still fading in is waited for first. axe can't measure a
 * target, so the same check holds the page to the design system's sizes: 44px targets (WCAG
 * 2.5.8, UX-DS-15) and the one 48px control height (UX-DS-13).
 */
export async function expectAccessible(page: Page): Promise<void> {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
  await expectControlSizes(page);
}

/** Waits until nothing on the page is still moving or fading (UX-DS-20: all motion is short). */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))),
  );
}

/**
 * Tabs through the page from the top (call it straight after loading). Every stop must show a
 * 2px focus ring in `focus`, in the navigation as everywhere else. A radio or checkbox in a
 * choice row shows the ring on its row (design system).
 */
export async function expectFocusRings(page: Page): Promise<void> {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const ringOn = el.matches('label > input') ? el.closest('label')! : el;
      const style = getComputedStyle(ringOn);
      const probe = document.createElement('i');
      probe.style.color = 'var(--color-focus)';
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return {
        id: `${el.outerHTML.slice(0, 120)}@${Math.round(el.getBoundingClientRect().top + scrollY)}`,
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
        ok:
          style.outlineStyle === 'solid' &&
          parseFloat(style.outlineWidth) >= 2 &&
          style.outlineColor === expected,
        ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}, want ${expected}`,
      };
    });
    if (!stop || seen.has(stop.id)) break;
    seen.add(stop.id);
    if (!stop.ok) problems.push(`${stop.name}: ${stop.ring}`);
  }
  expect(seen.size, 'focus stops').toBeGreaterThan(1);
  expect(problems, 'focus rings').toEqual([]);
}

/** WCAG 1.4.10 reflow: nothing makes the page scroll sideways at this width. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
}

/**
 * UX-DS-13 and UX-DS-15, on whatever page is open. Every button, input and select is 48px high,
 * and nothing that can be pressed has a target under 44 by 44px. A target is measured the way a
 * finger meets it: outwards from the element's middle for as long as a press would still land on
 * it (so a 36px chip with a 44px target passes, and a radio is as big as its row). Links inside a
 * sentence are the one exception WCAG 2.5.8 allows.
 */
export async function expectControlSizes(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    // Measuring scrolls each target into view; the page is put back where it was afterwards.
    const scrolledTo = { left: window.scrollX, top: window.scrollY };
    const name = (el: Element) => {
      const words = el.getAttribute('aria-label') || el.textContent || el.getAttribute('name');
      return `${el.tagName.toLowerCase()} "${(words ?? '').trim().slice(0, 40)}"`;
    };
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };

    // One height: text inputs, selects, and anything styled as a button or a picker's control.
    const controls = document.querySelectorAll<HTMLElement>(
      'input:not([type=hidden], [type=radio], [type=checkbox], [type=file]), select, ' +
        '[class*="Button-module"], [class*="Pickers-module"][aria-haspopup]',
    );
    for (const el of controls) {
      // The code input is one see-through input over its six boxes; the boxes are measured below.
      if (!visible(el) || el.closest('[class*="CodeInput-module"]')) continue;
      const height = el.getBoundingClientRect().height;
      if (Math.abs(height - 48) > 0.5) found.push(`${name(el)} is ${height}px high, not 48px`);
    }
    for (const box of document.querySelectorAll('[class*="CodeInput-module"][class*="box"]')) {
      const height = box.getBoundingClientRect().height;
      if (Math.abs(height - 48) > 0.5) found.push(`a code box is ${height}px high, not 48px`);
    }

    // Targets: 44 by 44px or more.
    const pressable = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=option], [role=menuitem]',
    );
    for (const el of pressable) {
      if (!visible(el) || (el as HTMLButtonElement).disabled) continue;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      const target = el.matches('label input') ? el.closest('label')! : el;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const box = target.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hits = (px: number, py: number) => {
        const at = document.elementFromPoint(px, py);
        return !!at && target.contains(at);
      };
      if (!hits(x, y)) continue; // covered by something else, such as a fixed bar
      const reach = (dx: number, dy: number) => {
        let distance = 0;
        while (distance < 60 && hits(x + dx * (distance + 1), y + dy * (distance + 1))) {
          distance += 1;
        }
        return distance;
      };
      const width = reach(-1, 0) + reach(1, 0) + 1;
      const height = reach(0, -1) + reach(0, 1) + 1;
      if (width < 44 || height < 44) found.push(`${name(el)} has a ${width} by ${height}px target`);
    }
    window.scrollTo({ ...scrolledTo, behavior: 'instant' });
    return found;
  });
  expect(problems, 'control heights and targets').toEqual([]);
}

/** Saves a full-page screenshot to screenshots/ for review. */
export async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/**
 * The sending address of the organisation the current test signed up. Tests send to the same
 * made-up renters, so mail lookups only look at this organisation's mail: never an earlier
 * test's, which may still be newer when a job hasn't sent this test's yet.
 */
let currentSender: string | null = null;
const fromCurrentSender = "($3::text is null or from_address like '%<' || $3 || '@%')";

/** The newest link in mail the development outbox "sent" to this address. */
export async function latestLinkFor(email: string): Promise<string> {
  const rows = await query<{ text: string }>(
    'select text from dev_outbox where to_address = $1 order by created_at desc limit 1',
    [email],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No link has been sent to ${email}`);
  return link;
}

/** Signs in through the real email-link flow. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(await latestLinkFor(email));
}

let counter = 0;
export function uniqueEmail(prefix = 'ann'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@halcyon.test`;
}

/** Signs up a new operator and sets up their workspace; returns their email. */
export async function signUpOperator(
  page: Page,
  organisation = 'Halcyon Lettings',
): Promise<string> {
  const email = uniqueEmail();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel('Your name').fill('Ann Power');
  await page.getByLabel('Other people: we are a letting agency').check();
  await page.getByLabel('Name of your agency or business').fill(organisation);
  await page.getByLabel('PSRA licence number').fill('001234');
  await page.getByRole('button', { name: 'Set up my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your lettings' })).toBeVisible();
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<{ slug: string }>(
      `select o.inbound_slug as slug from organisations o
       join memberships m on m.organisation_id = o.id join users u on u.id = m.user_id
       where u.email = $1`,
      [email],
    );
    await client.query('commit');
    currentSender = rows[0]?.slug ?? null;
  } finally {
    await client.end();
  }
  return email;
}

/** The date this many days from now, as YYYY-MM-DD, the way the date fields take it. */
export function isoDateInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A letting made by createLettingThroughUi is available, so its tenancy starts, this far ahead. */
export const AVAILABLE_IN_DAYS = 30;

/**
 * Creates a letting with one evening of viewing slots, through the real screens: the three steps
 * of "Add a letting" (the home, key facts, adverts), then a viewing time.
 */
export async function createLettingThroughUi(
  page: Page,
  address = '12 Ranelagh Road',
  daftUrl = '',
): Promise<void> {
  await page.goto('/lettings/new');
  await page.getByLabel('Address', { exact: true }).fill(address);
  await page.getByLabel('Area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('Rent a month').fill('1850');
  await page.getByLabel('Available from').fill(isoDateInDays(AVAILABLE_IN_DAYS));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Type of home').selectOption('apartment');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Furnishing').selectOption('furnished');
  await page.getByLabel('BER rating').selectOption('C1');
  await page.getByRole('button', { name: 'Continue' }).click();
  if (daftUrl) await page.getByLabel('Daft advert').fill(daftUrl);
  await page.getByRole('button', { name: 'Save and add viewing times' }).click();
  await expect(page.getByText(`${address} is saved`)).toBeVisible();
  await page.getByLabel('Date').fill(isoDateInDays(7));
  await page.getByLabel('From').fill('18:00');
  await page.getByLabel('Until').fill('19:00');
  await page.getByRole('button', { name: 'Add viewing time' }).click();
  await expect(page.getByText('Viewing time added')).toBeVisible();
}

/** From a letting's overview: sets criteria, checks the rent and starts taking enquiries. */
export async function goLiveThroughUi(page: Page): Promise<void> {
  const overview = page
    .url()
    .replace(/\/(viewings|criteria|rent-check|comparables).*$/, '')
    .replace(/\?.*$/, '');
  await page.goto(`${overview}/criteria`);
  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByLabel('No pets').check();
  await page.getByRole('button', { name: 'Save criteria' }).click();
  await page.getByRole('link', { name: 'Check the rent' }).click();
  await page.getByLabel('No, this is its first letting').check();
  await page.getByRole('button', { name: 'Check the rent' }).click();
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
}

/** The signed-in operator's Gaff address, from the settings page. */
export async function gaffAddress(page: Page): Promise<string> {
  await page.goto('/settings');
  return (await page.locator('code').first().innerText()).trim();
}

/** Sends an email to a Gaff address through the development inbox (as Mailgun would). */
export async function sendTestEmail(
  page: Page,
  email: { to: string; from: string; replyTo?: string; subject: string; text: string },
): Promise<void> {
  await page.goto('/dev/inbound');
  await page.getByLabel('To (a Gaff address)').fill(email.to);
  await page.getByLabel('From', { exact: true }).fill(email.from);
  await page.getByLabel('Reply-To').fill(email.replyTo ?? '');
  await page.getByLabel('Subject').fill(email.subject);
  await page.getByLabel('Body').fill(email.text);
  await page.getByRole('button', { name: 'Send to Gaff' }).click();
  await expect(page.getByText('Result: stored')).toBeVisible();
}

/** The first link in the newest development-outbox email to an address with a subject. */
export async function linkInEmail(to: string, subject: string): Promise<string> {
  const rows = await query<{ text: string }>(
    `select text from dev_outbox where to_address = $1 and subject = $2 and ${fromCurrentSender}
     order by created_at desc limit 1`,
    [to, subject, currentSender],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No email "${subject}" has been sent to ${to}`);
  return link;
}

/** Subjects of every development-outbox email to an address, newest first. */
export async function subjectsSentTo(to: string): Promise<string[]> {
  const rows = await query<{ subject: string }>(
    `select subject from dev_outbox where to_address = $1 and ($2::text is null or from_address like '%<' || $2 || '@%')
     order by created_at desc`,
    [to, currentSender],
  );
  return rows.map((row) => row.subject);
}

/** The first link in the newest development-outbox email whose subject starts with this. */
export async function linkInEmailStarting(to: string, subjectStart: string): Promise<string> {
  const rows = await query<{ text: string }>(
    `select text from dev_outbox where to_address = $1 and subject like $2 || '%' and ${fromCurrentSender}
     order by created_at desc limit 1`,
    [to, subjectStart, currentSender],
  );
  const link = rows[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No email "${subjectStart}…" has been sent to ${to}`);
  return link;
}

/**
 * Test-only time travel: moves every viewing slot of the letting at this address so the first
 * started five minutes ago. The web app has no way to do this, on purpose.
 */
export async function startViewingsNow(addressLine1: string, operatorEmail: string): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    await client.query(
      `with letting as (
         select l.id from lettings l
         join memberships m on m.organisation_id = l.organisation_id
         join users u on u.id = m.user_id
         where l.address_line1 = $1 and u.email = $2
       ), first_slot as (
         select min(starts_at) as starts_at from viewing_slots where letting_id in (select id from letting)
       )
       update viewing_slots
         set starts_at = now() - interval '5 minutes' + (viewing_slots.starts_at - first_slot.starts_at),
             ends_at = now() + interval '10 minutes' + (viewing_slots.starts_at - first_slot.starts_at)
         from first_slot
         where letting_id in (select id from letting)`,
      [addressLine1, operatorEmail],
    );
    await client.query('commit');
  } finally {
    await client.end();
  }
}

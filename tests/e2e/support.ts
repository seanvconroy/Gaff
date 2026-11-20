import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
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
  // A page's title can arrive a moment after its content. Give it that moment; a page with no
  // title at all still fails the check below.
  await page
    .waitForFunction(() => document.title.length > 0, null, { timeout: 5000 })
    .catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
  await expectUniqueIds(page);
  await expectOnePrimary(page);
  await expectControlSizes(page);
}

/**
 * UX-PP-1, UX-DS-2 (P2): at most one primary button in view, on every page. A sheet that is open
 * is the view: the page behind it doesn't count.
 */
export async function expectOnePrimary(page: Page): Promise<void> {
  // The component page shows every component side by side, primary buttons included.
  if (new URL(page.url()).pathname === '/dev/ui') return;
  const primaries = await page.evaluate(() => {
    const open = [...document.querySelectorAll('dialog[open]')].at(-1);
    const within: ParentNode = open ?? document;
    return [...within.querySelectorAll<HTMLElement>('[data-button="primary"]')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== 'hidden';
      })
      .map((el) => (el.textContent ?? '').trim());
  });
  expect(primaries.length, `primary buttons: ${primaries.join(' | ')}`).toBeLessThanOrEqual(1);
}

/**
 * No two elements on a page share an `id` (UX-DS-13). A label, a hint or an error is tied to its
 * control by id, so a repeated form whose fields share ids sends a label to the wrong control:
 * a page that repeats a form gives each one an `idScope`.
 */
export async function expectUniqueIds(page: Page): Promise<void> {
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const element of document.querySelectorAll('[id]')) {
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    }
    return [...seen].filter(([, count]) => count > 1).map(([id, count]) => `${id} (${count})`);
  });
  expect(duplicates, `duplicate ids on ${page.url()}`).toEqual([]);
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
  // A page with a loading state arrives in two parts, and the second replaces the first just
  // after it loads: wait for that, or the first Tab lands on something about to be swapped out.
  await page.waitForFunction(
    () => document.querySelectorAll('template[id^="B:"], div[hidden][id^="S:"]').length === 0,
  );
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
        // Where it is as well as what it is: links in one row can start with the same markup.
        id: `${el.outerHTML.slice(0, 120)}@${Math.round(el.getBoundingClientRect().left)},${Math.round(el.getBoundingClientRect().top + scrollY)}`,
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

/**
 * WCAG 1.4.10 reflow: nothing makes the page scroll sideways at this width. Measured once the
 * page is at rest: a step that is still sliding in is a few pixels to one side.
 */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await settled(page);
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
        '[data-button], [class*="Button-module"], [class*="Pickers-module"][aria-haspopup]',
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

/**
 * The newest six-digit code the development outbox "sent" to this address: to sign in, or (with
 * `about: 'confirm'`) to confirm it's you. The code is the start of the email's subject.
 */
export async function latestCodeFor(
  email: string,
  about: 'sign in' | 'confirm' = 'sign in',
): Promise<string> {
  const rows = await query<{ subject: string }>(
    `select subject from dev_outbox where to_address = $1 and subject ~ ('^[0-9]{6} is your code to ' || $2)
     order by created_at desc limit 1`,
    [email, about],
  );
  const code = rows[0]?.subject.slice(0, 6);
  if (!code) throw new Error(`No code to ${about} has been sent to ${email}`);
  return code;
}

/** Signs in through the real email-code flow (UX-SI-2): the address, then the six-digit code. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  // The code sends itself; then on to wherever a signed-in person lands.
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/**
 * UX-SI-10: answers the "Confirm it's you" sheet with the code emailed to the signed-in person
 * (the sheet says which address it went to). The form that asked then sends itself again.
 */
export async function confirmItsYou(page: Page): Promise<void> {
  const sheet = page.getByRole('dialog', { name: 'Confirm it’s you' });
  await sheet.getByRole('button', { name: /^Email me a code/ }).click();
  await expect(sheet.getByLabel('Six-digit code')).toBeVisible();
  const email = /code to (\S+@\S+?)\. It works/.exec(await sheet.innerText())?.[1];
  if (!email) throw new Error('The sheet doesn’t say where the code went');
  await sheet.getByLabel('Six-digit code').fill(await latestCodeFor(email, 'confirm'));
}

let counter = 0;
export function uniqueEmail(prefix = 'ann'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@halcyon.test`;
}

/** Runs statements as the system would: across organisations, for a test's own set-up. */
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

/**
 * A made-up business licensed to let, put straight into Gaff's copy of the PSRA register, for
 * one journey. Every journey signs up "Halcyon Lettings", and an agency can only be on Gaff
 * once, so each gets an entry of its own, told apart by its licence number. Returns the number:
 * seven digits starting with 2, which nothing in the sample register has.
 */
export async function aRegisterEntry(name: string, county = 'Dublin'): Promise<string> {
  const plain = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (let tries = 0; tries < 20; tries++) {
    const licence = `2${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    const made = await query<{ id: string }>(
      `insert into psra_register (licence_number, registered_name, trading_name, licence_type, county, search_text)
       values ($1, $2, $3, 'company', $4, $5) on conflict (licence_number) do nothing returning id`,
      [licence, `${name} Limited`, name, county, `${plain} limited ${plain}`],
    );
    if (made.length > 0) return licence;
  }
  throw new Error('Could not make a register entry');
}

/**
 * Test only: the agency this person set up, as it is once someone at Gaff has confirmed it
 * (UX-AG-4). Journeys that aren't about confirming use it, so their homes can go live. The real
 * way is the Confirm button on /internal/agencies, which the agency journey presses.
 */
export async function confirmAgencyOf(email: string): Promise<void> {
  await asSystem(
    `update organisations set confirmed_at = now()
     where kind = 'agency' and confirmed_at is null and id in (
       select m.organisation_id from memberships m join users u on u.id = m.user_id where u.email = $1)`,
    [email],
  );
}

/**
 * Test only: this person has confirmed it's them (Q47, UX-TS-2), as a passed ID check leaves it:
 * a verified identity on their own profile, in the name they gave, and its date on their own
 * homes. Journeys that aren't about the check use it, so a private landlord's homes can go live.
 * The real way is "Confirm it's you" at the go-live step, which the identity journey takes.
 */
export async function verifyLandlordOf(email: string): Promise<void> {
  await asSystem(
    `insert into verified_identities (user_id, verified_name, verified_at)
     select id, name, now() from users where email = $1
     on conflict (user_id) do update set verified_name = excluded.verified_name`,
    [email],
  );
  await asSystem(
    `update organisations set identity_verified_at = now()
     where kind = 'private_landlord' and id in (
       select m.organisation_id from memberships m join users u on u.id = m.user_id where u.email = $1)`,
    [email],
  );
}

/**
 * UX-AG-7: the PSRA licence number of the agency this person set up, as its entry in the
 * register gives it. It is what renters see on the agency's pages and in its emails.
 */
export async function licenceOf(email: string): Promise<string> {
  const rows = await asSystem<{ licence: string | null }>(
    `select r.licence_number as licence from organisations o
     join psra_register r on r.id = o.psra_register_entry_id
     join memberships m on m.organisation_id = o.id join users u on u.id = m.user_id
     where u.email = $1 and o.kind = 'agency'`,
    [email],
  );
  const licence = rows[0]?.licence;
  if (!licence) throw new Error(`${email} has no agency with a licence on the register`);
  return licence;
}

/** First run's first question, for someone whose sign-in supplied no name (UX-AC-6). */
export async function answerName(page: Page, name = 'Ann Power'): Promise<void> {
  await expect(page).toHaveURL(/\/welcome(\?|$)/);
  await page.getByLabel('First and last name').fill(name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** First run's second question: "What brings you to Gaff?" (UX-AC-6). */
export async function answerPurpose(
  page: Page,
  purpose: 'I’m looking for a home' | 'I’m letting a home I own' | 'I work at a letting agency',
): Promise<void> {
  await expect(page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
  // A real radio, as large as its card.
  await page.getByRole('radio', { name: purpose, exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/**
 * Signs up a new operator at a letting agency, through first run (UX-AC-6, UX-AG-1 to UX-AG-4):
 * their name, "I work at a letting agency", the agency by its licence number, "Yes, that's us".
 * Returns their email.
 *
 * The agency is CONFIRMED unless `confirmed: false` is asked for, so the journey can put homes
 * live straight away. Pass `confirmed: false` for an agency that is still "being confirmed".
 */
export async function signUpOperator(
  page: Page,
  organisation = 'Halcyon Lettings',
  options: { confirmed?: boolean } = {},
): Promise<string> {
  const email = uniqueEmail();
  await signIn(page, email);
  await setUpAgency(page, email, organisation, options);
  return email;
}

/**
 * The rest of `signUpOperator`, for a journey that signed its person in its own way: from first
 * run's first question, to Today, in a confirmed agency (unless `confirmed: false`).
 */
export async function setUpAgency(
  page: Page,
  email: string,
  organisation = 'Halcyon Lettings',
  options: { confirmed?: boolean } = {},
): Promise<void> {
  const licence = await aRegisterEntry(organisation);
  await answerName(page);
  await answerPurpose(page, 'I work at a letting agency');
  await expect(page.getByRole('heading', { name: 'Which agency?' })).toBeVisible();
  // By its number, which only this journey's entry has (UX-AG-2). Finding an agency by typing
  // its name has a journey of its own (ux-ac-accounts.spec.ts).
  await page.goto('/welcome?step=agency&by=licence');
  await page.getByLabel('Licence number').fill(licence);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Is this your agency?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, that’s us' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  if (options.confirmed !== false) await confirmAgencyOf(email);
  const rows = await asSystem<{ slug: string }>(
    `select o.inbound_slug as slug from organisations o
     join memberships m on m.organisation_id = o.id join users u on u.id = m.user_id
     where u.email = $1`,
    [email],
  );
  currentSender = rows[0]?.slug ?? null;
}

/**
 * Signs up a private landlord through first run: their name, then "I'm letting a home I own",
 * which lands in "Add your home" (UX-AC-6, UX-AC-7). Returns their email.
 *
 * They have CONFIRMED IT'S THEM (Q47) unless `verified: false` is asked for, so the journey can
 * put homes live straight away. Pass `verified: false` to meet "Confirm it's you" at go-live.
 */
export async function signUpLandlord(
  page: Page,
  name = 'Mary Byrne',
  options: { verified?: boolean } = {},
): Promise<string> {
  const email = uniqueEmail('mary');
  await signIn(page, email);
  await answerName(page, name);
  await answerPurpose(page, 'I’m letting a home I own');
  await expect(page).toHaveURL(/\/lettings\/new$/);
  if (options.verified !== false) await verifyLandlordOf(email);
  const rows = await asSystem<{ slug: string }>(
    `select o.inbound_slug as slug from organisations o
     join memberships m on m.organisation_id = o.id join users u on u.id = m.user_id
     where u.email = $1`,
    [email],
  );
  currentSender = rows[0]?.slug ?? null;
  return email;
}

/** Signs up a renter through first run: their name, then "I'm looking for a home" (UX-AC-6). */
export async function signUpRenter(page: Page, name = 'Aoife Byrne'): Promise<string> {
  const email = uniqueEmail('aoife');
  await signIn(page, email);
  await answerName(page, name);
  await answerPurpose(page, 'I’m looking for a home');
  await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible();
  return email;
}

/** The date this many days from now, as YYYY-MM-DD, the way the date fields take it. */
export function isoDateInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A letting made by createLettingThroughUi is available, so its tenancy starts, this far ahead. */
export const AVAILABLE_IN_DAYS = 30;

/**
 * Chooses a date in a date picker (section 8, "Date and time pickers"): opens the field by its
 * label, moves month by month to the date, and presses the day. `date` is YYYY-MM-DD.
 */
export async function pickDate(
  page: Page,
  label: string,
  date: string,
  within: Page | Locator = page,
): Promise<void> {
  await within.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  const picker = page
    .locator('dialog[open]')
    .filter({ has: page.getByRole('grid') })
    .last();
  await expect(picker).toBeVisible();
  const day = picker.locator(`[data-date="${date}"]`);
  for (let months = 0; months < 40 && (await day.count()) === 0; months++) {
    const shown = await picker.locator('[data-date]').first().getAttribute('data-date');
    await picker
      .getByRole('button', { name: shown && date < shown ? 'Previous month' : 'Next month' })
      .click();
  }
  await day.click();
  await expect(picker).toBeHidden();
}

/** The ID of the home in a page of adding a letting, or of a letting's own pages. */
export function homeIdIn(url: string): string {
  const id = /\/lettings\/([0-9a-f-]{36})/.exec(url)?.[1];
  if (!id) throw new Error(`No letting in ${url}`);
  return id;
}

/**
 * The first steps of "Add a letting", through the real screens (UX-LT-1, UX-LT-9): the first
 * screen (a Daft link is pasted there, where one is given: UX-LT-8), "Fill it in myself", the
 * address in the manual fields, the rent and date, and the home. It ends on the photos step,
 * where the home has just become a letting in set-up.
 */
export async function addHomeThroughUi(
  page: Page,
  address = '12 Ranelagh Road',
  daftUrl = '',
): Promise<void> {
  await page.goto('/lettings/new');
  if (daftUrl) {
    await page
      .getByLabel('Paste your advert, or describe the home in your own words.')
      .fill(daftUrl);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Gaff will use this link to match enquiries.')).toBeVisible();
  }
  await page.getByRole('link', { name: 'Fill it in myself' }).click();
  await expect(page.getByRole('heading', { name: 'Where is it?' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill(address);
  await page.getByLabel('Town or area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await confirmThePin(page);
  await expect(page.getByRole('heading', { name: 'Rent and date' })).toBeVisible();
  await page.getByLabel('Rent a month').fill('1850');
  await pickDate(page, 'Available from', isoDateInDays(AVAILABLE_IN_DAYS));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The home', exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Type of home' })
    .getByRole('radio', { name: 'Apartment' })
    .check();
  await page.getByRole('group', { name: 'Bedrooms' }).getByRole('radio', { name: '2' }).check();
  await page.getByRole('group', { name: 'Bathrooms' }).getByRole('radio', { name: '1' }).check();
  await page
    .getByRole('group', { name: 'Furnishing' })
    .getByRole('radio', { name: 'Furnished', exact: true })
    .check();
  await page.getByLabel('BER rating').selectOption('C1');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
}

/**
 * M38: "Where is it on the map?", after the address: the pin starts on the address's street (or
 * the area's middle), and Next keeps it there.
 */
export async function confirmThePin(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Where is it on the map?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'The home’s pin' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

/**
 * Creates a letting with one evening of viewing slots, through the real screens: the first
 * steps of "Add a letting", then "Add a time" on the letting's own calendar. It ends on the
 * letting's viewing times, with the letting still in set-up.
 */
export async function createLettingThroughUi(
  page: Page,
  address = '12 Ranelagh Road',
  daftUrl = '',
): Promise<void> {
  await addHomeThroughUi(page, address, daftUrl);
  await page.goto(`/lettings/${homeIdIn(page.url())}/viewings`);
  await addATime(page, isoDateInDays(7));
}

/**
 * UX-VW-3: "Add a time" on the calendar open on the screen: pick a day and press Add. The sheet's
 * other fields keep their defaults (6pm to 7pm, one at a time, 15 minutes each) unless `fill`
 * changes them. Ends with the sheet closed and "Viewing time added" said.
 */
export async function addATime(
  page: Page,
  date: string,
  fill?: (sheet: Locator) => Promise<void>,
): Promise<void> {
  await page.getByRole('button', { name: 'Add a time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a time' });
  await expect(sheet).toBeVisible();
  await pickDate(page, 'Day', date, sheet);
  await fill?.(sheet);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing time added' })).toBeVisible();
}

/** Chooses a time in a time picker: opens the field by its label and presses the time ("11am"). */
export async function pickTime(
  page: Page,
  label: string,
  time: string,
  within: Page | Locator = page,
): Promise<void> {
  await within.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  const list = page.getByRole('listbox').last();
  await expect(list).toBeVisible();
  await list.getByRole('option', { name: time, exact: true }).click();
  await expect(list).toBeHidden();
}

/**
 * From any page of a letting in set-up, the rest of "Add a letting": letting details (up to 3
 * people, no pets), the rent check for a first letting, and its result. It ends on "Ready to go
 * live", with nothing pressed.
 */
export async function toGoLiveThroughUi(
  page: Page,
  /** The go-live step's heading: "Confirm it's you" for a private landlord not yet verified. */
  heading = 'Ready to go live',
): Promise<void> {
  await page.goto(`/lettings/${homeIdIn(page.url())}/setup/details`);
  await expect(page.getByRole('heading', { name: 'Letting details' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Most people' }).check();
  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByRole('checkbox', { name: 'No pets' }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Has this home been let before?' })).toBeVisible();
  await page.getByLabel('No, this is its first letting').check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'You can set the rent at market level' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

/**
 * From any page of a letting in set-up: finishes adding it and starts taking enquiries. It
 * answers "Is it advertised anywhere else?" with No, and ends on the letting's own page.
 */
export async function goLiveThroughUi(page: Page): Promise<void> {
  await toGoLiveThroughUi(page);
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByRole('heading', { name: / is live$/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await afterGoingLive(page);
}

/**
 * UX-GR-3: just after "Is it advertised anywhere else?", a first letting goes to its test
 * enquiry, which the person watches being answered; any later one goes to its own page. Either
 * way it ends on the letting's page, saying it's live.
 */
export async function afterGoingLive(page: Page): Promise<void> {
  await page.waitForURL(/\/lettings\/[0-9a-f-]+(\/test-enquiry\?live=1|\?saved=live)$/);
  if (page.url().includes('/test-enquiry')) await watchTheTestEnquiry(page);
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
}

/**
 * UX-GR-1: an agency admin whose first letting is live finishes setup by answering "Invite your
 * team" with "It's just me". Ends on Today, which says "You're all set" this once.
 */
export async function finishSetupThroughUi(page: Page): Promise<void> {
  await page.goto('/today');
  const checklist = page.getByRole('region', { name: 'Get set up' });
  await checklist.getByRole('link', { name: 'Invite your team' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite your team' })).toBeVisible();
  await page.getByRole('button', { name: 'It’s just me' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText('You’re all set. Anything that needs you shows here.')).toBeVisible();
  await expect(checklist).toHaveCount(0);
}

/** UX-GR-3, UX-LT-24: "Send a test enquiry", the reply a renter would get, then Done. */
export async function watchTheTestEnquiry(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Send a test enquiry' })).toBeVisible();
  await page.getByRole('button', { name: 'Send a test enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Here’s what a renter gets' })).toBeVisible();
  await page.getByRole('link', { name: 'Done', exact: true }).click();
}

/** The signed-in operator's Gaff address, from the settings page. */
export async function gaffAddress(page: Page): Promise<string> {
  await page.goto('/settings/enquiries');
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

/**
 * UX-LT-19: the newest test enquiry Gaff emailed to this address for its forwarding rule to send
 * back, as it was sent. A journey plays the person's mail service: it sends this, as it is, to
 * the Gaff address (`sendTestEmail`), as a forwarding rule would.
 */
export async function forwardingTestTo(
  to: string,
): Promise<{ from: string; subject: string; text: string }> {
  const rows = await query<{ from_address: string; subject: string; text: string }>(
    `select from_address, subject, text from dev_outbox
     where to_address = $1 and subject like 'Test enquiry from Gaff (%'
     order by created_at desc limit 1`,
    [to],
  );
  const sent = rows[0];
  if (!sent) throw new Error(`No test enquiry has been sent to ${to}`);
  return { from: sent.from_address, subject: sent.subject, text: sent.text };
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

/** UX-NV-8: opens the account menu on the avatar, at the right-hand end of the navigation. */
export async function openAccountMenu(page: Page): Promise<Locator> {
  // The avatar shows the person's initials, so its name holds them: "AP, account".
  await page
    .getByRole('banner')
    .getByRole('button', { name: /, account$/ })
    .click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu).toBeVisible();
  return menu;
}

/** Signs out, from the account menu. */
export async function signOut(page: Page): Promise<void> {
  const menu = await openAccountMenu(page);
  await menu.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

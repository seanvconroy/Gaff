import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { needsYouBlock, openLettingMenu } from '../e2e/journeys';
import { aPayslipFile, latestLinkCodeFor, latestTextCodeFor } from '../e2e/renter';
import {
  homeIdIn,
  isoDateInDays,
  latestCodeFor,
  openAccountMenu,
  startViewingsNow,
} from '../e2e/support';
import { DESKTOP, PHONE, homePhotos, someoneElse, startRun, storyOf } from './capture';

/**
 * Run A of the deck: one letting seen from both sides. Mary Byrne, a private landlord, lets her
 * own flat from sign-up to the results screen; Niamh Kelly finds it on Gaff, makes an account
 * and rents it; Conor Walsh asks to view without an account, and hears when it's let.
 * Everyone here is made up.
 */

const MARY = { name: 'Mary Byrne', email: 'mary.byrne@example.ie' };
const NIAMH = { name: 'Niamh Kelly', email: 'niamh.kelly@example.ie', mobile: '087 123 4567' };
const CONOR = { name: 'Conor Walsh', email: 'conor.walsh@example.ie' };
const ADDRESS = 'Apartment 2, 9 Belgrave Square';
const HOME = `${ADDRESS}, Ranelagh, Dublin 6`;

async function rows<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows: found } = await client.query<T>(sql, params);
    await client.query('commit');
    return found;
  } finally {
    await client.end();
  }
}

/** The first link in the newest email to this address whose subject has these words in it. */
async function mailLink(to: string, about: string): Promise<string> {
  for (let tries = 0; tries < 80; tries++) {
    const found = await rows<{ text: string }>(
      `select text from dev_outbox where to_address = $1 and position($2 in subject) > 0
       order by created_at desc limit 1`,
      [to, about],
    );
    const link = found[0]?.text.match(/https?:\/\/\S+/)?.[0];
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email about “${about}” has been sent to ${to}`);
}

/**
 * A screen off the journey's spine (a menu, a sheet, a page beside the path). If it isn't there
 * the journey carries on without it, and the run says which one was missed.
 */
async function soft(label: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.log(`Missed, and carried on: ${label}: ${String(error).slice(0, 700)}`);
  }
}

/** A renter's page by private link, once it has opened. */
async function openLink(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await opened(page);
}

async function opened(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Opening your page')).toHaveCount(0);
}

/**
 * Hides what only the test copy shows (a note about the development outbox, the button that
 * moves viewings in time), so the screen is photographed as it is in production.
 */
async function withoutTestOnlyNotes(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('[aria-labelledby="dev-heading"]')?.setAttribute('hidden', '');
    for (const line of document.querySelectorAll('p')) {
      if (line.textContent?.startsWith('Developing locally?')) line.setAttribute('hidden', '');
    }
  });
}

/**
 * Shows a long page from one part of it on, by hiding what comes before that part, so the part
 * is photographed where a person scrolls to it. What it returns puts the page back.
 */
async function from(page: Page, selector: string): Promise<() => Promise<void>> {
  await page.locator(selector).evaluate((part) => {
    for (let before = part.previousElementSibling; before; before = before.previousElementSibling) {
      if (before.hasAttribute('hidden')) continue;
      before.setAttribute('data-deck-hidden', '');
      before.setAttribute('hidden', '');
    }
  });
  return async () => {
    await page.evaluate(() => {
      for (const part of document.querySelectorAll('[data-deck-hidden]')) {
        part.removeAttribute('hidden');
        part.removeAttribute('data-deck-hidden');
      }
    });
  };
}

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });
const h1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });

/** A day in the date picker that is open (support's pickDate, from its second step). */
async function chooseDay(page: Page, date: string): Promise<void> {
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

/** A device that can keep a passkey, so the offer after a first sign-in is shown. */
async function withPasskeys(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test('Run A: Mary lets her own flat to Niamh, from sign-up to the results screen', async ({
  browser,
  page,
}) => {
  startRun('own-home');
  page.setDefaultTimeout(15_000);
  await page.setViewportSize(DESKTOP);
  const mary = storyOf('landlord');
  const niamh = storyOf('renter');

  // ───────────────────────────── Mary signs up ─────────────────────────────
  mary.stage('Signing up');
  await withPasskeys(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'List a home' })).toBeVisible();
  await mary.shot(
    page,
    'The public site',
    'Mary lands on Gaff’s front page, which is the search renters use. “List a home” in the corner is her way in.',
    { parts: 1 },
  );
  await page.getByRole('link', { name: 'List a home' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(MARY.email);
  await mary.shot(
    page,
    'Sign in or sign up',
    'One screen for new and returning people. Mary gives her email; she could use Google or Apple. There are no passwords.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await withoutTestOnlyNotes(page);
  await mary.shot(
    page,
    'Enter your code',
    'Gaff emails Mary a six-digit code. The six boxes send themselves when the last digit goes in.',
  );
  await mary.email(
    browser,
    { to: MARY.email, subject: '' },
    'The code, by email',
    'The code is at the start of the subject, so it can be read from a notification. It works once, for ten minutes.',
  );
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(MARY.email));
  const passkey = page.getByRole('dialog', { name: 'Sign in faster next time' });
  await expect(passkey).toBeVisible();
  await mary.shot(
    page,
    'Sign in faster next time',
    'After a first sign-in on a device that can keep one, Gaff offers a passkey. Mary says “Not now”, and isn’t asked again for 30 days.',
  );
  await passkey.getByRole('button', { name: 'Not now' }).click();
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByLabel('First and last name').fill(MARY.name);
  await mary.shot(
    page,
    'Let’s get you started. What’s your name?',
    'First run asks one question per screen, four at most. The first is her name.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  if (await page.getByRole('heading', { name: /What brings you to Gaff\?$/ }).isVisible()) {
    await page.getByRole('radio', { name: 'I’m letting a home I own', exact: true }).check();
    await mary.shot(
      page,
      'What brings you to Gaff?',
      'Mary says she’s letting a home she owns. She is never asked for a business name or a licence.',
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/lettings\/new$/);

  // ───────────────────────────── Adding the home ─────────────────────────────
  mary.stage('Adding the home');
  await expect(h1(page, 'Tell Gaff about the home')).toBeVisible();
  await mary.shot(
    page,
    'Tell Gaff about the home',
    'She came in through “List a home”, so Gaff doesn’t ask what brings her here: adding a letting starts straight away. Mary could paste an advert for Gaff to read; she chooses “Fill it in myself”.',
  );
  await page.getByRole('link', { name: 'Fill it in myself' }).click();
  await expect(h1(page, 'Where is it?')).toBeVisible();
  await page.getByRole('combobox', { name: 'Eircode or address' }).fill('9 Belgrave Square');
  await expect(page.getByText(/We can’t find that\./)).toBeVisible();
  await mary.shot(
    page,
    'Where is it?',
    'One search field takes an Eircode or an address. When an address isn’t found, the line under the field says what to do.',
  );
  await page.getByRole('combobox', { name: 'Eircode or address' }).fill('');
  await page.getByRole('button', { name: 'Enter it myself' }).click();
  await page.getByLabel('Address', { exact: true }).fill(ADDRESS);
  await page.getByLabel('Town or area').fill('Ranelagh, Dublin 6');
  await page.getByLabel('County').selectOption('Dublin');
  await mary.shot(
    page,
    'Where is it? Entering the address',
    'Mary types the address herself: the address, the town or area, and the county.',
  );
  await next(page).click();
  await expect(h1(page, 'Where is it on the map?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'The home’s pin' })).toBeVisible();
  await mary.shot(
    page,
    'Where is it on the map?',
    'Gaff starts the pin in the middle of the area, from its own place index. Mary moves it to the home; nothing she types is sent to a map company.',
  );
  await next(page).click();
  await expect(h1(page, 'Rent and date')).toBeVisible();
  await page.getByLabel('Rent a month').fill('1850');
  await page.getByRole('button', { name: /^Available from/ }).click();
  await expect(page.locator('dialog[open]').last()).toBeVisible();
  await mary.shot(
    page,
    'Rent and date: choosing the day',
    'The rent, and the day the home is free. Dates are chosen from Gaff’s own picker, the same on every device.',
  );
  await chooseDay(page, isoDateInDays(30));
  await mary.shot(
    page,
    'Rent and date',
    '€1,850 a month, free in a month’s time. “Save and exit” keeps what she has so far.',
  );
  await next(page).click();
  await expect(h1(page, 'The home')).toBeVisible();
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
  await soft('parking', async () => {
    await page
      .getByRole('group', { name: 'Parking' })
      .getByRole('radio', { name: /street/i })
      .check({ timeout: 3000 });
  });
  await page
    .getByLabel('Anything else renters often ask?')
    .fill('Gas central heating\nBins are collected on Tuesdays');
  await page.getByRole('button', { name: /^Draft (a|a new) description$/ }).click();
  await expect(page.getByLabel('About this home')).not.toHaveValue('');
  await mary.shot(
    page,
    'The home',
    'The type and bedrooms are taps; the rest is offered. “Draft a description” has the AI write one from these facts alone, marked “Drafted by AI”. The test copy’s stand-in writes a plain list; Mary then puts it in her own words.',
    { parts: 4 },
  );
  await page
    .getByLabel('About this home')
    .fill(
      'A bright two-bedroom apartment on the first floor of a period house on Belgrave Square, five minutes’ walk from Ranelagh village and the Luas. The living room has tall windows and opens onto the kitchen. Both bedrooms are doubles, and there is a shared garden at the back.',
    );
  await next(page).click();
  await expect(h1(page, 'Photos')).toBeVisible();
  await page.getByLabel('Choose photos').setInputFiles(await homePhotos());
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(4, {
    timeout: 30_000,
  });
  await mary.shot(
    page,
    'Photos',
    'Mary adds four photos. Gaff keeps its own copies, turned upright with location details taken out. The first is the cover.',
  );
  await next(page).click();
  await expect(h1(page, 'Letting details')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Most people' }).check();
  await page.getByLabel('Most people who can live there').selectOption('3');
  await page.getByRole('checkbox', { name: 'No pets' }).check();
  await page.getByRole('checkbox', { name: 'No smoking indoors' }).check();
  await mary.shot(
    page,
    'Letting details',
    'What Mary asks of a tenancy comes from a fixed list: move-in date, length of stay, most people, pets. There is no free text, so nothing can be asked about who a renter is.',
  );
  await next(page).click();
  await expect(h1(page, 'Has this home been let before?')).toBeVisible();
  await page.getByLabel('No, this is its first letting').check();
  await mary.shot(
    page,
    'Has this home been let before?',
    'The rent check, one question per screen. The answers decide whether the rent-pressure-zone cap applies.',
  );
  await next(page).click();
  await expect(h1(page, 'You can set the rent at market level')).toBeVisible();
  await mary.shot(
    page,
    'You can set the rent at market level',
    'The result, with the reason. Had the cap applied, Mary could change the rent on this same screen.',
  );
  await next(page).click();

  // ───────────────────────────── Going live ─────────────────────────────
  mary.stage('Going live');
  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toBeVisible();
  await mary.shot(
    page,
    'Confirm it’s you',
    'A private landlord confirms who they are once, at their first go-live. Gaff keeps that it passed, her name and the date; never the photos.',
  );
  await page.getByRole('button', { name: 'Confirm it’s you' }).click();
  await expect(page.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await mary.shot(
    page,
    'The ID check',
    'In production Stripe Identity does this: a photo of an ID and a selfie, on Stripe’s own pages. The test copy shows a stand-in where the result is picked.',
    { kind: 'stand-in' },
  );
  await page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to go live' })).toBeVisible();
  await mary.shot(
    page,
    'Ready to go live',
    'A preview of what renters will see, and one button. The home goes on gaff.ie unless Mary unticks it.',
  );
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(h1(page, `${ADDRESS} is live`)).toBeVisible();
  await mary.shot(
    page,
    `${ADDRESS} is live`,
    'Gaff answers every enquiry from now on. One question follows: is it advertised anywhere else? Daft or MyHome would lead on to forwarding their enquiries.',
  );
  await page.getByRole('checkbox', { name: 'No', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(/\/lettings\/[0-9a-f-]+(\/test-enquiry\?live=1|\?saved=live)$/);
  const lettingId = homeIdIn(page.url());
  const lettingUrl = `/lettings/${lettingId}`;
  if (page.url().includes('/test-enquiry')) {
    await expect(h1(page, 'Send a test enquiry')).toBeVisible();
    await mary.shot(
      page,
      'Send a test enquiry',
      'On a first letting, Gaff offers to show what a renter gets, before a real one writes.',
    );
    await page.getByRole('button', { name: 'Send a test enquiry' }).click();
    await expect(page.getByRole('heading', { name: 'Here’s what a renter gets' })).toBeVisible();
    await mary.shot(
      page,
      'Here’s what a renter gets',
      'The first reply, in fixed wording a solicitor reviews. It says at the top that it comes from an AI assistant.',
    );
    await page.getByRole('link', { name: 'Done', exact: true }).click();
  }
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();
  await mary.shot(
    page,
    'The letting’s page: Overview',
    'Every letting has the same three blocks: what needs Mary, what’s happening, and what’s next.',
  );
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/view=home/);
  await mary.shot(
    page,
    'The letting’s page: Home',
    'Everything about the home in one place, each part with its own “Change”: facts, description, photos, letting details and viewing times.',
    { parts: 4 },
  );
  await soft('public page as the lister', async () => {
    const href = await page.getByRole('link', { name: 'See its page' }).getAttribute('href');
    await page.goto(href!);
    await expect(h1(page, HOME)).toBeVisible();
    await mary.shot(
      page,
      'The home on gaff.ie',
      'The home’s public page, as renters find it in search. It is built from the facts and the letting details, and says Mary’s identity is verified.',
      { parts: 2 },
    );
    await page.goto(`${lettingUrl}?view=home`);
  });
  await soft('letting menu live', async () => {
    const menu = await openLettingMenu(page, ADDRESS);
    await mary.shot(
      page,
      'The letting’s menu',
      'What isn’t an everyday task lives in the menu: the public page, the home’s details, History, and stopping or closing the letting.',
    );
    await menu.getByRole('menuitem', { name: 'Close this letting' }).click();
    await expect(h1(page, 'How did it end?')).toBeVisible();
    await mary.shot(
      page,
      'Close this letting: How did it end?',
      'A letting can be closed at any point. Gaff then tells everyone who enquired, so nobody is left waiting. Mary leaves this one open.',
    );
  });
  const [refRow] = await rows<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  const homePath = `/homes/${refRow!.ref}`;

  // Viewing times.
  await page.goto(`${lettingUrl}/viewings`);
  await mary.shot(
    page,
    'Viewing times',
    'The home’s own calendar: a week on a desktop, a day list on a phone. One button, “Add a time”.',
  );
  await page.getByRole('button', { name: 'Add a time' }).click();
  const timeSheet = page.getByRole('dialog', { name: 'Add a time' });
  await expect(timeSheet).toBeVisible();
  await timeSheet.getByRole('button', { name: /^Day/ }).click();
  await chooseDay(page, isoDateInDays(7));
  await mary.shot(
    page,
    'Add a time',
    'Mary picks a day. The rest has sensible defaults: 6pm to 7pm, one renter at a time, 15 minutes each.',
  );
  await timeSheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(timeSheet).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing time added' })).toBeVisible();
  await mary.shot(
    page,
    'Viewing times, with an evening added',
    'Four 15-minute viewings next week. Renters Mary invites will book these themselves.',
  );
  await page.goto('/today');
  await mary.shot(
    page,
    'Today',
    'Mary’s home screen. Today shows only what needs her; while nothing does, it says so.',
  );

  // ───────────────────── Niamh finds the home and makes an account ─────────────────────
  niamh.stage('Finding a home');
  const n = await someoneElse(browser);
  n.page.setDefaultTimeout(15_000);
  await n.page.goto('/');
  await expect(h1(n.page, 'What are you looking for?')).toBeVisible();
  await niamh.shot(
    n.page,
    'What are you looking for?',
    'Gaff’s front page is the search. Niamh needs no account to look.',
    { parts: 2 },
  );
  const searchBox = n.page.getByRole('combobox', { name: 'What are you looking for?' });
  await searchBox.fill('Ranel');
  await expect(n.page.getByRole('option').first()).toBeVisible();
  await niamh.shot(
    n.page,
    'Searching: suggestions as she types',
    'The one search bar takes a place, a road or a sentence. Places are suggested from Gaff’s own index; nothing she types goes to a map company.',
    { parts: 1 },
  );
  await n.page.goto('/?where=Ranelagh');
  await expect(n.page.locator(`a[href="${homePath}"]`).first()).toBeVisible();
  await niamh.shot(
    n.page,
    'Homes in Ranelagh',
    'The list and the map side by side on a desktop; on a phone, the list with a “Map” button. What Gaff understood sits above the list as chips.',
    { parts: 2 },
  );
  await soft('the map', async () => {
    await n.page.getByRole('button', { name: 'Map', exact: true }).click();
    const map = n.page.getByRole('group', { name: 'Map of the homes in this search' });
    const pin = map.getByRole('button', { name: /^€1,850 a month/ });
    for (let tries = 0; tries < 5 && !(await pin.isVisible()); tries++) {
      const cluster = map.getByRole('button', { name: /homes here: zoom in$/ }).first();
      if (await cluster.isVisible()) await cluster.click();
      else await n.page.getByRole('button', { name: 'Zoom in' }).click();
      await n.page.waitForTimeout(200);
    }
    await pin.click();
    await n.page.setViewportSize(DESKTOP);
    await n.page.waitForLoadState('networkidle');
    await expect(n.page.getByText('Finding homes')).toHaveCount(0);
    await niamh.shot(
      n.page,
      'The map, with a home’s card open',
      'Each home is a pin where its lister placed it. A pin opens the home’s card, photos and all. On a phone the map takes the whole screen.',
      { parts: 1 },
    );
    await n.page.setViewportSize(PHONE);
    await n.page.goto('/?where=Ranelagh');
  });
  await soft('filters', async () => {
    await n.page
      .getByRole('list', { name: 'What Gaff understood' })
      .getByRole('button', { name: 'Filters' })
      .click();
    await expect(n.page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await niamh.shot(
      n.page,
      'Filters',
      'Where, rent, bedrooms and the home’s facts. Every filter is about the home, never about the renter.',
    );
    await n.page
      .getByRole('dialog', { name: 'Filters' })
      .getByRole('button', { name: 'Close' })
      .click();
  });
  await soft('ordered', async () => {
    await n.page.goto('/how-results-are-ordered');
    await niamh.shot(
      n.page,
      'How results are ordered',
      'A plain page saying how search orders homes. Nobody can pay to be higher.',
    );
  });
  await soft('place page', async () => {
    await n.page.goto('/to-rent/dublin/ranelagh');
    await niamh.shot(
      n.page,
      'Homes to rent in Ranelagh',
      'Every place has a page of its own, which is the search for it already answered. It’s what a search engine finds.',
      { parts: 2 },
    );
  });
  await n.page.goto('/?where=Ranelagh');
  await n.page.locator(`a[href="${homePath}"]`).first().click();
  await expect(n.page).toHaveURL(new RegExp(`${homePath}$`));
  await expect(h1(n.page, HOME)).toBeVisible();
  await niamh.shot(
    n.page,
    'A home’s page',
    'Photos, the rent, the facts, the letting details and who it’s let by. Mary’s identity is verified, and the page says so.',
    { parts: 4 },
  );
  await soft('photo viewer', async () => {
    await n.page
      .getByRole('button', { name: /Show all \d+ photos/ })
      .first()
      .click();
    await expect(n.page.locator('dialog[open]').last()).toBeVisible();
    await niamh.shot(n.page, 'The home’s photos', 'All the photos, one at a time, full screen.');
    await n.page.keyboard.press('Escape');
  });

  niamh.stage('Making an account');
  await n.page.goto('/?where=Ranelagh');
  await n.page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
  await expect(n.page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
  await n.page.getByLabel('Email', { exact: true }).fill(NIAMH.email);
  await niamh.shot(
    n.page,
    'Sign in or sign up',
    'Looking needs no account. Niamh makes one now, so she can save homes and keep her answers. The same screen signs people in and up.',
  );
  await n.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(n.page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await withoutTestOnlyNotes(n.page);
  await niamh.shot(
    n.page,
    'Enter your code',
    'A six-digit code, emailed. No password to choose or remember.',
  );
  await n.page.getByLabel('Six-digit code').fill(await latestCodeFor(NIAMH.email));
  await n.page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  if (!new URL(n.page.url()).pathname.startsWith('/welcome')) await n.page.goto('/');
  await expect(n.page).toHaveURL(/\/welcome/);
  await n.page.getByLabel('First and last name').fill(NIAMH.name);
  await niamh.shot(
    n.page,
    'Let’s get you started. What’s your name?',
    'First run asks one question per screen. Her name is the first.',
  );
  await n.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(n.page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
  await n.page.getByRole('radio', { name: 'I’m looking for a home', exact: true }).check();
  await niamh.shot(
    n.page,
    'What brings you to Gaff?',
    'Niamh is looking for a home. She can add letting later from the same account: a person is one person, whatever they do.',
  );
  await n.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(h1(n.page, 'What are you looking for?')).toBeVisible();
  await expect(n.page.getByRole('link', { name: 'Enquiries' }).first()).toBeVisible();
  await niamh.shot(
    n.page,
    'Search, signed in',
    'That’s all of first run for a renter: two questions. She lands on Search, now with her three places: Search, Saved and Enquiries.',
    { parts: 1 },
  );

  niamh.stage('Saving homes and searches');
  await n.page.goto(homePath);
  const heart = n.page.getByRole('button', { name: 'Save this home' });
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await niamh.shot(
    n.page,
    'The home, saved',
    'Back on Mary’s flat, she taps the heart. Had she tapped it signed out, Gaff would have asked her to sign in and saved the home when she came back.',
    { parts: 1 },
  );
  niamh.stage('Saving homes and searches');
  await n.page.goto('/?where=Ranelagh');
  await n.page.getByRole('button', { name: 'Save search' }).click();
  await expect(
    n.page.getByRole('status').filter({ hasText: 'Saved. We’ll email you when a new home fits.' }),
  ).toBeVisible();
  await niamh.shot(
    n.page,
    'Saving a search',
    '“Save search” keeps Ranelagh. Gaff emails her within minutes of a new home there being listed.',
    { parts: 1 },
  );
  await n.page.goto('/saved');
  await expect(h1(n.page, 'Saved')).toBeVisible();
  await niamh.shot(n.page, 'Saved', 'Her saved searches and saved homes, in one place.', {
    parts: 2,
  });

  niamh.stage('Asking to view');
  await n.page.goto(homePath);
  await n.page
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await expect(
    n.page.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();
  await n.page.getByRole('radio', { name: '2', exact: true }).check();
  await niamh.shot(
    n.page,
    'How many people would live here, including you?',
    'Gaff already knows her name and email, so asking to view starts at the questions. It asks only what Mary’s letting details need.',
  );
  await next(n.page).click();
  await expect(n.page.getByRole('heading', { name: 'Do you have any pets?' })).toBeVisible();
  await n.page.getByRole('radio', { name: 'No', exact: true }).check();
  await niamh.shot(
    n.page,
    'Do you have any pets?',
    'A yes or no. Assistance dogs never count as pets.',
  );
  await next(n.page).click();
  await expect(
    n.page.getByRole('heading', { name: 'Anything to ask about the home?' }),
  ).toBeVisible();
  await n.page
    .getByLabel(/Your question/)
    .fill('Is there parking? Is there somewhere to keep a bike?');
  await niamh.shot(
    n.page,
    'Anything to ask about the home?',
    'An optional question. Gaff’s assistant answers what the home’s facts cover, and passes the rest to Mary.',
  );
  await n.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(h1(n.page, 'Sent')).toBeVisible();
  await niamh.shot(
    n.page,
    'Sent',
    'It says what happens next, and when. Everyone who asks hears back, either way.',
  );
  await n.page.goto('/enquiries');
  await expect(h1(n.page, 'Enquiries')).toBeVisible();
  await niamh.shot(
    n.page,
    'Enquiries',
    'Every home she has asked about, with where each one stands.',
  );
  const niamhLink = await mailLink(NIAMH.email, 'Your enquiry about');
  await niamh.email(
    browser,
    { to: NIAMH.email, subject: 'Your enquiry about' },
    'The first email',
    'The first message says plainly that it’s from an AI assistant, answers what it can from the home’s facts, and says how to reach a person.',
  );
  await openLink(n.page, niamhLink);
  await niamh.shot(
    n.page,
    'Her page for this home',
    'One page follows the home from here to move-in. It always says what happens next.',
    { parts: 3 },
  );
  await soft('change my answers', async () => {
    await n.page.getByRole('link', { name: 'Change my answers' }).click();
    await expect(n.page.getByRole('radio', { name: '2', exact: true })).toBeChecked();
    await opened(n.page);
    await niamh.shot(
      n.page,
      'Changing her answers',
      'Her answers can be changed from her page. The questions come back one per screen, already filled in.',
    );
    await n.page.goBack();
    await opened(n.page);
  });
  await soft('talk to a person', async () => {
    await n.page.getByRole('button', { name: 'Talk to a person' }).click();
    await expect(n.page.locator('dialog[open]').last()).toBeVisible();
    await niamh.shot(
      n.page,
      'Talk to a person',
      'On every one of a renter’s pages. The assistant is never the only way through.',
    );
    await n.page.keyboard.press('Escape');
  });
  await soft('privacy notice', async () => {
    await n.page.getByRole('link', { name: 'How we use your details' }).click();
    await n.page.waitForLoadState('networkidle');
    await niamh.shot(
      n.page,
      'How we use your details',
      'The privacy notice for this letting, linked from every page and email: what is collected at each stage, who sees it, and when it is deleted.',
      { parts: 3 },
    );
  });

  // Conor asks without an account.
  niamh.stage('Without an account');
  const c = await someoneElse(browser);
  c.page.setDefaultTimeout(15_000);
  await c.page.goto(homePath);
  await c.page
    .getByRole('complementary', { name: 'Ask to view' })
    .getByRole('link', { name: 'Ask to view' })
    .click();
  await expect(h1(c.page, 'Who should we reply to?')).toBeVisible();
  await c.page.getByLabel('Your name').fill(CONOR.name);
  await c.page.getByLabel('Your email').fill(CONOR.email);
  await niamh.shot(
    c.page,
    'Who should we reply to?',
    'Conor has no account and doesn’t need one. Asking to view takes a name and an email.',
  );
  await next(c.page).click();
  await expect(
    c.page.getByRole('heading', { name: 'How many people would live here, including you?' }),
  ).toBeVisible();
  await c.page.getByRole('radio', { name: '1', exact: true }).check();
  await next(c.page).click();
  await expect(c.page.getByRole('heading', { name: 'Do you have any pets?' })).toBeVisible();
  await c.page.getByRole('radio', { name: 'No', exact: true }).check();
  await next(c.page).click();
  await expect(
    c.page.getByRole('heading', { name: 'Anything to ask about the home?' }),
  ).toBeVisible();
  await c.page.getByRole('button', { name: 'Skip' }).click();
  await expect(h1(c.page, 'Sent')).toBeVisible();
  await niamh.shot(
    c.page,
    'Sent, without an account',
    'The same questions, then “Sent”. Gaff emails Conor a private link to his own page for this home.',
  );
  const conorLink = await mailLink(CONOR.email, 'Your enquiry about');
  await openLink(c.page, conorLink);
  await expect(c.page.getByRole('heading', { name: /^Thanks/ })).toBeVisible();
  await niamh.shot(
    c.page,
    'Thanks, Conor',
    'Opening the link in the first email confirms it’s him. This page is his, by private link, with no sign-in.',
    { parts: 3 },
  );

  // ───────────────────────────── Enquiries arrive ─────────────────────────────
  mary.stage('Enquiries arrive');
  mary.meanwhile(
    'Niamh found the home on Gaff and asked to view, with a question. Conor asked too, without an account.',
  );
  await expect(async () => {
    await page.goto(`${lettingUrl}?view=people`);
    await expect(page.getByRole('link', { name: CONOR.name })).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole('link', { name: NIAMH.name })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await page.goto('/today');
  await mary.shot(
    page,
    'Today, with something on it',
    'Two people are waiting to hear about viewing, and one answer waits for Mary’s say. Today lists what needs her, and nothing else.',
  );
  await page.goto(`${lettingUrl}?view=people`);
  await mary.shot(
    page,
    'The letting’s page: People',
    'Everyone who has enquired, with how many of Mary’s letting details each meets. Gaff never ranks on anything about who a person is.',
  );
  await page.getByRole('link', { name: NIAMH.name }).click();
  await expect(page.getByRole('dialog', { name: NIAMH.name })).toBeVisible();
  await mary.shot(
    page,
    'A person’s sheet',
    'Niamh’s answers beside the letting details, and a link to the conversation. Nothing about her identity is shown before the checks stage.',
  );
  await page.keyboard.press('Escape');
  await soft('ask about who has enquired', async () => {
    await page.goto(`${lettingUrl}?view=people`);
    await page.getByLabel('Ask about who’s enquired').fill('Who is the best tenant?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/^Gaff can sort people only/)).toBeVisible();
    await mary.shot(
      page,
      'Ask about who’s enquired',
      'Mary can ask in her own words, and an allowed question becomes filter chips. Anything else is declined in fixed words: Gaff sorts people only by what everyone was asked.',
    );
  });
  await page.goto('/inbox');
  await expect(h1(page, 'Inbox')).toBeVisible();
  await mary.shot(
    page,
    'Inbox',
    'Every conversation, under two chips: “Needs you” and “All”. Niamh’s is waiting on Mary.',
  );
  await page.getByRole('listitem').filter({ hasText: 'Niamh' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 2, name: NIAMH.name })).toBeVisible();
  const reply = page.getByRole('region', { name: 'Reply to Niamh' });
  await expect(reply.getByText('Drafted by AI')).toBeVisible();
  await reply
    .getByLabel(/^Gaff doesn’t know: /)
    .fill('Yes, there’s a bike rack in the shared garden at the back.');
  await mary.shot(
    page,
    'A conversation, with a draft ready',
    'Gaff answered the parking question from the home’s facts, and marks the one it can’t answer. Mary types that answer; “Remember this” adds it to the home’s facts for next time.',
    { parts: 2 },
  );
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Write to Niamh' })).toBeVisible();
  await mary.shot(
    page,
    'The reply, sent',
    'One email answers both questions. Nothing waits any more, and the reply box is there if Mary wants to write herself.',
    { parts: 2 },
  );
  await page.goto(lettingUrl);
  await mary.shot(
    page,
    'Overview, with enquiries',
    'The letting’s one task is in “Needs you”. The figures under “What’s happening” count who has enquired and how they fit what Mary asked.',
  );

  // ───────────────────────────── Choosing who views ─────────────────────────────
  mary.stage('Choosing who views');
  await page.goto(`${lettingUrl}/who-views`);
  await page.getByRole('checkbox', { name: NIAMH.name, exact: true }).check();
  await page.getByRole('checkbox', { name: CONOR.name, exact: true }).check();
  await mary.shot(
    page,
    'Choose who views',
    'Gaff ticks the top people for the places there are, in an order it explains, and Mary changes any tick. Nothing is sent until she presses “Send invitations”.',
  );
  await soft('why here', async () => {
    const why = page.getByRole('button', { name: `Why here: ${NIAMH.name}` });
    await why.click();
    await expect(why).toHaveAttribute('aria-expanded', 'true');
    await mary.shot(
      page,
      'Why here',
      'Each person’s place in the list is explained: what they meet of the letting details, and when they enquired. Nothing else goes into the order.',
    );
  });
  await next(page).click();
  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible();
  await mary.shot(
    page,
    'Check and send',
    'A last look: who is invited, and the message each will get, in fixed wording.',
  );
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByRole('heading', { name: 'Invitations sent' })).toBeVisible();
  await mary.shot(
    page,
    'Invitations sent',
    'Done, with what happens next: Niamh and Conor each choose a time themselves.',
  );

  // ───────────────────────────── Niamh books ─────────────────────────────
  niamh.stage('Booking a viewing');
  niamh.meanwhile('Mary chose who to invite to view, and invited Niamh.');
  await mailLink(NIAMH.email, 'Book a viewing');
  await niamh.email(
    browser,
    { to: NIAMH.email, subject: 'Book a viewing' },
    'The invitation',
    'An email with one button, and the evening on offer. She chooses her own time on her page, where the free times are always up to date.',
  );
  await openLink(n.page, await mailLink(NIAMH.email, 'Book a viewing'));
  await niamh.shot(
    n.page,
    'Invited to view',
    'Her page now leads with the invitation and one button, “Choose a time”.',
    { parts: 2 },
  );
  await n.page.getByRole('link', { name: 'Choose a time', exact: true }).click();
  await expect(n.page.getByRole('heading', { name: 'Choose a time' })).toBeVisible();
  await niamh.shot(n.page, 'Choose a time', 'Days, then times. Only free times are shown.');
  await n.page
    .getByRole('main')
    .getByRole('listitem')
    .getByRole('link', { name: /^\d{1,2}(:\d{2})?(am|pm)/ })
    .first()
    .click();
  await expect(n.page.getByRole('heading', { name: 'Book this viewing?' })).toBeVisible();
  if ((await n.page.getByLabel('Your mobile number').count()) > 0) {
    await n.page.getByLabel('Your mobile number').fill(NIAMH.mobile);
    await niamh.shot(
      n.page,
      'Book this viewing?',
      'A confirm step, with the time and the address. A new booking asks for a mobile number, so Mary can reach her on the day.',
    );
    await n.page.getByRole('button', { name: 'Text me a code' }).click();
    await expect(
      n.page.getByRole('heading', { name: 'Enter the code we texted you' }),
    ).toBeVisible();
    await niamh.shot(
      n.page,
      'Enter the code we texted you',
      'Gaff texts a code to check the number is hers. Entering it books the viewing.',
    );
    let texted = '';
    await expect(async () => {
      texted = await latestTextCodeFor(NIAMH.mobile);
    }).toPass({ timeout: 20_000 });
    await n.page.getByLabel('The code from the text').fill(texted);
  } else {
    await niamh.shot(
      n.page,
      'Book this viewing?',
      'A confirm step, with the time and the address.',
    );
    await n.page.getByRole('button', { name: 'Book this viewing' }).click();
  }
  await expect(n.page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await niamh.shot(
    n.page,
    'You’re booked',
    'The time, the address, “Add to my calendar” and directions. She can change the time or cancel from here.',
    { parts: 3 },
  );
  await soft('change the time', async () => {
    await n.page.getByRole('link', { name: 'Change the time' }).click();
    await expect(n.page.getByRole('heading', { name: 'Change your viewing' })).toBeVisible();
    await opened(n.page);
    await niamh.shot(
      n.page,
      'Change your viewing',
      'The other free times, and “Keep the time I have”. Choosing another moves the viewing.',
    );
    await n.page.goBack();
    await expect(n.page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  });
  await soft('cancel', async () => {
    await n.page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await expect(n.page.getByRole('heading', { name: 'Cancel your viewing?' })).toBeVisible();
    await opened(n.page);
    await niamh.shot(
      n.page,
      'Cancel your viewing?',
      'Cancelling asks once, and frees the time for someone else. Niamh keeps her viewing.',
    );
    await n.page.goBack();
    await expect(n.page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  });

  niamh.stage('Without an account');
  await openLink(c.page, await mailLink(CONOR.email, 'Book a viewing'));
  await expect(c.page.getByRole('link', { name: 'Choose a time', exact: true })).toBeVisible();
  await niamh.shot(
    c.page,
    'Conor’s invitation',
    'Conor is invited too, on the same page by private link. He doesn’t book.',
    { parts: 2 },
  );

  // ───────────────────────────── Viewing day ─────────────────────────────
  mary.stage('Viewing day');
  mary.meanwhile('Niamh booked the first time, at 6pm.');
  await page.goto('/calendar');
  await page.getByRole('link', { name: 'Next week' }).click();
  const booked = page
    .getByRole('main')
    .getByRole('link', { name: /^6pm to 7pm · Apartment 2/ })
    .locator('visible=true');
  await expect(booked).toHaveCount(1);
  await mary.shot(
    page,
    'Calendar',
    'Every home’s viewings in one calendar: a week on a desktop, a day list on a phone. Next week’s evening shows one of four places booked.',
  );
  await booked.click();
  const viewing = page.getByRole('dialog', { name: /6pm to 7pm$/ });
  await expect(viewing).toBeVisible();
  await mary.shot(
    page,
    'A viewing, opened',
    'Who is booked and when, the places left and the waiting list. Everything about a viewing opens from the viewing itself.',
  );
  await viewing.getByRole('button', { name: 'Close' }).click();
  await startViewingsNow(ADDRESS, MARY.email);
  await page.goto('/today');
  await mary.shot(
    page,
    'Today, on the day of the viewing',
    'On the day, Today leads with the viewing and who is coming.',
  );
  await page.goto(`${lettingUrl}/attendance`);
  const came = page.getByRole('group', { name: `Did ${NIAMH.name} come?` });
  await expect(came).toBeVisible();
  await withoutTestOnlyNotes(page);
  await mary.shot(
    page,
    'Mark who came',
    'After the viewing, one tap per person: came, or didn’t come.',
  );
  await came.getByRole('button', { name: 'Came' }).click();
  await expect(came.getByRole('button', { name: 'Came' })).toHaveAttribute('aria-pressed', 'true');
  await withoutTestOnlyNotes(page);
  await mary.shot(page, 'Mark who came, done', 'Niamh came. Gaff now invites her to apply.');

  // ───────────────────────────── Niamh applies ─────────────────────────────
  niamh.stage('Applying');
  niamh.meanwhile('Niamh viewed the home, and Mary marked that she came.');
  await openLink(n.page, niamhLink);
  await expect(n.page.getByRole('link', { name: 'Apply', exact: true })).toBeVisible();
  await niamh.shot(
    n.page,
    'After the viewing',
    'Her page now offers “Apply”. Work and income are asked only now, at the application, and never before a viewing.',
    { parts: 2 },
  );
  await n.page.getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(
    n.page.getByRole('heading', { name: 'How do you earn most of your income?' }),
  ).toBeVisible();
  await n.page.getByRole('radio', { name: 'From a job', exact: true }).check();
  await niamh.shot(
    n.page,
    'How do you earn most of your income?',
    'One question per screen. Every kind of income counts the same, housing assistance included.',
  );
  await next(n.page).click();
  await n.page.getByLabel('Take-home income each month').fill('5,200');
  await niamh.shot(
    n.page,
    'What’s your household’s take-home income each month?',
    'A single figure, self-declared. No documents are asked for unless she is chosen.',
  );
  await next(n.page).click();
  await expect(n.page.getByRole('heading', { name: 'Is this right?' })).toBeVisible();
  await niamh.shot(
    n.page,
    'Is this right?',
    'A check screen with a “Change” beside each answer, then “Send my application”.',
  );
  await n.page.getByRole('button', { name: 'Send my application' }).click();
  await expect(n.page.getByRole('heading', { name: 'Your application is in' })).toBeVisible();
  await niamh.shot(
    n.page,
    'Your application is in',
    'What happens next, and when: Mary chooses, and Niamh hears either way.',
    { parts: 2 },
  );

  // ───────────────────────────── Choosing an applicant ─────────────────────────────
  mary.stage('Choosing an applicant');
  mary.meanwhile('Niamh applied.');
  await page.goto(lettingUrl);
  await mary.shot(
    page,
    'Overview, with an application',
    'The letting has moved on. Its one task now is to choose an applicant.',
  );
  await page.goto(`${lettingUrl}/choose`);
  await page.getByRole('radio', { name: `Choose ${NIAMH.name}` }).check();
  await mary.shot(
    page,
    'Choose an applicant',
    'Applicants side by side, each with what they meet. Mary chooses; Gaff never recommends a person.',
  );
  await next(page).click();
  await expect(page.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
  await mary.shot(
    page,
    'Check and confirm',
    'With one applicant there is no backup to choose. Confirming starts the checks, for the chosen person only.',
  );
  await page.getByRole('button', { name: 'Start the checks' }).click();
  await expect(page.getByRole('heading', { name: 'Checks started' })).toBeVisible();
  await mary.shot(
    page,
    'Checks started',
    'Gaff asks Niamh for her checks. Mary is told when they’re back.',
  );

  mary.stage('Checks');
  await page.goto(`${lettingUrl}/checks`);
  await mary.shot(
    page,
    'The checks, under way',
    'Where each check stands while Niamh does them. Nothing of hers is shown until she shares it.',
  );

  // ───────────────────────────── Niamh's checks ─────────────────────────────
  niamh.stage('Checks');
  niamh.meanwhile('Mary chose Niamh, which starts the checks.');
  await niamh.email(
    browser,
    { to: NIAMH.email, subject: `${ADDRESS}: a few checks` },
    'The checks email',
    'Only the chosen applicant is asked for checks. The email says what’s needed and that it costs her nothing.',
  );
  await openLink(n.page, await mailLink(NIAMH.email, 'a few checks'));
  const start = n.page.getByRole('button', { name: 'Start', exact: true });
  const checkMyId = n.page.getByRole('button', { name: 'Check my ID' });
  await expect(start.or(checkMyId)).toBeVisible();
  if (await start.isVisible()) {
    await niamh.shot(
      n.page,
      'A few checks before an offer',
      'Three things: her ID, references, and work and income. One at a time, free to her.',
      { parts: 2 },
    );
    await start.click();
    const codeBox = n.page.getByLabel('Six-digit code');
    await expect(codeBox).toBeVisible();
    await niamh.shot(
      n.page,
      'A code, before anything sensitive',
      'Before the checks, Gaff emails a one-time code to make sure the person on the link is Niamh.',
    );
    await expect(async () => {
      await codeBox.fill(await latestLinkCodeFor(NIAMH.email));
    }).toPass({ timeout: 20_000 });
    await expect(codeBox).toBeHidden();
  }
  await expect(checkMyId).toBeVisible();
  await niamh.shot(
    n.page,
    'A few checks before an offer',
    'Three things, one at a time, all free to her: her ID, references, and work and income. The ID check is a photo of an ID and a selfie; Mary sees only that it passed, and the name.',
    { parts: 2 },
  );
  await n.page.getByRole('button', { name: 'Check my ID' }).click();
  await expect(n.page.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await niamh.shot(
    n.page,
    'The ID check',
    'In production this is Stripe Identity’s own page. The test copy shows a stand-in where the result is picked.',
    { kind: 'stand-in' },
  );
  await n.page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(
    n.page.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  await niamh.shot(
    n.page,
    'Keep this, so you never have to do it again?',
    'Niamh can keep the result on her own profile and reuse it for the next home. Gaff keeps that it passed, her name and the date; never an image.',
  );
  await n.page.getByRole('button', { name: 'Keep it' }).click();
  await expect(n.page.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
  await n.page.getByRole('radio', { name: 'No', exact: true }).check();
  await niamh.shot(
    n.page,
    'Have you rented before?',
    'References start with a question. A “Yes” asks for her last landlord’s name and email, and Gaff writes to them.',
  );
  await next(n.page).click();
  await expect(
    n.page.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await n.page.getByRole('radio', { name: 'No', exact: true }).check();
  await niamh.shot(
    n.page,
    'Is there an employer we can ask?',
    'The same for an employer. “No” is a fine answer: her documents show her work and income.',
  );
  await n.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(n.page.getByRole('heading', { name: 'Your work and income' })).toBeVisible();
  await niamh.shot(
    n.page,
    'Your work and income',
    'She adds documents that show it: a payslip, a contract, a statement. Asked for only now that she’s chosen.',
    { parts: 2 },
  );
  await n.page.getByLabel('What is it?').selectOption({ label: 'Payslip' });
  await n.page.getByLabel('Document', { exact: true }).setInputFiles(aPayslipFile(NIAMH.name));
  await n.page.getByRole('button', { name: /^Add (this|another) document$/ }).click();
  await expect(n.page.getByRole('heading', { level: 4, name: 'Payslip' })).toHaveCount(1);
  await niamh.shot(
    n.page,
    'Your work and income, with a payslip read',
    'Gaff’s AI reads the payslip and shows Niamh what it found before anyone else sees it. A PPS number on a document is never read out or kept.',
    { parts: 3 },
  );
  await n.page.getByRole('link', { name: 'Check and share' }).click();
  await expect(n.page.getByRole('heading', { name: /^Share with / })).toBeVisible();
  await niamh.shot(
    n.page,
    'Share with Mary',
    'Everything Mary will see, in one place, and one button to share it. Nothing goes until Niamh says so.',
    { parts: 3 },
  );
  await n.page.getByRole('button', { name: /^Share with / }).click();
  await expect(n.page.getByRole('heading', { name: 'That’s everything from you' })).toBeVisible();
  await niamh.shot(n.page, 'That’s everything from you', 'Done, with what happens next and when.', {
    parts: 2,
  });

  // ───────────────────────────── Mary: checks back, the offer ─────────────────────────────
  mary.meanwhile('Niamh did her ID check, answered about references and shared a payslip.');
  await expect(async () => {
    await page.goto(`${lettingUrl}/checks`);
    await expect(page.getByText(`Verified: ${NIAMH.name}.`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await mary.shot(
    page,
    'The checks are back',
    'One screen: her ID verified, her documents shared, and what was asked of referees. Only now, at the checks stage, does Mary see anything about Niamh’s identity.',
    { parts: 3 },
  );
  await soft('check detail', async () => {
    await page.getByRole('link', { name: 'See what they shared' }).click();
    await expect(h1(page, /checks$/)).toBeVisible();
    await mary.shot(
      page,
      'One applicant’s checks',
      'What Niamh chose to share: her verified name, and what the AI read from her payslip against the rent. The decision is Mary’s, by the same standard for everyone.',
      { parts: 3 },
    );
  });

  mary.stage('The offer');
  await page.goto(lettingUrl);
  await page.goto(`${lettingUrl}/comparables`);
  await expect(h1(page, 'Comparable rent 1 of 3')).toBeVisible();
  await page.getByLabel('Area').fill('Dublin 6');
  await page.getByLabel('Rent a month').fill('1,800');
  await mary.shot(
    page,
    'Comparable rent 1 of 3',
    'Before an offer, Gaff asks for three comparable rents from the RTB’s Rent Register, for the rent-setting pack. One home per screen, with the type and bedrooms filled in from this one.',
  );
  await next(page).click();
  for (const [index, rent] of [
    [2, '1,850'],
    [3, '1,950'],
  ] as const) {
    await expect(h1(page, `Comparable rent ${index} of 3`)).toBeVisible();
    await page.getByLabel('Area').fill('Dublin 6');
    await page.getByLabel('Rent a month').fill(rent);
    await page
      .getByRole('button', { name: index < 3 ? 'Next' : 'Save comparables', exact: true })
      .click();
  }
  await expect(page.getByText('Comparables saved for the rent-setting pack.')).toBeVisible();
  await mary.shot(
    page,
    'Comparables saved',
    'Back on the letting’s Home, with the three rents kept for the rent-setting pack.',
    { parts: 1 },
  );
  await page.goto(`${lettingUrl}/offer`);
  await expect(page.getByRole('heading', { name: 'The offer', exact: true })).toBeVisible();
  await mary.shot(
    page,
    'The offer',
    'The terms, filled in from the letting: rent, deposit, start date. The deposit and first month are each capped at one month’s rent.',
    { parts: 2 },
  );
  await next(page).click();
  await expect(page.getByRole('button', { name: 'Send the offer to Niamh' })).toBeVisible();
  await mary.shot(
    page,
    'Check and send the offer',
    'A preview of the message Niamh will get, in fixed wording. Mary sends it; Gaff never offers a home on its own.',
    { parts: 2 },
  );
  await page.getByRole('button', { name: 'Send the offer to Niamh' }).click();
  await expect(page.getByRole('heading', { name: 'Offer sent' })).toBeVisible();
  await mary.shot(page, 'Offer sent', 'Sent, with what happens next: Niamh accepts or declines.');

  // ───────────────────────────── Niamh: the offer ─────────────────────────────
  niamh.stage('The offer');
  niamh.meanwhile('Mary saw the checks and sent Niamh an offer.');
  await niamh.email(
    browser,
    { to: NIAMH.email, subject: 'An offer' },
    'The offer email',
    'The offer arrives by email with its terms and one button. It says there are no other fees, and that nothing is paid through Gaff.',
  );
  await openLink(n.page, await mailLink(NIAMH.email, 'An offer'));
  await expect(n.page.getByRole('button', { name: 'Accept the offer' })).toBeVisible();
  await niamh.shot(
    n.page,
    'The offer',
    'The rent, the start date and one total to pay before moving in. “Accept the offer” or “Decline”.',
    { parts: 3 },
  );
  await soft('decline', async () => {
    await n.page.getByRole('link', { name: 'Decline', exact: true }).click();
    await expect(n.page.getByRole('heading', { name: 'Decline the offer?' })).toBeVisible();
    await opened(n.page);
    await niamh.shot(
      n.page,
      'Decline the offer?',
      'Declining asks once, so it isn’t done by mistake. Niamh goes back.',
    );
    await n.page.goBack();
    await opened(n.page);
  });
  await n.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    n.page.getByText(/You’ve accepted the offer\. Your tenancy starts on/),
  ).toBeVisible();
  await niamh.shot(
    n.page,
    'Offer accepted',
    'Accepted. Her page becomes the tenancy’s steps: sign, pay, move in.',
    { parts: 3 },
  );

  // ───────────────────────────── The tenancy ─────────────────────────────
  mary.stage('The tenancy');
  mary.meanwhile('Niamh accepted the offer.');
  await page.goto(lettingUrl);
  await mary.shot(
    page,
    'Overview, offer accepted',
    'The letting is at its last part. Its task now is the tenancy’s first step.',
  );
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'The tenancy, step by step' })).toBeVisible();
  await mary.shot(
    page,
    'The tenancy, step by step',
    'Agreement, payment, RTB registration, move-in. One step is open at a time.',
    { parts: 2 },
  );
  await page.getByRole('link', { name: 'Send the agreement', exact: true }).click();
  await expect(h1(page, 'Send the agreement to Niamh')).toBeVisible();
  await mary.shot(
    page,
    'Send the agreement to Niamh',
    'Gaff fills the agreement in from the letting and the offer. Mary sends it to sign, or records that both signed on paper.',
    { parts: 2 },
  );
  await soft('agreement page', async () => {
    await page.goto(`${lettingUrl}/tenancy/agreement`);
    await mary.shot(
      page,
      'The tenancy agreement',
      'The agreement in full, as Niamh will read it, with a copy to download.',
      { parts: 3 },
    );
  });
  await soft('rent pack', async () => {
    await page.goto(`${lettingUrl}/tenancy/rent-pack`);
    await mary.shot(
      page,
      'The rent-setting pack',
      'What the law asks a landlord to give a tenant about the rent: how it was set, and the three comparables.',
      { parts: 3 },
    );
  });
  await page.goto(`${lettingUrl}/tenancy/send`);
  await page.getByRole('button', { name: 'Send to Niamh to sign' }).click();
  await expect(h1(page, 'Sent to Niamh')).toBeVisible();
  await mary.shot(page, 'Sent to Niamh', 'Sent. Mary signs after Niamh has.');

  niamh.stage('Signing and paying');
  niamh.meanwhile('Mary sent the tenancy agreement.');
  await niamh.email(
    browser,
    { to: NIAMH.email, subject: `${ADDRESS}: your tenancy agreement` },
    'The agreement email',
    'An email with one button, to read and sign.',
  );
  await openLink(n.page, await mailLink(NIAMH.email, 'your tenancy agreement'));
  await expect(h1(n.page, 'Your tenancy agreement')).toBeVisible();
  await niamh.shot(
    n.page,
    'Your tenancy agreement',
    'The home at the top, links to each section, and a copy to download. She reads it on any device.',
    { parts: 3 },
  );
  await n.page.getByLabel('Type your full name to sign').fill(NIAMH.name);
  await n.page.getByLabel('I’ve read the agreement, and I agree to sign it electronically').check();
  const wholeAgreement = await from(n.page, '[aria-labelledby="sign-title"]');
  await niamh.shot(
    n.page,
    'Sign your agreement',
    'At the end of the agreement: she types her full name and ticks that she has read it. That is her signature.',
    { parts: 1 },
  );
  await wholeAgreement();
  await n.page.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(n.page.getByRole('heading', { name: 'You’ve signed' })).toBeVisible();
  await niamh.shot(n.page, 'You’ve signed', 'Signed. Mary signs next, and then it’s time to pay.', {
    parts: 2,
  });

  mary.meanwhile('Niamh read the agreement and signed it.');
  await page.goto(`${lettingUrl}/tenancy/sign`);
  await expect(h1(page, 'Sign the agreement')).toBeVisible();
  await page.getByLabel('Type your full name to sign').fill(MARY.name);
  await page.getByLabel(/I agree to sign/).check();
  await mary.shot(
    page,
    'Sign the agreement',
    'Mary signs the same way: her full name, and a tick.',
    { parts: 2 },
  );
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(h1(page, 'Signed by both sides')).toBeVisible();
  await mary.shot(
    page,
    'Signed by both sides',
    'Both have a copy. Next is the deposit and first month’s rent.',
  );
  await page.goto(`${lettingUrl}/tenancy/payment`);
  await page.getByLabel('Name on the account').fill('Mary Byrne');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await mary.shot(
    page,
    'Where does Niamh pay?',
    'Mary’s own bank account. Gaff never holds money: the deposit and rent go straight from Niamh to Mary.',
  );
  await page.getByRole('button', { name: 'Save the account' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm it’s you' });
  await expect(confirm).toBeVisible();
  await mary.shot(
    page,
    'Confirm it’s you',
    'Changing where money is paid is one of three things that ask Mary to confirm it’s her first.',
  );
  await confirm.getByRole('button', { name: /^Email me a code/ }).click();
  await expect(confirm.getByLabel('Six-digit code')).toBeVisible();
  await mary.shot(
    page,
    'Confirm it’s you: the code',
    'A code by email, as at sign-in. The form she was on then sends itself.',
  );
  await expect(async () => {
    await confirm
      .getByLabel('Six-digit code')
      .fill(await latestCodeFor(MARY.email, 'confirm'), { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const ring = h1(page, 'A number Niamh can ring');
  const ask = h1(page, 'Ask Niamh for the deposit and first month’s rent');
  await expect(ring.or(ask)).toBeVisible();
  if (await ring.isVisible()) {
    await page.getByLabel('Phone number').fill('087 765 4321');
    await mary.shot(
      page,
      'A number Niamh can ring',
      'Before paying anyone, a renter should be able to ring and check the account is right. Mary gives a number.',
    );
    await page.getByRole('button', { name: 'Save the number' }).click();
  }
  await expect(ask).toBeVisible();
  await mary.shot(
    page,
    'Ask Niamh for the deposit and first month’s rent',
    'The amounts, each capped at one month’s rent, and the message Niamh will get.',
    { parts: 2 },
  );
  await page.getByRole('button', { name: 'Ask Niamh to pay' }).click();
  await expect(h1(page, 'Asked Niamh to pay')).toBeVisible();
  await mary.shot(page, 'Asked Niamh to pay', 'Sent. Mary says when the money has arrived.');

  niamh.meanwhile('Mary signed too, and asked for the deposit and first month’s rent.');
  await openLink(n.page, niamhLink);
  await niamh.shot(
    n.page,
    'Her tenancy, step by step',
    'Her page lists the steps to move-in. Signing is done; paying is next.',
    { parts: 3 },
  );
  await soft('how to pay', async () => {
    await n.page.getByRole('link', { name: 'See how to pay' }).click();
    await expect(
      n.page.getByRole('heading', { name: 'Pay the deposit and first month’s rent' }),
    ).toBeVisible();
    await opened(n.page);
    await niamh.shot(
      n.page,
      'How to pay',
      'One total, Mary’s account with copy buttons, and a number to ring to check it. Nothing is paid to Gaff, and there are no fees.',
      { parts: 3 },
    );
  });

  await page.goto(`${lettingUrl}/tenancy/received`);
  await mary.shot(
    page,
    'Has Niamh’s payment arrived?',
    'Mary checks her own account and says when it’s in.',
  );
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Niamh has a receipt.')).toBeVisible();
  await mary.shot(page, 'Payment received', 'Recorded. Gaff sends Niamh a receipt.');
  niamh.meanwhile('Niamh paid Mary directly, and Mary confirmed the money had arrived.');
  await openLink(n.page, niamhLink);
  await soft('pps', async () => {
    await expect(n.page.getByRole('heading', { name: 'Your PPS number' })).toBeVisible();
    await n.page.getByRole('textbox', { name: 'PPS number' }).fill('1234567T');
    await niamh.shot(
      n.page,
      'Your PPS number',
      'Asked once, after payment, for one thing only: registering the tenancy with the RTB. She can skip it and give it to Mary herself. It is deleted once the tenancy is registered.',
    );
    await n.page.getByRole('button', { name: 'Save', exact: true }).click();
    await opened(n.page);
  });
  await niamh.shot(
    n.page,
    'Paid',
    'Her page shows the payment done, and Gaff has emailed her a receipt. There is nothing for her to do until she gets the keys.',
    { parts: 3 },
  );

  mary.meanwhile('Niamh gave her PPS number for the registration.');
  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await expect(h1(page, 'Register with the RTB')).toBeVisible();
  await page.getByLabel('RTB registration number').fill('RT0054321');
  await mary.shot(
    page,
    'Register with the RTB',
    'Everything the RTB’s form asks, laid out to copy across, with a link to the RTB. The tenant’s PPS number stays hidden until Mary presses “Show”. She registers there and records the number here.',
    { parts: 3 },
  );
  await page.getByRole('button', { name: 'I’ve registered it' }).click();
  await expect(h1(page, 'Registered with the RTB')).toBeVisible();
  await mary.shot(page, 'Registered with the RTB', 'Recorded. Move-in is the last step.');
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Hand over the keys', exact: true }).click();
  await expect(h1(page, 'Hand over the keys')).toBeVisible();
  await page.getByLabel('Keys handed over').check();
  await mary.shot(page, 'Hand over the keys', 'A short move-in checklist, and the inventory.', {
    parts: 2,
  });
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Keys handed over')).toBeChecked();
  await page.getByRole('link', { name: 'Add an item' }).click();
  await page.getByLabel('Room').fill('Kitchen');
  await page.getByLabel('Item', { exact: true }).fill('Fridge-freezer');
  await page.getByRole('group', { name: 'Condition' }).getByRole('radio', { name: 'Good' }).check();
  await mary.shot(
    page,
    'Add to the inventory',
    'One item at a time: the room, the item and its condition.',
  );
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText(/Added Fridge-freezer, Kitchen\. 1 item so far\./)).toBeVisible();
  for (const [room, item] of [
    ['Living room', 'Sofa'],
    ['Bedroom 1', 'Double bed and mattress'],
  ] as const) {
    await page.getByLabel('Room').fill(room);
    await page.getByLabel('Item', { exact: true }).fill(item);
    await page
      .getByRole('group', { name: 'Condition' })
      .getByRole('radio', { name: 'Good' })
      .check();
    await page.getByRole('button', { name: 'Add to the inventory' }).click();
    await expect(page.getByText(new RegExp(`Added ${item}`))).toBeVisible();
  }
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Save and share with Niamh' }).click();
  await expect(h1(page, 'Keys handed over')).toBeVisible();
  await mary.shot(
    page,
    'Keys handed over',
    'The inventory goes to Niamh to confirm as a fair record.',
  );

  // ───────────────────────────── Niamh moves in ─────────────────────────────
  niamh.stage('Moving in');
  niamh.meanwhile('Mary registered the tenancy with the RTB, and handed over the keys.');
  await openLink(n.page, niamhLink);
  const inventory = n.page.getByRole('link', { name: 'Check the inventory' });
  await expect(inventory).toBeVisible();
  await niamh.shot(
    n.page,
    'The inventory is ready',
    'With the keys handed over, her page asks for the last step: check the inventory.',
    { parts: 3 },
  );
  await inventory.click();
  await expect(n.page.getByRole('heading', { name: 'Your move-in inventory' })).toBeVisible();
  await niamh.shot(
    n.page,
    'Your move-in inventory',
    'Each item with its condition, and “Something’s not right” beside each one.',
    { parts: 3 },
  );
  await n.page.getByRole('button', { name: 'This is a fair record' }).click();
  await expect(n.page.getByRole('heading', { name: 'You’ve confirmed it' })).toBeVisible();
  await niamh.shot(n.page, 'You’ve confirmed it', 'Confirmed. Both sides have the same record.');
  await n.page.getByRole('link', { name: 'Back to your tenancy' }).click();
  await expect(n.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await niamh.shot(
    n.page,
    'Welcome home',
    'The end of the journey. Her tenancy’s steps are all done, and her agreement stays on this page to read.',
    { parts: 3 },
  );

  // ───────────────────────────── Finishing ─────────────────────────────
  mary.stage('Finishing');
  mary.meanwhile('Niamh confirmed the inventory as a fair record.');
  await page.goto(`${lettingUrl}/tenancy`);
  await mary.shot(
    page,
    'The tenancy, all steps done',
    'Every step is ticked. One thing is left: finish the letting.',
    { parts: 2 },
  );
  await page.getByRole('link', { name: 'Finish this letting', exact: true }).first().click();
  await expect(h1(page, 'Finish this letting')).toBeVisible();
  await mary.shot(
    page,
    'Finish this letting',
    'Finishing archives the letting and starts the clock on deleting personal details. The signed agreement and the packs are Mary’s to save first.',
  );
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const usual = h1(page, 'Before Gaff, how long did a letting usually take?');
  const results = h1(page, `${ADDRESS} is let`);
  await expect(usual.or(results)).toBeVisible();
  if (await usual.isVisible()) {
    await page.getByText('About a month', { exact: true }).click();
    await mary.shot(
      page,
      'Before Gaff, how long did a letting usually take?',
      'Asked once, so the results can compare this letting with her usual.',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(h1(page, 'And how many hours of your own time?')).toBeVisible();
    await page.getByText('About 10 hours', { exact: true }).click();
    await mary.shot(
      page,
      'And how many hours of your own time?',
      'The second half of the same question.',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(results).toBeVisible();
  await mary.shot(
    page,
    `${ADDRESS} is let`,
    'The results: days from first enquiry to let, and Mary’s own time, beside her usual. One next action.',
    { parts: 2 },
  );
  await page.goto(lettingUrl);
  await expect(needsYouBlock(page)).toContainText('This letting is closed.');
  await mary.shot(
    page,
    'Overview, closed',
    'The letting is closed. Its record stays, and renters’ details are deleted on their dates by Gaff’s own jobs.',
  );
  await soft('letting menu', async () => {
    const menu = await openLettingMenu(page, ADDRESS);
    await mary.shot(
      page,
      'The closed letting’s menu',
      'History, and “Let it again”, which starts the next letting of this home with everything carried over.',
    );
    await menu.getByRole('menuitem', { name: 'History' }).click();
    await expect(h1(page, 'History')).toBeVisible();
    await mary.shot(
      page,
      'History',
      'Every message, booking and decision, newest first, with who did it. It can’t be edited, so Mary can stand over it if she’s ever asked.',
      { parts: 3 },
    );
  });
  // Conor hears.
  niamh.stage('If the home goes to someone else');
  niamh.meanwhile(
    'Niamh accepted Mary’s offer, so the home was let. Everyone else who enquired was told straight away.',
  );
  await soft('conor outcome email', async () => {
    await niamh.email(
      browser,
      { to: CONOR.email, subject: '' },
      'The email that says so',
      'Nobody is left wondering. The message is in fixed wording, and gives no reason about any person.',
    );
  });
  await soft('conor closed page', async () => {
    await openLink(c.page, conorLink);
    await niamh.shot(
      c.page,
      `${ADDRESS} has been let`,
      'Conor’s page says plainly that the home went to someone else, and the date his details will be deleted from Gaff.',
      { parts: 2 },
    );
  });

  // ───────────────────────────── Around Gaff: Mary ─────────────────────────────
  mary.stage('Around Gaff');
  await page.goto('/today');
  await mary.shot(page, 'Today, with nothing waiting', 'With the home let, nothing needs Mary.');
  await page.goto('/inbox?show=all');
  await mary.shot(
    page,
    'Inbox, everything',
    'Under “All”, every conversation of the letting stays readable, with what Gaff sent for Mary in each.',
  );
  await soft('account menu', async () => {
    await openAccountMenu(page);
    await mary.shot(
      page,
      'The account menu',
      'On the avatar: “My own homes”, a way over to renting or to an agency, then Profile, Settings, Help and Sign out.',
    );
    await page.keyboard.press('Escape');
  });
  await page.goto('/settings');
  await expect(h1(page, 'Settings')).toBeVisible();
  await mary.shot(page, 'Settings', 'A short list. Each line opens one page.', { parts: 2 });
  const settings: Array<[string, string, string]> = [
    [
      '/settings/enquiries',
      'Settings: Enquiries',
      'Mary’s own Gaff address. If she advertises on Daft or MyHome too, forwarding their enquiries here lets Gaff answer every one.',
    ],
    [
      '/settings/assistant',
      'Settings: The assistant',
      'Whether Gaff’s answers wait for Mary before they go. Either way it answers only from the home’s facts, and fixed messages always go straight out.',
    ],
    [
      '/settings/income',
      'Settings: Income rule',
      'The take-home income Mary looks for, as a multiple of the rent. It is the same for everyone, renters see it before they apply, and housing support always counts as income.',
    ],
    [
      '/settings/payment',
      'Settings: Where tenants pay',
      'The account a new tenant pays into, kept for next time. Changing it asks Mary to confirm it’s her.',
    ],
  ];
  for (const [href, title, caption] of settings) {
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await mary.shot(page, title, caption, { parts: 2 });
  }
  await soft('mary profile', async () => {
    await page.goto('/profile');
    await expect(h1(page, 'Profile')).toBeVisible();
    await mary.shot(
      page,
      'Profile',
      'Mary’s own details, how she signs in, and her verified identity. A person’s profile is theirs, not an organisation’s.',
      { parts: 3 },
    );
  });
  await soft('mary help', async () => {
    await page.goto('/help');
    await mary.shot(
      page,
      'Help',
      'Help is a placeholder for now. It links to two pages about search: how results are ordered, and where the map and place data come from.',
      { parts: 2 },
    );
  });

  await soft('let it again', async () => {
    await page.goto(lettingUrl);
    const menu = await openLettingMenu(page, ADDRESS);
    await menu.getByRole('menuitem', { name: 'Let it again' }).click();
    await expect(h1(page, 'Here’s the home from last time')).toBeVisible();
    await mary.shot(
      page,
      'Here’s the home from last time',
      'When the flat is next free, “Let it again” starts a new letting with everything carried over. Mary checks the rent and the date, and goes live in one step.',
      { parts: 3 },
    );
  });
  await soft('mary renting', async () => {
    await page.goto('/today');
    const menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'Find a home to rent' }).click();
    await expect(h1(page, 'What are you looking for?')).toBeVisible();
    await mary.shot(
      page,
      'The same account, renting',
      '“Find a home to rent” in the account menu opens the renting side for the same person. Mary’s lettings stay under “My own homes”.',
      { parts: 1 },
    );
  });

  // ───────────────────────────── Around Gaff: Niamh ─────────────────────────────
  niamh.stage('Your account');
  await n.page.goto('/enquiries');
  await niamh.shot(n.page, 'Enquiries, afterwards', 'The home she rented, with where it ended.');
  await soft('niamh account menu', async () => {
    await openAccountMenu(n.page);
    await niamh.shot(
      n.page,
      'The account menu',
      'Profile, Help and Sign out, and two ways to add letting to the same account: a home she owns, or an agency.',
    );
    await n.page.keyboard.press('Escape');
  });
  await soft('niamh profile', async () => {
    await n.page.goto('/profile');
    await expect(h1(n.page, 'Profile')).toBeVisible();
    await niamh.shot(
      n.page,
      'Profile',
      'Her details, her saved searches, her answers, her income and her kept ID check. There is no photo and no free text, only she can see it, and nobody letting a home can browse profiles.',
      { parts: 4 },
    );
    await n.page.getByRole('button', { name: 'Delete my profile' }).click();
    await expect(n.page.locator('dialog[open]').last()).toBeVisible();
    await niamh.shot(
      n.page,
      'Delete my profile',
      'Deleting is hers to do at any time. It asks once, and says exactly what goes.',
    );
    await n.page.keyboard.press('Escape');
  });
  await soft('niamh help', async () => {
    await n.page.goto('/help');
    await niamh.shot(
      n.page,
      'Help',
      'Help is a placeholder for now. It links to two pages about search: how results are ordered, and where the map and place data come from.',
      { parts: 2 },
    );
  });

  await n.context.close();
  await c.context.close();
});

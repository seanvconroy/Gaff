import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { E2E_DATABASE_URL } from '../../playwright.config';

/**
 * The deck's camera. A journey in `tests/deck` walks Gaff through its real screens and calls
 * `shot` on every one: the screen is photographed as it stands at desktop width and at phone
 * width, and a line is added to the run's manifest (`screenshots/deck/<run>/manifest.json`),
 * which `scripts/deck/build.ts` lays out as the deck.
 *
 * A screen longer than the window is photographed as a person meets it: the top first, then
 * scrolled down, a window at a time.
 */

export const DESKTOP = { width: 1280, height: 800 } as const;
export const PHONE = { width: 390, height: 844 } as const;

/** Whose journey a slide belongs to: the deck has one chapter for each. */
export type Journey = 'landlord' | 'renter' | 'agent';
/** Who is looking at the screen. */
export type Actor = 'landlord' | 'renter' | 'agent' | 'teammate' | 'owner' | 'referee' | 'gaff';
/** A product screen, an email Gaff sent, or a stand-in for another company's screen. */
export type Kind = 'screen' | 'email' | 'stand-in';

export type Entry = {
  id: string;
  journey: Journey;
  stage: string;
  title: string;
  caption: string;
  actor: Actor;
  kind: Kind;
  /** Where the screen is, with IDs and private tokens taken out. */
  path: string;
  /** What happened elsewhere just before this screen ("Mary chose who views"). */
  meanwhile?: string;
  desktop: string[];
  phone: string[];
};

export type ShotOptions = {
  actor?: Actor;
  kind?: Kind;
  /** The most windows of a long page to photograph at each width (3 unless set). */
  parts?: number;
};

let dir = '';
let entries: Entry[] = [];
const pending = new Map<Journey, string>();

/** Starts a run: its screenshots and manifest go to `screenshots/deck/<name>`. */
export function startRun(name: string): void {
  dir = join('screenshots', 'deck', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  entries = [];
  pending.clear();
  save();
}

function save(): void {
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(entries, null, 2)}\n`);
}

const slug = (words: string) =>
  words
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

/** A page's address as the deck shows it: no IDs, no private tokens. */
function shownPath(url: string): string {
  const { pathname, search } = new URL(url);
  const clean = (part: string) =>
    part
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '…')
      .replace(/[A-Za-z0-9_-]{20,}/g, '…');
  const query = search.length > 1 && search.length < 60 ? clean(search) : '';
  return `${clean(pathname)}${query}`;
}

/** Waits until the page has stopped loading, moving and fading. */
async function rest(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.race([
      (async () => {
        await document.fonts.ready;
        await Promise.all(
          document.getAnimations().map((animation) => animation.finished.catch(() => null)),
        );
      })(),
      wait(3000),
    ]);
  });
}

/**
 * Waits for the pictures in view to arrive (a lazy one starts loading when scrolled to), and for
 * anything still shown as a skeleton: a list that follows the map loads again when the map moves.
 */
async function picturesInView(page: Page): Promise<void> {
  await page.waitForTimeout(150);
  await page
    .waitForFunction(() => !document.querySelector('[class*="Skeleton"]'), null, { timeout: 8000 })
    .catch(() => {});
  await page.evaluate(async () => {
    const inView = [...document.images].filter((image) => {
      const box = image.getBoundingClientRect();
      return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
    });
    await Promise.race([
      Promise.all(
        inView.map((image) =>
          image.complete
            ? null
            : new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              }),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  });
}

/**
 * Takes out of the picture what only a copy with the development tools shows (DEV_TOOLS): the
 * note about the development outbox, "Testing only" on the attendance screen, and the menu's
 * made-up enquiries. Nobody using Gaff sees them.
 */
async function hideDevelopmentTools(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (!document.getElementById('deck-hides')) {
      const style = document.createElement('style');
      style.id = 'deck-hides';
      style.textContent =
        'p:has(> a[href="/dev/outbox"]), [aria-labelledby="dev-heading"], [data-deck-hidden] { display: none !important; }';
      document.head.append(style);
    }
    for (const item of document.querySelectorAll('[role="menuitem"]')) {
      if (/made-up|test enquir/i.test(item.textContent ?? '')) {
        item.setAttribute('data-deck-hidden', '');
      }
    }
  });
}

/** One screen at one width: the files it was saved to, top of the page first. */
async function photograph(
  page: Page,
  id: string,
  device: 'desktop' | 'phone',
  parts: number,
): Promise<string[]> {
  const size = device === 'desktop' ? DESKTOP : PHONE;
  await page.setViewportSize(size);
  await hideDevelopmentTools(page);
  await rest(page);
  const was = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const { height, open } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    // Something open over the page (a sheet, a menu) is the view: the page behind doesn't scroll.
    open: !!document.querySelector('dialog[open]'),
  }));
  const files: string[] = [];
  const take = async (): Promise<void> => {
    await picturesInView(page);
    const file = `${id}-${device}-${files.length + 1}.png`;
    await page.screenshot({ path: join(dir, file) });
    files.push(file);
  };

  if (open || height <= size.height + 8) {
    await take();
  } else if (height <= size.height * 1.3) {
    // A little longer than the window: one picture of all of it, not a second of its last lines.
    await page.setViewportSize({ width: size.width, height });
    await rest(page);
    await take();
    await page.setViewportSize(size);
  } else {
    // As few windows as show the whole page, spread evenly; a very long page is cut short. Each
    // overlaps the last by a seventh or more, so nothing is lost under a bar that stays put.
    const below = height - size.height;
    const needed = Math.ceil(below / (size.height * 0.85)) + 1;
    const count = Math.min(needed, parts);
    const step = needed <= parts ? below / (needed - 1) : size.height * 0.9;
    for (let part = 0; part < count; part++) {
      const top = Math.round(part * step);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
      await take();
    }
  }
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), was);
  return files;
}

async function record(
  page: Page,
  entry: Omit<Entry, 'id' | 'desktop' | 'phone' | 'meanwhile'>,
  parts: number,
): Promise<void> {
  const id = `${String(entries.length + 1).padStart(3, '0')}-${entry.journey}-${slug(entry.title)}`;
  const was = page.viewportSize();
  const desktop = await photograph(page, id, 'desktop', parts);
  const phone = await photograph(page, id, 'phone', parts);
  if (was) await page.setViewportSize(was);
  await rest(page);
  const meanwhile = pending.get(entry.journey);
  pending.delete(entry.journey);
  entries.push({ id, ...entry, ...(meanwhile ? { meanwhile } : {}), desktop, phone });
  save();
}

/** The newest email to this address whose subject is, or starts with, these words. */
async function emailHtml(to: string, subject: string): Promise<{ subject: string; html: string }> {
  for (let tries = 0; tries < 60; tries++) {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ subject: string; html: string | null; text: string }>(
        `select subject, html, text from dev_outbox
         where to_address = $1 and subject like $2 || '%' order by created_at desc limit 1`,
        [to, subject],
      );
      const found = rows[0];
      if (found) {
        return {
          subject: found.subject,
          html: found.html ?? `<pre style="font: 16px/1.5 sans-serif">${found.text}</pre>`,
        };
      }
    } finally {
      await client.end();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email “${subject}” has been sent to ${to}`);
}

/**
 * One person's journey, told a screen at a time:
 *
 *   const mary = storyOf('landlord');
 *   mary.stage('Signing up');
 *   await mary.shot(page, 'Sign in or sign up', 'Mary gives her email. There is no password.');
 *
 * `stage` starts a section of the journey; every shot after it belongs to it. `meanwhile` says
 * what someone else did off screen, and is shown with this journey's next shot.
 */
export function storyOf(journey: Journey) {
  let stage = '';
  return {
    stage(name: string): void {
      stage = name;
    },
    meanwhile(text: string): void {
      const before = pending.get(journey);
      pending.set(journey, before ? `${before} ${text}` : text);
    },
    /** The screen `page` is showing, at both widths. `caption`: one or two plain sentences. */
    async shot(page: Page, title: string, caption: string, options: ShotOptions = {}) {
      if (!stage) throw new Error('Call stage() before the first shot');
      await record(
        page,
        {
          journey,
          stage,
          title,
          caption,
          actor: options.actor ?? journey,
          kind: options.kind ?? 'screen',
          path: shownPath(page.url()),
        },
        options.parts ?? 3,
      );
    },
    /**
     * An email Gaff sent, as a mail app shows it. `subject` is its subject, or how it starts.
     * It waits for the job that sends it.
     */
    async email(
      browser: Browser,
      sent: { to: string; subject: string },
      title: string,
      caption: string,
      options: ShotOptions = {},
    ) {
      if (!stage) throw new Error('Call stage() before the first shot');
      const mail = await emailHtml(sent.to, sent.subject);
      const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.setContent(mail.html);
      await record(
        page,
        {
          journey,
          stage,
          title,
          caption,
          actor: options.actor ?? journey,
          kind: 'email',
          path: mail.subject.replace(/^\d{6} /, '······ '),
        },
        options.parts ?? 2,
      );
      await context.close();
    },
  };
}

/** Another person, in a browser of their own (a renter on their phone, an owner, a referee). */
export async function someoneElse(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  return { context, page: await context.newPage() };
}

/**
 * Photos for a journey's home: the test copy's own (data/seed-photos), mirrored, so they don't
 * match the seeded homes' photos (the copied-photo check would hold the listing: M29).
 */
export async function homePhotos(
  names: readonly string[] = [
    'living-room-tall-windows-full',
    'living-room-and-kitchen-full',
    'bed-by-the-window-full',
    'outside-full',
  ],
): Promise<{ name: string; mimeType: string; buffer: Buffer }[]> {
  return Promise.all(
    names.map(async (name) => ({
      name: `${name}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await sharp(join('data', 'seed-photos', `${name}.jpg`))
        .flop()
        .jpeg({ quality: 84 })
        .toBuffer(),
    })),
  );
}

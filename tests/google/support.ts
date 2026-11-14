import { devices, expect, type Locator, type Page } from '@playwright/test';
import { MAP_TEST_KEY } from '../../playwright.google.config';

/**
 * M136: what the real-map run looks at. Google's own script is the thing under test, so these
 * helpers watch what the page asks other sites for, and reach Google's parts of the map by the
 * names and roles a renter's browser gives them.
 */

/** Whether this run has the test run's own key: without it, the real map can't draw. */
export const hasKey = MAP_TEST_KEY !== '';
export const NEEDS_KEY =
  'Needs the test run’s Google key in GOOGLE_MAPS_TEST_KEY (docs/deploy.md, "The search map")';

/** Three of the test copy's homes are within 3 km of Rathmines; a fourth is across the city. */
export const SEARCH = '/to-rent/dublin/rathmines?km=3';
export const COUNTY = '/to-rent/dublin';
export const RANELAGH_PIN = '€2,250 a month, 2 bed apartment in Ranelagh, Dublin 6';

/** A phone, without the device list's browser choice (the project has made it). */
const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
export const phone = pixel;

const GOOGLE_SCRIPT = /^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/;

export interface Watched {
  /** Every request to a site other than Gaff's own, in the order they were made. */
  elsewhere: Array<{ url: string; body: string; referer: string | null }>;
  /** The map's counts (M133), as "event:kind". */
  counted: string[];
  /** What the browser refused under the content security policy. */
  refused: string[];
  /** Errors thrown on the page. */
  errors: string[];
}

export function watch(page: Page): Watched {
  const seen: Watched = { elsewhere: [], counted: [], refused: [], errors: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith('http')) return;
    if (url.hostname !== 'localhost') {
      seen.elsewhere.push({
        url: request.url(),
        body: request.postData() ?? '',
        referer: request.headers().referer ?? null,
      });
    } else if (url.pathname === '/api/v' && url.searchParams.has('m')) {
      seen.counted.push(`${url.searchParams.get('m')}:${url.searchParams.get('k') ?? ''}`);
    }
  });
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to /.test(text)) seen.refused.push(text.slice(0, 300));
  });
  page.on('pageerror', (error) => seen.errors.push(String(error).slice(0, 300)));
  return seen;
}

/** Every other site is out of reach: a blocker in the browser, or no way to Google. */
export async function blockOtherSites(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort(),
  );
}

/** Google's script is asked for, and doesn't answer until `release` is called. */
export async function stallGoogleScript(page: Page): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(GOOGLE_SCRIPT, async (route) => {
    await held;
    await route.abort().catch(() => undefined);
  });
  return release;
}

/** The key is swapped, on its way to Google, for one Google doesn't know. */
export async function sendAKeyGoogleRefuses(page: Page): Promise<void> {
  await page.route(GOOGLE_SCRIPT, (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('key', 'not-a-key-google-knows');
    return route.continue({ url: url.toString() });
  });
}

/**
 * Google's answer about the key is held back. It comes with the first call for the map's
 * viewport, so the map and Gaff's pins are up before Google refuses and takes its map apart.
 */
export async function holdGooglesAnswer(page: Page, ms: number): Promise<void> {
  await page.route(/MapsJsInternalService\/GetViewportInfo/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}

/**
 * No key reaches Google, which then draws its development-mode map: darkened tiles under its
 * own dialog. It's what Google shows a site with no billing, and it calls no hook.
 */
export async function sendNoKey(page: Page): Promise<void> {
  await page.route(GOOGLE_SCRIPT, (route) => {
    const url = new URL(route.request().url());
    url.searchParams.delete('key');
    return route.continue({ url: url.toString() });
  });
}

/** The map's own element: it says which stage the map is at. */
export const mapStage = (page: Page): Locator => page.locator('[data-stage]');

export async function expectMapReady(page: Page): Promise<void> {
  await expect(mapStage(page)).toHaveAttribute('data-stage', 'ready', { timeout: 30_000 });
}

/**
 * M119: Google is told the site's origin and nothing more. No request to another site carries
 * the page's address (the place and the filters a renter searched): not in its own address, not
 * in its body, and not in a Referer header. Every page sends `no-referrer`; the one Referer seen
 * on Google's real script (13 November 2026) is on its cursor image, where the browser falls
 * back to its own default for a style set by script, and it holds the origin alone.
 */
export function expectOnlyTheOriginSent(seen: Watched, searched: string[]): void {
  const telling: string[] = [];
  for (const request of seen.elsewhere) {
    const url = new URL(request.url);
    let said = `${url.search} ${request.body}`;
    try {
      said = decodeURIComponent(said);
    } catch {
      // Not every body is text: it's searched as it is.
    }
    const found = searched.filter((word) => said.includes(word));
    // The origin ends at its port: anything after it is a page's address.
    if (/localhost:\d+\/[\w-]/.test(said)) found.push('a page’s address');
    if (request.referer && !/^https?:\/\/localhost:\d+\/?$/.test(request.referer)) {
      found.push(`Referer: ${request.referer}`);
    }
    if (found.length) telling.push(`${url.host}${url.pathname}: ${found.join(', ')}`);
  }
  expect(telling, 'requests that say what was searched').toEqual([]);
}

/** Where each pin and cluster is inside the map, so the page scrolling isn't the map moving. */
export async function pinsInMap(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-stage]')!.getBoundingClientRect();
    return Object.fromEntries(
      [...document.querySelectorAll('[data-stage] gmp-advanced-marker[aria-label]')].map((m) => {
        const r = m.getBoundingClientRect();
        return [
          m.getAttribute('aria-label')!,
          { x: Math.round(r.x - root.x), y: Math.round(r.y - root.y) },
        ];
      }),
    );
  });
}

/**
 * M136: Google's logo and its terms line are on screen, and nothing of Gaff's covers them
 * (Google's terms for showing its map). Google draws them a moment after the map itself, so
 * this waits for them.
 */
export async function expectAttributionClear(page: Page, within: Locator): Promise<void> {
  await expect(async () => {
    const found = await within.evaluate((root) => {
      const marks = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href*="maps.google.com/maps"], a[href*="google.com/intl"][href*="terms"]',
        ),
      ];
      const seen: string[] = [];
      const problems: string[] = [];
      for (const mark of marks) {
        const rect = mark.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const name = mark.getAttribute('aria-label') || mark.textContent?.trim() || 'Google';
        seen.push(name);
        if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) {
          problems.push(`${name}: off the screen`);
          continue;
        }
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        if (!top || !(mark.contains(top) || top.contains(mark) || top.closest('.gm-style'))) {
          problems.push(`${name}: under ${top?.tagName.toLowerCase()}.${top?.className}`);
        }
      }
      return { seen, problems };
    });
    expect(found.seen.length, 'Google’s logo and terms').toBeGreaterThanOrEqual(2);
    expect(found.problems, 'Google’s attribution is covered').toEqual([]);
  }).toPass({ timeout: 10_000 });
}

/**
 * The content security policy holds with Google's real script. The one thing it refuses is
 * Google's fonts: the map's buttons use the page's own (next.config.ts).
 */
export function expectPolicyHolds(seen: Watched): void {
  const others = seen.refused.filter((text) => !/fonts\.(googleapis|gstatic)\.com/.test(text));
  expect(others, 'refused under the content security policy').toEqual([]);
}

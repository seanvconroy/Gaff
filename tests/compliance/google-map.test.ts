import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * BA-5 (the live line's M103, M119, M132; its ADR-0027 and ADR-0028, ADR-0021 and ADR-0022
 * here): Google Maps is the one third-party script, approved for the search map and the lister's
 * pin (Q51). Its hosts are allowed only on the pages that show its map, only in a build whose map
 * is Google's, never on a preview copy; one place loads its script; and no other Google service
 * is called.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const TRACKERS =
  /google-analytics|googletagmanager|gtag\(|doubleclick|googlesyndication|adservice|facebook\.net|hotjar|segment\.(io|com)|mixpanel|amplitude|clarity\.ms|plausible|posthog/i;

/** The production rules next.config.ts makes with these settings. */
async function productionRules(settings: Record<string, string>) {
  vi.stubEnv('NODE_ENV', 'production');
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  vi.resetModules();
  try {
    const config = (await import('../../next.config')).default;
    return { rules: (await config.headers?.()) ?? [], env: config.env ?? {} };
  } finally {
    vi.unstubAllEnvs();
  }
}

async function policies(settings: Record<string, string>) {
  const { rules } = await productionRules(settings);
  return rules.flatMap((rule) => {
    const policy = rule.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
    return policy ? [{ source: rule.source, policy }] : [];
  });
}

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('M119: Google’s hosts only where its map is', () => {
  it('lets scripts load only from Gaff itself without Google’s map', async () => {
    for (const provider of ['none', 'static']) {
      const found = await policies({ MAP_PROVIDER: provider });
      expect(found.map((p) => p.source)).toEqual(['/:path*']);
      expect(directive(found[0]!.policy, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
    }
  });

  it('with Google’s map on, only Search, places’ pages and the pin add the Maps JavaScript API’s hosts', async () => {
    const found = await policies({ MAP_PROVIDER: 'google' });
    expect(found.map((p) => p.source)).toEqual([
      '/:path*',
      '/',
      '/to-rent/:path*',
      '/lettings/:lettingId/setup/pin',
    ]);
    const [everywhere = '', search = '', places = '', pin = ''] = found.map((p) => p.policy);
    expect(pin).toBe(search);
    expect(places).toBe(search);
    expect(directive(everywhere, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
    const hosts = directive(search, 'script-src')!
      .split(' ')
      .slice(1)
      .filter((source) => !source.startsWith("'") && source !== 'blob:');
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host).toMatch(
        /^(https:\/\/)?\*\.(googleapis|gstatic|google|ggpht|googleusercontent)\.com$/,
      );
    }
    expect(search).not.toMatch(TRACKERS);
    expect(directive(search, 'font-src')).toBe("font-src 'self'");
    expect(directive(search, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(search, 'form-action')).toBe(directive(everywhere, 'form-action'));
  });

  it('M132: a preview copy keeps the policy without Google, whatever its settings say', async () => {
    const found = await policies({ MAP_PROVIDER: 'google', VERCEL_ENV: 'preview' });
    expect(found.map((p) => p.source)).toEqual(['/:path*']);
  });

  it('every page keeps no-referrer, and Google is told only the site’s origin', async () => {
    const { rules } = await productionRules({ MAP_PROVIDER: 'google' });
    const referrers = rules.flatMap((rule) =>
      rule.headers
        .filter((h) => h.key === 'Referrer-Policy')
        .map((h) => `${rule.source} ${h.value}`),
    );
    expect(referrers).toEqual(['/:path* no-referrer']);
    const loader = readFileSync('src/ui/GoogleLoader.tsx', 'utf8');
    expect(loader).toMatch(/authReferrerPolicy="origin"/);
    expect(loader).toMatch(/solutionChannel=""/);
    expect(loader).toMatch(/disableUsageAttribution\b/);
  });

  it('the build that gives the map’s pages Google’s policy also makes them documents of their own', async () => {
    expect((await productionRules({ MAP_PROVIDER: 'google' })).env).toMatchObject({
      NEXT_PUBLIC_GOOGLE_MAP_PAGES: '1',
    });
    for (const settings of <Array<Record<string, string>>>[
      { MAP_PROVIDER: 'google', VERCEL_ENV: 'preview' },
      { MAP_PROVIDER: 'static' },
      { MAP_PROVIDER: 'none' },
    ]) {
      expect((await productionRules(settings)).env).toMatchObject({
        NEXT_PUBLIC_GOOGLE_MAP_PAGES: '',
      });
    }
    expect(readFileSync('src/app/layout.tsx', 'utf8')).toMatch(/<MapBoundary \/>/);
  });

  it('the map is used only on the map’s pages', () => {
    const mapPages = [
      join('src', 'app', '(site)', 'page.tsx'),
      join('src', 'app', '(site)', '_search'),
      join('src', 'app', '(task)', 'lettings', '_flow', 'PinStep.tsx'),
      join('src', 'app', 'dev', 'ui'),
    ];
    const users = sourceFiles(join('src', 'app')).filter((file) =>
      /from '@\/ui\/(GoogleLoader|GooglePinMap|GoogleSearchMap|PinPicker|SearchMap)'/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(users.length).toBeGreaterThan(1);
    expect(users.filter((file) => !mapPages.some((page) => file.startsWith(page)))).toEqual([]);
  });

  it('Google’s script is loaded in one place, and only the Maps JavaScript API is called', () => {
    const files = sourceFiles('src').map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    const loaders = files.filter(({ text }) => /<APIProvider\b/.test(text)).map(({ file }) => file);
    expect(loaders).toEqual([join('src', 'ui', 'GoogleLoader.tsx')]);
    const others = files.filter(({ text }) =>
      /importLibrary\(\s*['"](places|geocoding|routes|elevation|streetView|geometry|drawing|visualization)['"]|google\.maps\.(places|Geocoder|DirectionsService|DistanceMatrixService|ElevationService|StreetViewService)\b|useMapsLibrary\(/.test(
        text,
      ),
    );
    expect(others.map(({ file }) => file)).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * M103: no third-party advertising, ad networks or tracking. The Content Security Policy lets
 * scripts load only from Gaff itself, and no code loads anything from a tracker. The one
 * exception is approved (Q58, ADR-0027): Google's map on the search pages, when it's switched on.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const TRACKERS =
  /google-analytics|googletagmanager|gtag\(|doubleclick|googlesyndication|adservice|facebook\.net|connect\.facebook|fbq\(|hotjar|segment\.(io|com)|mixpanel|amplitude|clarity\.ms|tiktok|linkedin\.com\/insight|plausible|posthog|intercom|hubspot|quantserve|scorecardresearch|criteo|taboola|outbrain/i;

/** The production headers next.config.ts sends, built with these settings. */
async function productionPolicies(settings: Record<string, string>) {
  vi.stubEnv('NODE_ENV', 'production');
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  vi.resetModules();
  try {
    const config = (await import('../../next.config')).default;
    const rules = (await config.headers?.()) ?? [];
    return rules.flatMap((rule) => {
      const policy = rule.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
      return policy ? [{ source: rule.source, policy }] : [];
    });
  } finally {
    vi.unstubAllEnvs();
  }
}

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('M103: no third-party advertising or tracking', () => {
  it('lets scripts load only from Gaff itself', async () => {
    const policies = await productionPolicies({ MAP_PROVIDER: 'none' });
    expect(policies.map((p) => p.source)).toEqual(['/:path*']);
    const policy = policies[0]!.policy;
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('ADR-0027: with Google’s map on, only the pages that show it add the Maps JavaScript API’s hosts', async () => {
    const policies = await productionPolicies({ MAP_PROVIDER: 'google' });
    // The search pages, and the listing editor, where a letter places a home's pin (M38).
    expect(policies.map((p) => p.source)).toEqual([
      '/:path*',
      '/to-rent/:path*',
      '/lettings/:lettingId/listing',
    ]);
    const [everywhere = '', search = '', editor = ''] = policies.map((p) => p.policy);
    expect(editor).toBe(search);
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
  });

  it('M119: every page keeps no-referrer, the map’s pages included, and Google is told only the site’s origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MAP_PROVIDER', 'google');
    vi.resetModules();
    try {
      const config = (await import('../../next.config')).default;
      const rules = (await config.headers?.()) ?? [];
      const referrers = rules.flatMap((rule) =>
        rule.headers
          .filter((h) => h.key === 'Referrer-Policy')
          .map((h) => `${rule.source} ${h.value}`),
      );
      // One rule, for every page: no page sends its address to another site.
      expect(referrers).toEqual(['/:path* no-referrer']);
    } finally {
      vi.unstubAllEnvs();
    }
    // Google's script reports the site's origin, not the page's address, when it checks the key.
    const loader = readFileSync('src/ui/map/GoogleLoader.tsx', 'utf8');
    expect(loader).toMatch(/authReferrerPolicy="origin"/);
    // Nor the map library's own usage tags: they aren't needed to draw a map.
    expect(loader).toMatch(/solutionChannel=""/);
    expect(loader).toMatch(/disableUsageAttribution\b/);
  });

  it('M119: the build that gives the map’s pages Google’s policy also makes them documents of their own', async () => {
    // Google's script runs only in a document loaded for a map page, and goes when the page
    // does: one build setting decides the header rules and the full page loads between them.
    const built = async (settings: Record<string, string>) => {
      vi.stubEnv('NODE_ENV', 'production');
      for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
      vi.resetModules();
      try {
        const config = (await import('../../next.config')).default;
        return config.env?.NEXT_PUBLIC_GOOGLE_MAP_PAGES;
      } finally {
        vi.unstubAllEnvs();
      }
    };
    expect(await built({ MAP_PROVIDER: 'google' })).toBe('1');
    expect(await built({ MAP_PROVIDER: 'google', VERCEL_ENV: 'preview' })).toBe('');
    expect(await built({ MAP_PROVIDER: 'static' })).toBe('');
    expect(await built({ MAP_PROVIDER: 'none' })).toBe('');
    // The header rules name the map's pages from the same list the pages' scripts use.
    const { mapPageSources } = await import('../../src/lib/map-pages');
    const policies = await productionPolicies({ MAP_PROVIDER: 'google' });
    expect(policies.slice(1).map((p) => p.source)).toEqual([...mapPageSources]);
    // The boundary is in the root layout, so it's there on every page.
    expect(readFileSync('src/app/layout.tsx', 'utf8')).toMatch(/<MapBoundary \/>/);
  });

  it('M119: Google’s map is used only on the map’s pages', () => {
    // A map anywhere else would have Google's script refused: add the page to
    // src/lib/map-pages.ts first, and to the privacy notice.
    const mapPages = [
      join('src', 'app', '(public)', 'to-rent'),
      join('src', 'app', '(workspace)', 'lettings', '[lettingId]', 'listing'),
    ];
    const users = sourceFiles(join('src', 'app')).filter((file) =>
      /from '@\/ui\/map\/(GoogleLoader|GooglePinMap|PinPicker)'|from '.*\/(SearchMap|GoogleMap)'/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(users.length).toBeGreaterThan(1);
    expect(users.filter((file) => !mapPages.some((page) => file.startsWith(page)))).toEqual([]);
  });

  it('M132: a preview copy keeps the policy without Google, whatever its settings say', async () => {
    const policies = await productionPolicies({ MAP_PROVIDER: 'google', VERCEL_ENV: 'preview' });
    expect(policies.map((p) => p.source)).toEqual(['/:path*']);
  });

  it('ADR-0027: Google’s script is loaded in one place, and only the Maps JavaScript API is called', () => {
    const files = sourceFiles('src').map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    // The loader, and nothing else, brings Google's script in.
    const loaders = files.filter(({ text }) => /<APIProvider\b/.test(text)).map(({ file }) => file);
    expect(loaders).toEqual(['src/ui/map/GoogleLoader.tsx']);
    // No other Google service: places, geocoding, routes, directions, elevation or Street View.
    const others = files.filter(({ text }) =>
      /importLibrary\(\s*['"](places|geocoding|routes|elevation|streetView|geometry|drawing|visualization)['"]|google\.maps\.(places|Geocoder|DirectionsService|DistanceMatrixService|ElevationService|StreetViewService)\b|useMapsLibrary\(\s*['"](places|geocoding|routes)['"]/.test(
        text,
      ),
    );
    expect(others.map(({ file }) => file)).toEqual([]);
  });

  it('loads no tracker, ad network or third-party script anywhere in the app', () => {
    const offenders = sourceFiles('src').filter((file) => {
      const text = readFileSync(file, 'utf8');
      return (
        TRACKERS.test(text) ||
        /from ['"]next\/script['"]/.test(text) ||
        /<script[^>]+src=["']https?:/i.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('sets no cookies of its own other than the sign-in session', () => {
    const offenders = sourceFiles('src').filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /cookies\(\)\.set\(|document\.cookie\s*=/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

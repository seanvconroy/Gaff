import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * M103: no third-party advertising, ad networks or tracking. The Content Security Policy lets
 * scripts load only from Gaff itself, and no code loads anything from a tracker. The one
 * exception is approved (Q38, ADR-0025): Google's map on the search pages, when it's switched on.
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

  it('ADR-0025: with Google’s map on, only the search pages add the Maps JavaScript API’s hosts', async () => {
    const policies = await productionPolicies({ MAP_PROVIDER: 'google' });
    expect(policies.map((p) => p.source)).toEqual(['/:path*', '/to-rent/:path*']);
    const [everywhere = '', search = ''] = policies.map((p) => p.policy);
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

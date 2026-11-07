import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M103: no third-party advertising, ad networks or tracking. The Content Security Policy lets
 * scripts load only from Gaff itself, and no code loads anything from a tracker.
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

describe('M103: no third-party advertising or tracking', () => {
  it('lets scripts load only from Gaff itself', () => {
    const config = readFileSync('next.config.ts', 'utf8');
    const scriptSrc = /"script-src ([^"]+)"/.exec(config)?.[1];
    expect(scriptSrc).toBe("'self' 'unsafe-inline'");
    expect(config).toContain(`"default-src 'self'"`);
    expect(config).toContain(`"frame-ancestors 'none'"`);
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

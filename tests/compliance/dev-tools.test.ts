import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const sources = (dir: string) =>
  filesUnder(join(root, dir)).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));

describe('BA-1: nothing under /dev is open to a stranger on the test copy', () => {
  it('every page, action and route under /dev outside /dev/ui passes the gate or is the sign-in stand-in', () => {
    for (const path of sources('src/app/dev')) {
      if (path.includes(join('src', 'app', 'dev', 'ui'))) continue;
      // What a browser can reach: a page, a route, or a file of server actions.
      if (!/(page\.tsx|route\.ts|actions\.ts)$/.test(path)) continue;
      const text = readFileSync(path, 'utf8');
      const signInStandIn = path.includes(join('dev', 'sign-in'));
      // The Google and Apple stand-in is the one exception: it exists only where its provider
      // is in stand-in mode, which is never on staging or in production (AU1).
      const gated = signInStandIn
        ? text.includes("signInProviderModes()[provider.data] !== 'stand_in'")
        : text.includes('await requireDevTools()');
      expect(gated, path).toBe(true);
    }
  });

  it('/dev/ui shows components alone: it reads no database and no person’s data', () => {
    for (const path of sources('src/app/dev/ui')) {
      const text = readFileSync(path, 'utf8');
      for (const line of text.split('\n').filter((l) => /^import /.test(l))) {
        if (/^import type /.test(line)) continue;
        expect(line, path).not.toMatch(/'@\/(db|server|adapters)\b/);
      }
    }
  });
});

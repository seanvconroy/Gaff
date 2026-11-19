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
      const standInCheck = path.includes(join('dev', 'checks'));
      // The Google and Apple stand-in is one exception: it exists only where its provider
      // is in stand-in mode, which is never on staging or in production (AU1). The stand-in
      // check page is the other (BA-6): it has its own gate, which is the usual one except for
      // the person whose check it is, through their check's own link.
      const gated = signInStandIn
        ? text.includes("signInProviderModes()[provider.data] !== 'stand_in'")
        : standInCheck
          ? text.includes('await requireStandInCheck(checkId, key)')
          : text.includes('await requireDevTools()');
      expect(gated, path).toBe(true);
    }
  });

  it('BA-6: the stand-in check’s own gate opens one check, by its key, and is used nowhere else', () => {
    // Only the stand-in check page and its action use the exception.
    const users = sources('src/app').filter((path) =>
      readFileSync(path, 'utf8').includes('requireStandInCheck'),
    );
    expect(users.map((path) => path.slice(path.indexOf('src/app')))).toEqual([
      'src/app/dev/checks/[checkId]/actions.ts',
      'src/app/dev/checks/[checkId]/page.tsx',
    ]);
    // The gate asks for the key of this check, and otherwise is the development tools' rule.
    const gate = readFileSync(join(root, 'src/server/dev/gate.ts'), 'utf8');
    const own = gate.slice(gate.indexOf('export async function requireStandInCheck'));
    expect(own).toContain('ownLink: standInKeyMatches(checkId, key)');
    expect(own).toContain("if (access === 'nobody') notFound();");
    expect(own).toContain("if (access === 'staff') await requireStaff();");
    // A key comes only from the stand-in's own link, made with Gaff's secret.
    const keyMakers = sources('src').filter((path) =>
      readFileSync(path, 'utf8').includes('stand-in-check:'),
    );
    expect(keyMakers.map((path) => path.slice(path.indexOf('src/')))).toEqual([
      'src/adapters/checks/stand-in.ts',
    ]);
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

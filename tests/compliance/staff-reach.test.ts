import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Q13, UX-TS-5 (rule 1): Gaff's own team confirms agencies and hides reported listings, and
 * does nothing else. They never open a letting, read a renter, send a message or make a
 * decision. So the internal pages and the use cases behind them can't even reach the code that
 * does those things: no import of decisions, messages, answers, applications, checks, offers,
 * tenancies, viewings, the renter's pages or the inbox. The integration tests in
 * tests/integration/ux-ts-trust.test.ts show the same from the data.
 */
const ROOT = join(__dirname, '..', '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const staffCode = [
  ...filesUnder(join(ROOT, 'src/app/internal')),
  join(ROOT, 'src/server/trust/staff.ts'),
  join(ROOT, 'src/server/accounts/staff.ts'),
];

const forbidden = [
  '@/server/decisions',
  '@/server/messages',
  '@/server/answers',
  '@/server/applications',
  '@/server/checks',
  '@/server/offers',
  '@/server/tenancy',
  '@/server/viewings',
  '@/server/shortlist',
  '@/server/renter',
  '@/server/inbox',
  '@/server/lettings/page',
  '@/server/lettings/queries',
  '@/server/timeline',
];

/** Tables of a letting's people, messages and decisions. */
const forbiddenTables = [
  'applications',
  'messages',
  'decisions',
  'aiDrafts',
  'checks',
  'offers',
  'tenancies',
  'viewingSlots',
  'bookings',
  'waitingEnquiries',
  'inboundEmails',
];

describe('Q13, UX-TS-5: the internal page reaches nothing inside a letting', () => {
  it('Q13: there is staff code to check', () => {
    expect(staffCode.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of staffCode) {
    const name = file.slice(ROOT.length + 1);
    it(`Q13: ${name} imports no use case that reads people, sends a message or decides`, () => {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
      for (const path of imports) {
        expect(
          forbidden.some((bad) => path === bad || path.startsWith(`${bad}/`)),
          `${name} imports ${path}`,
        ).toBe(false);
      }
      const schema = source.match(/import \{([^}]*)\} from '@\/db\/schema'/);
      const tables = schema ? schema[1]!.split(',').map((each) => each.trim()) : [];
      for (const table of tables) {
        expect(forbiddenTables, `${name} imports the ${table} table`).not.toContain(table);
      }
    });
  }
});

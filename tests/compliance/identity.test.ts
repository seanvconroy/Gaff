import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePageCopy } from '@/copy/home-page';
import { profileCopy } from '@/copy/profile';
import { checksCopy } from '@/copy/renter';
import { savedCopy } from '@/copy/saved';
import { searchCopy } from '@/copy/search';
import { keptIdentityColumns, mayStartPersonCheck } from '@/domain/identity/identity';
import { profileEventCatalogue } from '@/server/accounts/profile-events';

/** Every file under a folder, recursively. */
function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

/** Words that would invite a renter to verify, or reward them for it (UX-PF-13). */
const INVITATIONS = /get verified|verify (your|now)|verified renter|verified badge|be verified/i;

describe('Compliance: a renter is never invited to verify before being chosen (UX-PF-13, OQ-5)', () => {
  it('UX-PF-13: no words a renter sees before the checks invite them to verify, or reward it', () => {
    const before = JSON.stringify({ searchCopy, savedCopy, homePageCopy, profileCopy });
    expect(before).not.toMatch(INVITATIONS);
    // The renter's own ID words are all at the checks, for someone chosen.
    expect(JSON.stringify(checksCopy)).not.toMatch(INVITATIONS);
  });

  it('UX-PF-13: no page on the renting side starts an ID check of a person’s own, except Profile’s redo', () => {
    const site = filesIn(join(process.cwd(), 'src/app/(site)'))
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('startPersonCheck'));
    expect(site.map((file) => file.slice(file.indexOf('src/app')))).toEqual([
      'src/app/(site)/profile/actions.ts',
    ]);
    // And Profile's is for someone who already keeps one.
    expect(
      mayStartPersonCheck({ purpose: 'name_changed', privateLandlord: false, kept: false }),
    ).toBe(false);
  });
});

describe('Compliance: a kept identity holds three things (UX-PF-10, rule 2)', () => {
  it('UX-PF-10: whose, the name and the date; never an image, a document, a country or a birth date', () => {
    expect(keptIdentityColumns).toEqual(['user_id', 'verified_name', 'verified_at']);
    const schema = readFileSync(join(process.cwd(), 'src/db/schema/accounts.ts'), 'utf8');
    const table = schema.slice(
      schema.indexOf("pgTable(\n  'verified_identities'"),
      schema.indexOf('export const identityChecks'),
    );
    expect(table).toContain('verifiedName: text().notNull()');
    expect(table).not.toMatch(/(image|photo|document|country|birth|dob|nationality)\w*:/i);
  });

  it('rule 8: the profile’s identity events hold codes and IDs, never the name', () => {
    for (const type of [
      'profile.identity_kept',
      'profile.identity_used',
      'profile.identity_check_started',
      'profile.identity_check_ended',
    ] as const) {
      const shape = Object.keys(profileEventCatalogue[type].shape);
      expect(shape.some((key) => /name|date|birth|document|country/i.test(key))).toBe(false);
    }
  });
});

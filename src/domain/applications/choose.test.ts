import { describe, expect, it } from 'vitest';
import { validateChoice } from './choose';

const applied = new Set(['a', 'b', 'c']);

describe('R17: a person chooses a preferred applicant and a backup', () => {
  it('needs a preferred applicant, from the people who applied', () => {
    expect(validateChoice({ applied, preferredId: '', backupId: '' })).toEqual({
      ok: false,
      error: 'Choose your preferred applicant.',
    });
    expect(validateChoice({ applied, preferredId: 'z', backupId: '' })).toEqual({
      ok: false,
      error: 'Choose your preferred applicant from the people who applied.',
    });
  });

  it('takes an optional backup, who must be someone else who applied', () => {
    expect(validateChoice({ applied, preferredId: 'a', backupId: '' })).toEqual({
      ok: true,
      preferredId: 'a',
      backupId: null,
    });
    expect(validateChoice({ applied, preferredId: 'a', backupId: 'a' })).toEqual({
      ok: false,
      error: 'Your backup needs to be someone other than your preferred applicant.',
    });
    expect(validateChoice({ applied, preferredId: 'a', backupId: 'z' })).toEqual({
      ok: false,
      error: 'Choose your backup from the people who applied.',
    });
    expect(validateChoice({ applied, preferredId: 'a', backupId: 'b' })).toEqual({
      ok: true,
      preferredId: 'a',
      backupId: 'b',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  accountExistsEmail,
  confirmEmailCodeEmail,
  methodAddedEmail,
  passwordChangedEmail,
  resetCodeEmail,
} from './account-emails';

const at = new Date('2026-11-13T18:00:00Z');
const all = [
  confirmEmailCodeEmail('482913'),
  resetCodeEmail('482913'),
  accountExistsEmail({
    signInUrl: 'https://gaff.test/sign-in',
    resetUrl: 'https://gaff.test/forgot-password',
  }),
  passwordChangedEmail({ how: 'reset', at, resetUrl: 'https://gaff.test/forgot-password' }),
  passwordChangedEmail({ how: 'set', at, resetUrl: 'https://gaff.test/forgot-password' }),
  methodAddedEmail({ method: 'google', at, securityUrl: 'https://gaff.test/account/security' }),
  methodAddedEmail({ method: 'passkey', at, securityUrl: 'https://gaff.test/account/security' }),
];

describe('AU2, AU5, AU11: emails about a person’s own account', () => {
  it('puts a code first in its subject, where a phone shows it', () => {
    expect(confirmEmailCodeEmail('482913').subject).toMatch(/^482913 is your code/);
    expect(resetCodeEmail('482913').subject).toMatch(/^482913 is your code/);
  });

  it('says how long a code works, never to share it, and what to do if it wasn’t you', () => {
    for (const email of [confirmEmailCodeEmail('482913'), resetCodeEmail('482913')]) {
      expect(email.text).toContain('10 minutes');
      expect(email.text).toContain('Nobody from Gaff will ever ask you for this code.');
      expect(email.text).toMatch(/you can ignore this email/);
    }
  });

  it('tells someone who already has an account how to get in, and that nothing changed', () => {
    const email = accountExistsEmail({
      signInUrl: 'https://gaff.test/sign-in',
      resetUrl: 'https://gaff.test/forgot-password',
    });
    expect(email.text).toContain('nothing has changed');
    expect(email.text).toContain('https://gaff.test/sign-in');
    expect(email.text).toContain('https://gaff.test/forgot-password');
  });

  it('says what changed, when, in Irish time, and what to do if it wasn’t them', () => {
    const changed = passwordChangedEmail({
      how: 'reset',
      at,
      resetUrl: 'https://gaff.test/forgot-password',
    });
    expect(changed.subject).toBe('Your Gaff password was changed');
    // The year is added once it's no longer this year.
    expect(changed.text).toMatch(/Friday 13 November(?: 2026)?, 6pm/);
    expect(changed.text).toContain('Every device that was signed in has been signed out.');
    expect(changed.text).toContain('If it wasn’t');
    expect(
      methodAddedEmail({ method: 'apple', at, securityUrl: 'https://gaff.test/account/security' })
        .subject,
    ).toBe('Apple was connected to your Gaff account');
  });

  it('keeps Gaff’s voice: no exclamation marks, no blame, signed "Gaff"', () => {
    for (const email of all) {
      expect(`${email.subject}\n${email.text}`).not.toMatch(/!|invalid|illegal|you must/i);
      expect(email.text.endsWith('\nGaff')).toBe(true);
    }
  });
});

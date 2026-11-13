import { describe, expect, it } from 'vitest';
import { RECENT_SIGN_IN_SECONDS, signedInRecently } from './recent-sign-in';

describe('AU7: changing how you sign in needs a recent sign-in', () => {
  const now = new Date('2026-11-13T12:00:00Z');

  it('counts a sign-in in the last hour as recent', () => {
    expect(signedInRecently(new Date(now.getTime() - 59 * 60 * 1000), now)).toBe(true);
    expect(signedInRecently(now, now)).toBe(true);
  });

  it('asks again after an hour', () => {
    expect(signedInRecently(new Date(now.getTime() - RECENT_SIGN_IN_SECONDS * 1000), now)).toBe(
      false,
    );
    expect(signedInRecently(new Date('2026-11-01T12:00:00Z'), now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { staffAccess, STAFF_SESSION_HOURS } from './staff-access';

describe('M5: Gaff staff sign in with a passkey', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('lets staff in who signed in with a passkey in the last 8 hours', () => {
    expect(
      staffAccess({
        required: true,
        method: 'passkey',
        startedAt: hoursAgo(1),
        hasPasskey: true,
        now,
      }),
    ).toBe('allowed');
    expect(
      staffAccess({
        required: true,
        method: 'passkey',
        startedAt: hoursAgo(STAFF_SESSION_HOURS),
        hasPasskey: true,
        now,
      }),
    ).toBe('needs_passkey_sign_in');
  });

  it('asks for the passkey when they signed in another way', () => {
    for (const method of ['password', 'email_code', 'google', 'apple', null] as const) {
      expect(
        staffAccess({ required: true, method, startedAt: hoursAgo(1), hasPasskey: true, now }),
      ).toBe('needs_passkey_sign_in');
    }
  });

  it('asks staff with no passkey to add one first', () => {
    expect(
      staffAccess({
        required: true,
        method: 'google',
        startedAt: hoursAgo(1),
        hasPasskey: false,
        now,
      }),
    ).toBe('needs_a_passkey');
  });

  it('doesn’t ask on the test copy, where testers are staff', () => {
    expect(
      staffAccess({
        required: false,
        method: 'email_code',
        startedAt: hoursAgo(100),
        hasPasskey: false,
        now,
      }),
    ).toBe('allowed');
  });
});

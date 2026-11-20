import { describe, expect, it } from 'vitest';
import { staffAccess, staffPasskeyRequired, STAFF_SESSION_HOURS } from './staff-access';

describe('BA-8, M5: Gaff’s team open /internal with a passkey, in production', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('lets staff in who signed in with a passkey in the last 8 hours', () => {
    const base = { required: true, method: 'passkey' as const, hasPasskey: true, now };
    expect(staffAccess({ ...base, startedAt: hoursAgo(1) })).toBe('allowed');
    expect(staffAccess({ ...base, startedAt: hoursAgo(STAFF_SESSION_HOURS) })).toBe(
      'needs_passkey_sign_in',
    );
  });

  it('asks for the passkey when they signed in another way', () => {
    for (const method of ['email_code', 'sms_code', 'google', 'apple', null] as const) {
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

  it('doesn’t ask on the test copy or locally, where the email on the list is enough', () => {
    expect(staffPasskeyRequired('production')).toBe(true);
    for (const gaffEnv of ['staging', 'development', 'test'] as const) {
      expect(staffPasskeyRequired(gaffEnv)).toBe(false);
    }
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

import { describe, expect, it } from 'vitest';
import {
  INVITES_PER_ORGANISATION,
  limitedSteps,
  overLimit,
  perAddress,
  scaled,
  secondsUntilRetry,
  stepForPath,
} from './limits';

describe('AU12: limits on signing in', () => {
  it('knows which step each of Gaff’s sign-in calls is', () => {
    expect(stepForPath('/gaff/sign-in/code')).toBe('check_code');
    expect(stepForPath('/gaff/sign-in/link')).toBe('check_code');
    expect(stepForPath('/sign-in/social')).toBe('provider');
    expect(stepForPath('/link-social')).toBe('provider');
    expect(stepForPath('/callback/:id')).toBe('provider');
    expect(stepForPath('/callback/google')).toBe('provider');
    expect(stepForPath('/passkey/generate-authenticate-options')).toBe('passkey_options');
    expect(stepForPath('/passkey/verify-authentication')).toBe('passkey');
    expect(stepForPath('/passkey/generate-register-options')).toBe('passkey_add');
    expect(stepForPath('/passkey/verify-registration')).toBe('passkey_add');
  });

  it('leaves everything else alone, such as reading the session on every page', () => {
    expect(stepForPath('/get-session')).toBeNull();
    expect(stepForPath('/sign-out')).toBeNull();
    expect(stepForPath('')).toBeNull();
  });

  it('gives every step a limit from one address, asking for codes and confirming included', () => {
    for (const step of limitedSteps) {
      expect(perAddress[step].max).toBeGreaterThan(0);
      expect(perAddress[step].windowSeconds).toBe(60);
    }
    expect(perAddress.send_code).toEqual({ max: 5, windowSeconds: 60 });
    expect(perAddress.confirm_send).toEqual({ max: 5, windowSeconds: 60 });
    expect(overLimit(5, perAddress.send_code)).toBe(false);
    expect(overLimit(6, perAddress.send_code)).toBe(true);
  });

  it('allows an organisation 30 invitations an hour', () => {
    expect(INVITES_PER_ORGANISATION).toEqual({ max: 30, windowSeconds: 3600 });
  });

  it('says how long until the caller may try again: the rest of the window', () => {
    const start = new Date('2026-11-19T10:00:00Z');
    const limit = { max: 5, windowSeconds: 60 };
    expect(secondsUntilRetry(start, limit, new Date('2026-11-19T10:00:15Z'))).toBe(45);
    expect(secondsUntilRetry(start, limit, new Date('2026-11-19T10:00:59.5Z'))).toBe(1);
    expect(secondsUntilRetry(start, limit, new Date('2026-11-19T10:02:00Z'))).toBe(1);
  });

  it('can be loosened for end-to-end runs, which sign in constantly from one address', () => {
    expect(scaled(perAddress.send_code, 100)).toEqual({ max: 500, windowSeconds: 60 });
    expect(scaled(perAddress.send_code, 1)).toEqual(perAddress.send_code);
  });
});

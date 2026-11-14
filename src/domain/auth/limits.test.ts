import { describe, expect, it } from 'vitest';
import {
  checksCurrentPassword,
  overLimit,
  PASSWORD_FAILURES,
  perAddress,
  perEmail,
  scaled,
  stepForPath,
} from './limits';

describe('AU12: limits on signing in', () => {
  it('knows which step each sign-in call is', () => {
    expect(stepForPath('/sign-in/email')).toBe('password');
    expect(stepForPath('/sign-up/email')).toBe('sign_up');
    expect(stepForPath('/email-otp/send-verification-otp')).toBe('send_code');
    expect(stepForPath('/email-otp/request-password-reset')).toBe('send_code');
    expect(stepForPath('/sign-in/email-otp')).toBe('check_code');
    expect(stepForPath('/email-otp/verify-email')).toBe('check_code');
    expect(stepForPath('/email-otp/reset-password')).toBe('check_code');
    expect(stepForPath('/sign-in/social')).toBe('provider');
    expect(stepForPath('/callback/:id')).toBe('provider');
    expect(stepForPath('/callback/google')).toBe('provider');
    expect(stepForPath('/passkey/generate-authenticate-options')).toBe('passkey_options');
    expect(stepForPath('/passkey/verify-authentication')).toBe('passkey');
  });

  it('leaves everything else alone, such as reading the session on every page', () => {
    expect(stepForPath('/get-session')).toBeNull();
    expect(stepForPath('/sign-out')).toBeNull();
    expect(stepForPath('')).toBeNull();
  });

  it('allows 5 passwords a minute from one address, and 5 codes an hour to one email', () => {
    expect(perAddress.password).toEqual({ max: 5, windowSeconds: 60 });
    expect(perEmail.send_code).toEqual({ max: 5, windowSeconds: 3600 });
    expect(overLimit(5, perAddress.password)).toBe(false);
    expect(overLimit(6, perAddress.password)).toBe(true);
  });

  it('pauses password sign-in for an email after 10 wrong passwords in 15 minutes', () => {
    expect(PASSWORD_FAILURES).toEqual({ max: 10, windowSeconds: 900 });
  });

  it('can be loosened for end-to-end runs, which sign in constantly from one address', () => {
    expect(scaled(perAddress.password, 100)).toEqual({ max: 500, windowSeconds: 60 });
    expect(scaled(perAddress.password, 1)).toEqual(perAddress.password);
  });
});

describe('AU12: guessing a password from a session that’s already signed in', () => {
  it('limits the routes that take the current password like signing in with one', () => {
    for (const path of ['/change-password', '/verify-password']) {
      expect(stepForPath(path)).toBe('password');
      expect(checksCurrentPassword(path)).toBe(true);
    }
  });

  it('doesn’t treat signing in, or anything else, as one of them', () => {
    for (const path of ['/sign-in/email', '/sign-up/email', '/get-session', '']) {
      expect(checksCurrentPassword(path)).toBe(false);
    }
  });
});

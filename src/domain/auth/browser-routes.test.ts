import { describe, expect, it } from 'vitest';
import { openToBrowsers } from './browser-routes';

describe('AU12: the sign-in routes a browser may call directly', () => {
  it('lets a browser come back from Google or Apple', () => {
    expect(openToBrowsers('/callback/:id')).toBe(true);
    expect(openToBrowsers('/callback/google')).toBe(true);
    expect(openToBrowsers('/callback/apple')).toBe(true);
  });

  it('lets a browser do what only a browser can: passkeys', () => {
    for (const path of [
      '/passkey/generate-authenticate-options',
      '/passkey/verify-authentication',
      '/passkey/generate-register-options',
      '/passkey/verify-registration',
    ]) {
      expect(openToBrowsers(path)).toBe(true);
    }
  });

  it('keeps every route that Gaff’s own forms use for Gaff’s own server', () => {
    for (const path of [
      '/sign-in/email',
      '/sign-up/email',
      '/sign-in/email-otp',
      '/sign-in/social',
      '/email-otp/send-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/reset-password',
      '/change-password',
      '/verify-password',
      '/link-social',
      '/unlink-account',
      '/passkey/delete-passkey',
      '/passkey/update-passkey',
      '/revoke-session',
      '/revoke-other-sessions',
      '/sign-out',
    ]) {
      expect(openToBrowsers(path)).toBe(false);
    }
  });

  it('keeps routes Gaff doesn’t use at all closed, and any the library adds later', () => {
    for (const path of [
      '/update-user',
      '/update-session',
      '/change-email',
      '/email-otp/change-email',
      '/email-otp/request-email-change',
      '/delete-user',
      '/request-password-reset',
      '/reset-password',
      '/get-access-token',
      '/refresh-token',
      '/a-route-from-a-later-version',
      '',
    ]) {
      expect(openToBrowsers(path)).toBe(false);
    }
  });

  it('isn’t fooled by a path that only looks like a way back from a provider', () => {
    expect(openToBrowsers('/callback/')).toBe(false);
    expect(openToBrowsers('/callback/google/extra')).toBe(false);
    expect(openToBrowsers('/x/callback/google')).toBe(false);
  });
});

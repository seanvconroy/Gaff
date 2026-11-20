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

  it('keeps every route that Gaff’s own screens use for Gaff’s own server', () => {
    for (const path of [
      '/gaff/sign-in/code',
      '/gaff/sign-in/link',
      '/sign-in/social',
      '/link-social',
      '/unlink-account',
      '/passkey/delete-passkey',
      '/passkey/update-passkey',
      '/passkey/list-user-passkeys',
      '/list-sessions',
      '/revoke-session',
      '/revoke-other-sessions',
      '/revoke-sessions',
      '/sign-out',
      '/list-accounts',
    ]) {
      expect(openToBrowsers(path)).toBe(false);
    }
  });

  it('keeps routes Gaff doesn’t use at all closed, and any the library adds later', () => {
    for (const path of [
      '/update-user',
      '/update-session',
      '/change-email',
      '/delete-user',
      '/get-access-token',
      '/refresh-token',
      '/account-info',
      '/a-route-from-a-later-version',
      '',
    ]) {
      expect(openToBrowsers(path)).toBe(false);
    }
  });

  it('BA-8: has no password route, open or otherwise (Q30: there are no passwords)', () => {
    for (const path of [
      '/sign-in/email',
      '/sign-up/email',
      '/change-password',
      '/verify-password',
      '/set-password',
      '/request-password-reset',
      '/reset-password',
      '/forget-password',
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

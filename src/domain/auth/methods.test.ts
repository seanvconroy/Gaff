import { describe, expect, it } from 'vitest';
import {
  isAppleRelayAddress,
  isProviderCancel,
  providerMode,
  signInMethodFrom,
  signInMethods,
} from './methods';

describe('UX-SI-1: three methods to choose between, and a passkey afterwards', () => {
  it('has no password and no email link', () => {
    expect(signInMethods).toEqual(['email_code', 'google', 'apple', 'passkey']);
    expect(signInMethodFrom('password')).toBeNull();
    expect(signInMethodFrom('email_link')).toBeNull();
    expect(signInMethodFrom('google')).toBe('google');
    expect(signInMethodFrom(undefined)).toBeNull();
  });

  it('shows Google and Apple only when they can work', () => {
    const local = { gaffEnv: 'development' } as const;
    expect(providerMode({ ...local, credentialsSet: true, devTools: false })).toBe('real');
    expect(providerMode({ ...local, credentialsSet: true, devTools: true })).toBe('real');
    expect(providerMode({ ...local, credentialsSet: false, devTools: true })).toBe('stand_in');
    expect(providerMode({ ...local, credentialsSet: false, devTools: false })).toBe('off');
    expect(providerMode({ gaffEnv: 'test', credentialsSet: false, devTools: true })).toBe(
      'stand_in',
    );
  });

  it('BA-1, AU1: never uses the stand-in on the test copy or in production', () => {
    for (const gaffEnv of ['staging', 'production'] as const) {
      expect(providerMode({ gaffEnv, credentialsSet: false, devTools: true })).toBe('off');
      expect(providerMode({ gaffEnv, credentialsSet: true, devTools: true })).toBe('real');
    }
  });
});

describe('UX-SI-11: Apple’s “Hide My Email”', () => {
  it('knows a relay address', () => {
    expect(isAppleRelayAddress('k7x2m9q4tz@privaterelay.appleid.com')).toBe(true);
    expect(isAppleRelayAddress(' K7X2@PrivateRelay.AppleID.com ')).toBe(true);
    expect(isAppleRelayAddress('ann@example.ie')).toBe(false);
    expect(isAppleRelayAddress('ann@privaterelay.appleid.com.example.ie')).toBe(false);
  });
});

describe('UX-SI states: Google or Apple cancelled', () => {
  it('is not an error to show', () => {
    expect(isProviderCancel('access_denied')).toBe(true);
    expect(isProviderCancel('user_cancelled_authorize')).toBe(true);
    expect(isProviderCancel('account_not_linked')).toBe(false);
    expect(isProviderCancel('')).toBe(false);
  });
});

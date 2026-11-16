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
    expect(providerMode({ credentialsSet: true, devTools: false })).toBe('real');
    expect(providerMode({ credentialsSet: true, devTools: true })).toBe('real');
    expect(providerMode({ credentialsSet: false, devTools: true })).toBe('stand_in');
    expect(providerMode({ credentialsSet: false, devTools: false })).toBe('off');
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

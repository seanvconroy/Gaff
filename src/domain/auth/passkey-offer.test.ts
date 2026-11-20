import { describe, expect, it } from 'vitest';
import { NOT_NOW_DAYS, deviceKind, passkeyMemoryFrom, shouldOfferPasskey } from './passkey-offer';

describe('UX-SI-4: a passkey is offered after the first sign-in on a device that supports it', () => {
  it('is offered after signing in by code, Google or Apple', () => {
    for (const method of ['email_code', 'google', 'apple'] as const) {
      expect(shouldOfferPasskey({ method, deviceCan: true, remembered: null })).toBe(true);
    }
  });

  it('is not offered on a device that can’t keep one', () => {
    expect(shouldOfferPasskey({ method: 'google', deviceCan: false, remembered: null })).toBe(
      false,
    );
  });

  it('is not offered to someone who just used a passkey, or whose device has one', () => {
    expect(shouldOfferPasskey({ method: 'passkey', deviceCan: true, remembered: null })).toBe(
      false,
    );
    expect(shouldOfferPasskey({ method: 'email_code', deviceCan: true, remembered: 'added' })).toBe(
      false,
    );
  });

  it('remembers “Not now” for 30 days', () => {
    expect(NOT_NOW_DAYS).toBe(30);
    expect(shouldOfferPasskey({ method: 'email_code', deviceCan: true, remembered: 'later' })).toBe(
      false,
    );
  });

  it('is never offered when nobody has just signed in', () => {
    expect(shouldOfferPasskey({ method: null, deviceCan: true, remembered: null })).toBe(false);
  });

  it('reads only what it wrote', () => {
    expect(passkeyMemoryFrom('later')).toBe('later');
    expect(passkeyMemoryFrom('added')).toBe('added');
    expect(passkeyMemoryFrom('yes')).toBeNull();
    expect(passkeyMemoryFrom(undefined)).toBeNull();
  });
});

describe('UX-SI-4: the sheet uses the device’s own wording', () => {
  it('knows an iPhone, a Mac, an Android phone and a Windows laptop', () => {
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)')).toBe('apple');
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('apple');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 16; Pixel 9)')).toBe('android');
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(deviceKind('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');
    expect(deviceKind('')).toBe('other');
  });
});

import { describe, expect, it } from 'vitest';
import { offeredProviders, providerModes } from './providers';

const none = { GOOGLE_CLIENT_ID: undefined, APPLE_CLIENT_ID: undefined };

describe('AU1: where Google and Apple can be used', () => {
  it('uses the real provider wherever its settings are', () => {
    const config = {
      ...none,
      GAFF_ENV: 'production',
      DEV_TOOLS: false,
      GOOGLE_CLIENT_ID: 'id',
    } as const;
    expect(providerModes(config)).toEqual({ google: 'live', apple: 'off' });
    expect(offeredProviders(config)).toEqual(['google']);
  });

  it('uses the stand-in in local development and tests, with the test tools on', () => {
    for (const GAFF_ENV of ['development', 'test'] as const) {
      expect(providerModes({ ...none, GAFF_ENV, DEV_TOOLS: true })).toEqual({
        google: 'stand_in',
        apple: 'stand_in',
      });
    }
    expect(providerModes({ ...none, GAFF_ENV: 'development', DEV_TOOLS: false })).toEqual({
      google: 'off',
      apple: 'off',
    });
  });

  it('never uses the stand-in on the test copy or in production, where anyone could reach it', () => {
    for (const GAFF_ENV of ['staging', 'production'] as const) {
      expect(providerModes({ ...none, GAFF_ENV, DEV_TOOLS: true })).toEqual({
        google: 'off',
        apple: 'off',
      });
      expect(offeredProviders({ ...none, GAFF_ENV, DEV_TOOLS: true })).toEqual([]);
    }
  });

  it('prefers the real provider to the stand-in, one provider at a time', () => {
    expect(
      providerModes({
        ...none,
        GAFF_ENV: 'development',
        DEV_TOOLS: true,
        APPLE_CLIENT_ID: 'ie.gaff.signin',
      }),
    ).toEqual({ google: 'stand_in', apple: 'live' });
  });
});

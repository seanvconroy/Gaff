import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetEnvForTests } from '@/lib/env';
import { standInKeyMatches, standInUrl } from './stand-in';

// The key is made with Gaff's secret, so the test brings its own settings and needs no .env.
beforeAll(() => {
  vi.stubEnv('GAFF_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://gaff:gaff@localhost:5432/gaff_test');
  vi.stubEnv('AUTH_SECRET', 'a-made-up-secret-of-at-least-32-characters');
  vi.stubEnv('APP_URL', 'https://gaff.test');
  resetEnvForTests();
});
afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

const checkId = '3f0c7a52-8a43-4c4b-9a64-0b7b1c2b5d10';
const other = '6a1d0e7c-2b9f-4d8a-8e5c-1f2a3b4c5d6e';

describe('BA-6: the stand-in check’s own link', () => {
  it('carries a key for that check alone, and the way back', () => {
    const url = new URL(standInUrl(checkId, 'https://gaff.test/checks/done?kind=identity'));
    expect(url.pathname).toBe(`/dev/checks/${checkId}`);
    expect(url.searchParams.get('return')).toBe('https://gaff.test/checks/done?kind=identity');
    const key = url.searchParams.get('key');
    expect(standInKeyMatches(checkId, key)).toBe(true);
    expect(standInKeyMatches(other, key)).toBe(false);
  });

  it('refuses no key, an empty key or a made-up one', () => {
    expect(standInKeyMatches(checkId, null)).toBe(false);
    expect(standInKeyMatches(checkId, '')).toBe(false);
    expect(standInKeyMatches(checkId, 'not-the-key')).toBe(false);
  });
});

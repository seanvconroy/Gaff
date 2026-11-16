import { describe, expect, it } from 'vitest';
import { safeNextPath, signInPath } from './next-path';

describe('UX-SI-8: after sign-in, only a same-site path is followed', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNextPath('/lettings')).toBe('/lettings');
    expect(safeNextPath('/lettings/new?step=2')).toBe('/lettings/new?step=2');
    expect(safeNextPath('/settings#payment-heading')).toBe('/settings#payment-heading');
    expect(safeNextPath('/')).toBe('/');
  });

  it('refuses another site, however it is written', () => {
    for (const value of [
      'https://evil.example/lettings',
      'http://evil.example',
      '//evil.example',
      '//evil.example/lettings',
      '/\\evil.example',
      '\\\\evil.example',
      '/\\/evil.example',
      'javascript:alert(1)',
      'evil.example',
      'lettings',
      ' /lettings',
      '/\t/evil.example',
      '/\n/evil.example',
      '/%09/evil.example',
      '/%5cevil.example',
      '/lettings\u0000',
    ]) {
      expect(safeNextPath(value), value).toBeNull();
    }
  });

  it('refuses anything that is not a short piece of text', () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(['/lettings'])).toBeNull();
    expect(safeNextPath(`/${'a'.repeat(600)}`)).toBeNull();
  });

  it('never goes back into sign-in, or to an API or development address', () => {
    expect(safeNextPath('/sign-in')).toBeNull();
    expect(safeNextPath('/sign-in/code')).toBeNull();
    expect(safeNextPath('/sign-in?next=/lettings')).toBeNull();
    expect(safeNextPath('/api/auth/sign-out')).toBeNull();
    expect(safeNextPath('/dev/outbox')).toBeNull();
    expect(safeNextPath('/lettings/../sign-in')).toBeNull();
    expect(safeNextPath('/sign-in-help')).toBe('/sign-in-help');
  });

  it('refuses a path that carries an email address (rule 8: none in a URL)', () => {
    expect(safeNextPath('/lettings?to=ann@example.ie')).toBeNull();
    expect(safeNextPath('/lettings?to=ann%40example.ie')).toBeNull();
  });
});

describe('UX-SI-8: the way into sign-in', () => {
  it('is plain when there is nowhere to go back to', () => {
    expect(signInPath()).toBe('/sign-in');
    expect(signInPath(null)).toBe('/sign-in');
    expect(signInPath('https://evil.example')).toBe('/sign-in');
    expect(signInPath('/')).toBe('/sign-in');
  });

  it('carries a safe destination', () => {
    expect(signInPath('/lettings/new?step=2')).toBe('/sign-in?next=%2Flettings%2Fnew%3Fstep%3D2');
  });
});

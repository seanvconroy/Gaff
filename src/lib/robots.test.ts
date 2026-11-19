import { describe, expect, it } from 'vitest';
import { robotsFor } from './robots';

describe('BA-1, UX-LS-11: robots.txt', () => {
  it('disallows everything unless search indexing is on', () => {
    expect(robotsFor('off')).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('allows homes’ public pages alone where it is on', () => {
    expect(robotsFor('on')).toEqual({
      rules: { userAgent: '*', allow: ['/homes/'], disallow: '/' },
    });
  });
});

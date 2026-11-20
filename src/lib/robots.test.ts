import { describe, expect, it } from 'vitest';
import { robotsFor } from './robots';

describe('BA-1, UX-LS-11, M111: robots.txt', () => {
  it('disallows everything, and names no sitemap, unless search indexing is on', () => {
    expect(robotsFor('off')).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(robotsFor('off', 'https://gaff.ie')).toEqual({
      rules: { userAgent: '*', disallow: '/' },
    });
  });

  it('M111: allows homes’ and places’ pages alone where it is on, and points at the sitemap', () => {
    expect(robotsFor('on', 'https://gaff.ie/')).toEqual({
      rules: { userAgent: '*', allow: ['/homes/', '/to-rent/'], disallow: '/' },
      sitemap: 'https://gaff.ie/sitemap.xml',
    });
  });
});

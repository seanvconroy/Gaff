import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('M56: place slugs', () => {
  it('drops accents, apostrophes and punctuation', () => {
    expect(slugify('Dún Laoghaire')).toBe('dun-laoghaire');
    expect(slugify("Harold's Cross")).toBe('harolds-cross');
    expect(slugify('  Dublin 6W ')).toBe('dublin-6w');
    expect(slugify('Rathgar, Dublin 6')).toBe('rathgar-dublin-6');
  });
});

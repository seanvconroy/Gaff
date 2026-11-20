import { describe, expect, it } from 'vitest';
import { isEnquirySource, sourcesInWords, withSource } from './sources';

describe('UX-AV-8: where an enquiry came from', () => {
  it('UX-AV-8: names each source as renters know it', () => {
    expect(sourcesInWords(['gaff'])).toBe('Gaff');
    expect(sourcesInWords(['daft'])).toBe('Daft');
    expect(sourcesInWords(['myhome'])).toBe('MyHome');
  });

  it('UX-AV-9: a person who came from two places shows both, in one order, once each', () => {
    expect(sourcesInWords(['daft', 'gaff'])).toBe('Gaff and Daft');
    expect(sourcesInWords(['myhome', 'daft', 'gaff'])).toBe('Gaff, Daft and MyHome');
    expect(withSource(['daft'], 'gaff')).toEqual(['gaff', 'daft']);
    expect(withSource(['daft', 'gaff'], 'gaff')).toEqual(['gaff', 'daft']);
  });

  it('UX-AV-8: an unknown code is never shown', () => {
    expect(sourcesInWords(['somewhere'])).toBe('');
    expect(isEnquirySource('gaff')).toBe(true);
    expect(isEnquirySource('somewhere')).toBe(false);
  });
});

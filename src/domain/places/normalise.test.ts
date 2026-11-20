import { describe, expect, it } from 'vitest';
import { normalise, normaliseQuery, queryWords, similarity, wordsMatch } from './normalise';

describe('M56: one way of writing place names', () => {
  it('drops fadas, case, apostrophes and punctuation', () => {
    expect(normalise('Dún Laoghaire')).toBe('dun laoghaire');
    expect(normalise("St Vincent's University Hospital")).toBe('st vincents university hospital');
    expect(normalise('  Harold’s   Cross ')).toBe('harolds cross');
    expect(normalise('Cionn tSáile')).toBe('cionn tsaile');
    expect(normalise('Sheriff St. Upper & Lower')).toBe('sheriff st upper and lower');
  });

  it('takes "County" and "Co." off the front of what was typed', () => {
    expect(normaliseQuery('County Sligo')).toBe('sligo');
    expect(normaliseQuery('Co. Kerry')).toBe('kerry');
    expect(normaliseQuery('county')).toBe('county');
  });

  it('understands short forms: "Rd" is road, "St" is street or saint', () => {
    const words = queryWords('Highfield Rd');
    expect(wordsMatch(words, ['highfield', 'road'])).toBe(true);
    expect(wordsMatch(queryWords('st vincents'), ['saint', 'vincents', 'hospital'])).toBe(true);
    expect(wordsMatch(queryWords('high'), ['highfield', 'road'])).toBe(true);
    expect(wordsMatch(queryWords('highfield park'), ['highfield', 'road'])).toBe(false);
  });

  it('scores near spellings the way pg_trgm does', () => {
    expect(similarity('kinsael', 'kinsale')).toBeGreaterThan(0.35);
    expect(similarity('rathmins', 'rathmines')).toBeGreaterThan(0.5);
    expect(similarity('kinsale', 'galway')).toBe(0);
    expect(similarity('kinsale', 'kinsale')).toBe(1);
  });
});

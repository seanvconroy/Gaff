import { describe, expect, it } from 'vitest';
import {
  joinSurnames,
  matchForm,
  normalise,
  normaliseQuery,
  placeQuery,
  placeQueryWords,
  queryWords,
  similarity,
  wordsMatch,
  writtenApart,
} from './normalise';

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

  it('Q60: "O Connell", "O\'Connell" and "OConnell" are one name in the place search', () => {
    for (const typed of [
      'O Connell Street',
      "O'Connell Street",
      'O’Connell Street',
      'OConnell Street',
    ]) {
      expect(placeQuery(typed)).toBe('oconnell street');
    }
    expect(placeQuery('Ó Conaill')).toBe('oconaill');
    expect(placeQuery('Mc Curtain St')).toBe('mccurtain st');
    expect(placeQuery('McCurtain St')).toBe('mccurtain st');
    expect(placeQuery('Sean Mac Dermott Street')).toBe('sean macdermott street');
    expect(placeQuery('County O Brien')).toBe('obrien');
    // The names it is compared with are joined the same way, however the index holds them.
    expect(matchForm('Maurice O Neill Memorial Bridge')).toBe('maurice oneill memorial bridge');
    expect(matchForm("O'Neill Park")).toBe('oneill park');
    expect(matchForm('Mc Curtain Street')).toBe(matchForm('McCurtain Street'));
    expect(matchForm('Sligo Mac Diarmada')).toBe('sligo macdiarmada');
    expect(wordsMatch(placeQueryWords('o connell st'), ['oconnell', 'street'])).toBe(true);
    expect(wordsMatch(placeQueryWords('o con'), ['oconnell', 'street'])).toBe(true);
  });

  it('Q60: joins only a prefix that has a word after it, and leaves other words alone', () => {
    expect(joinSurnames('o')).toBe('o');
    expect(joinSurnames('main street o')).toBe('main street o');
    expect(joinSurnames('mc 2')).toBe('mc 2');
    expect(joinSurnames('polo grounds')).toBe('polo grounds');
    expect(joinSurnames('tarmac road')).toBe('tarmac road');
    expect(joinSurnames('big mac o brien mc cabe')).toBe('big mac obrien mccabe');
    expect(joinSurnames('oconnell street')).toBe('oconnell street');
  });

  it("Q60: `normalise` and an address's words stay as they were, for the index and the database", () => {
    // search_text and gaff_address_words are written with these: they must not start joining.
    expect(normalise('O Connell Street')).toBe('o connell street');
    expect(normaliseQuery('Mc Curtain St')).toBe('mc curtain st');
    expect(queryWords('O Connell St').map((forms) => forms[0])).toEqual(['o', 'connell', 'st']);
  });

  it('Q60: a joined surname is also asked for written apart', () => {
    expect(writtenApart('oconnell')).toBe('o connell');
    expect(writtenApart('mccurtain')).toBe('mc curtain');
    expect(writtenApart('maccurtain')).toBe('mac curtain');
    expect(writtenApart('ocon')).toBe('o con');
    expect(writtenApart('street')).toBeNull();
    expect(writtenApart('oak')).toBeNull();
    expect(writtenApart('mc')).toBeNull();
  });

  it('scores near spellings the way pg_trgm does', () => {
    expect(similarity('kinsael', 'kinsale')).toBeGreaterThan(0.35);
    expect(similarity('rathmins', 'rathmines')).toBeGreaterThan(0.5);
    expect(similarity('kinsale', 'galway')).toBe(0);
    expect(similarity('kinsale', 'kinsale')).toBe(1);
  });
});

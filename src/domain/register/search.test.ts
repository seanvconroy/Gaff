import { describe, expect, it } from 'vitest';
import { sampleRegisterCsv } from '@/adapters/register/sample-register';
import { parseRegister } from './parse';
import {
  agencyNameFrom,
  licenceNumberSchema,
  matchesSearch,
  MOST_RESULTS,
  rankResults,
  searchKey,
  searchTerms,
  searchTextFor,
} from './search';

const register = parseRegister(sampleRegisterCsv).entries.map((entry) => ({
  ...entry,
  searchText: searchTextFor(entry),
}));

function find(typed: string): string[] {
  const terms = searchTerms(typed);
  return rankResults(
    register.filter((entry) => matchesSearch(entry.searchText, terms)),
    typed,
  ).map((entry) => agencyNameFrom(entry));
}

describe('UX-AG-1: the agency is found by typing its name', () => {
  it('finds an agency as the person types, from the first two letters', () => {
    expect(find('h')).toEqual([]);
    expect(find('ha')).toEqual(['Halcyon Homes Galway', 'Halcyon Lettings', 'Harbour Row']);
    expect(find('halcyon le')).toEqual(['Halcyon Lettings']);
    expect(find('Halcyon Lettings')).toEqual(['Halcyon Lettings']);
  });

  it('finds it by its trading name or its registered name', () => {
    expect(find('lee valley')).toEqual(['Lee Valley Lettings']);
    expect(find('suilleabhain')).toEqual(['Lee Valley Lettings']);
    expect(find('rowan and byrne property')).toEqual(['Rowan & Byrne']);
  });

  it('doesn’t mind capitals, accents, "&" or punctuation', () => {
    expect(find('ROWAN & BYRNE')).toEqual(['Rowan & Byrne']);
    expect(find('Ó Súilleabháin')).toEqual(['Lee Valley Lettings']);
    expect(find('o’suilleabhain')).toEqual([]);
    expect(find('halcyon homes (galway)')).toEqual(['Halcyon Homes Galway']);
  });

  it('every word typed must start a word of the name, in any order', () => {
    expect(find('lettings halcyon')).toEqual(['Halcyon Lettings']);
    expect(find('halcyon cork')).toEqual([]);
    // The middle of a word doesn't match: "yon" isn't how anyone looks for Halcyon.
    expect(find('yon')).toEqual([]);
  });

  it('a name that starts with what was typed comes first', () => {
    // "li" starts "Limited" in nearly every company's name, and one agency's own name.
    expect(find('li').length).toBeGreaterThan(3);
    expect(find('li')[0]).toBe('Liffey Quay');
    expect(find('lettings').length).toBeGreaterThan(3);
    expect(find('lee')[0]).toBe('Lee Valley Lettings');
  });

  it('shows a few results at most, and nothing for nothing', () => {
    expect(find('l').length).toBe(0);
    expect(find('li').length).toBeLessThanOrEqual(MOST_RESULTS);
    expect(find('   ')).toEqual([]);
    expect(find('zzzz')).toEqual([]);
  });

  it('never offers a business that isn’t licensed to let, or a person', () => {
    expect(find('slaney')).toEqual([]);
    expect(find('blackwater')).toEqual([]);
    expect(find('whelan')).toEqual([]);
  });
});

describe('the plain form names are compared in', () => {
  it('lower case, no accents, "&" as "and", no punctuation', () => {
    expect(searchKey('  Ó Súilleabháin & Daughters ')).toBe('o suilleabhain and daughters');
    expect(searchKey('Halcyon Homes (Galway) Limited')).toBe('halcyon homes galway limited');
    expect(searchKey('O’Brien’s')).toBe('obriens');
  });

  it('keeps both names once, for the search', () => {
    expect(
      searchTextFor({
        registeredName: 'Halcyon Lettings Limited',
        tradingName: 'Halcyon Lettings',
      }),
    ).toBe('halcyon lettings limited halcyon lettings');
    expect(searchTextFor({ registeredName: 'Corrib Homes Limited', tradingName: null })).toBe(
      'corrib homes limited',
    );
    expect(searchTextFor({ registeredName: 'Corrib Homes', tradingName: 'CORRIB HOMES' })).toBe(
      'corrib homes',
    );
  });
});

describe('UX-AG-2: "Enter the licence number instead"', () => {
  it('takes the number as the licence prints it, with or without spaces', () => {
    expect(licenceNumberSchema.parse('001234')).toBe('001234');
    expect(licenceNumberSchema.parse(' 001 234 ')).toBe('001234');
  });

  it('says what to enter, in plain words', () => {
    expect(licenceNumberSchema.safeParse('').error?.issues[0]?.message).toBe(
      'Enter your agency’s PSRA licence number',
    );
    expect(licenceNumberSchema.safeParse('PSR-1234').error?.issues[0]?.message).toBe(
      'Enter the number as it appears on the licence, like 001234',
    );
    // A person's own licence number isn't a business's.
    expect(licenceNumberSchema.safeParse('001234-004501').success).toBe(false);
  });
});

describe('UX-AC-9: the name renters see for an agency', () => {
  it('is its trading name, or its registered name when it has none', () => {
    expect(
      agencyNameFrom({
        registeredName: 'Halcyon Lettings Limited',
        tradingName: 'Halcyon Lettings',
      }),
    ).toBe('Halcyon Lettings');
    expect(agencyNameFrom({ registeredName: 'Corrib Homes Limited', tradingName: null })).toBe(
      'Corrib Homes Limited',
    );
  });
});

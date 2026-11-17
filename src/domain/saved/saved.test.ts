import { describe, expect, it } from 'vitest';
import { filterKeys, searchFiltersSchema } from '@/domain/search/filters';
import { parseSearch } from '@/domain/search/parse';
import type { SearchableHome } from '@/domain/search/match';
import {
  alertDueToday,
  alertEmailSchema,
  emailSearchRetention,
  filtersToKeep,
  homesForOneEmail,
  KEPT_FILTER_KEYS,
  MAX_HOMES_PER_ALERT,
  NEVER_KEPT,
  newHomesFor,
  savedHomeRefSchema,
  searchKey,
  worthKeeping,
} from './saved';

let n = 0;
function aHome(over: Partial<SearchableHome> = {}): SearchableHome {
  n += 1;
  return {
    id: n.toString(16).padStart(12, 'a'),
    addressLine1: `${n} Harbour Road`,
    addressLine2: null,
    area: 'Greystones',
    county: 'Wicklow',
    eircode: null,
    rentCents: 1_900_00,
    availableFrom: '2026-12-01',
    propertyType: 'apartment',
    bedrooms: 2,
    furnished: 'furnished',
    parking: 'street',
    criteria: { maxOccupants: 3, noPets: true },
    liveAt: new Date('2026-11-20T12:00:00Z'),
    ...over,
  };
}

const SAVED = new Date('2026-11-17T12:00:00Z');

describe('UX-MT-12, UX-MT-13: a saved search keeps the chips, never the sentence', () => {
  it('UX-MT-13: what a saved search keeps is exactly the chips search has', () => {
    expect([...KEPT_FILTER_KEYS].sort()).toEqual([...filterKeys].sort());
  });

  it('UX-MT-12: step-free access and a lift are never kept with a search', () => {
    for (const fact of NEVER_KEPT) {
      expect(KEPT_FILTER_KEYS as readonly string[]).not.toContain(fact);
      expect(filtersToKeep({ beds: 2, [fact]: true })).toEqual({ beds: 2 });
    }
  });

  it('UX-MT-12: a sentence becomes the allowed values, and only those are kept', () => {
    const { filters } = parseSearch(
      'Hi, 2-bed in Greystones under €2,000 for me and my partner, no pets. I’m a nurse on HAP',
      '2026-11-17',
    );
    const kept = filtersToKeep(filters);
    expect(kept).toEqual({ where: 'greystones', beds: 2, maxRent: 2000, people: 2, pets: false });
    const stored = JSON.stringify(kept).toLowerCase();
    for (const word of ['nurse', 'hap', 'partner', 'hi']) expect(stored).not.toContain(word);
  });

  it('UX-MT-13: anything that isn’t one of the chips, or doesn’t parse, is dropped', () => {
    expect(
      filtersToKeep({
        where: 'nowhere-at-all',
        beds: 2,
        maxRent: 'lots',
        words: 'a sentence',
        aboutMe: 'I am a nurse',
      }),
    ).toEqual({ beds: 2 });
    expect(filtersToKeep(null)).toEqual({});
    expect(filtersToKeep('beds=2')).toEqual({});
    // What is kept still reads as a search.
    expect(searchFiltersSchema.safeParse(filtersToKeep({ beds: 2, pets: false })).success).toBe(
      true,
    );
  });

  it('UX-SR-10: a search with no chips asks for every home, so there is nothing to keep', () => {
    expect(worthKeeping({})).toBe(false);
    expect(worthKeeping({ where: 'greystones' })).toBe(true);
  });

  it('UX-SR-10: the same search saved twice is the same search, whatever order it came in', () => {
    expect(searchKey({ beds: 2, where: 'greystones' })).toBe(
      searchKey({ where: 'greystones', beds: 2 }),
    );
    expect(searchKey({ beds: 2, where: 'greystones' })).toBe('where=greystones&beds=2');
    expect(searchKey({ beds: 2 })).not.toBe(searchKey({ beds: 3 }));
  });
});

describe('UX-SR-10: saving a search asks for an email, and nothing more', () => {
  it('UX-SR-10: an email address is read, tidied and checked', () => {
    expect(alertEmailSchema.parse('  Aoife.Byrne@Example.ie ')).toBe('aoife.byrne@example.ie');
    expect(alertEmailSchema.safeParse('not an email').success).toBe(false);
    expect(alertEmailSchema.safeParse('').success).toBe(false);
  });
});

describe('Saved homes are held by the home’s public reference', () => {
  it('UX-LS-1: only a public reference is a saved home, never an internal ID', () => {
    expect(savedHomeRefSchema.safeParse('0a1b2c3d4e5f').success).toBe(true);
    expect(savedHomeRefSchema.safeParse('00000000-0000-4000-8000-000000000001').success).toBe(
      false,
    );
    expect(savedHomeRefSchema.safeParse('../admin').success).toBe(false);
  });
});

describe('UX-SR-10, UX-MT-16: which homes a saved search tells its renter about', () => {
  const search = { filters: { where: 'greystones', beds: 2, maxRent: 2000 }, since: SAVED };

  it('UX-SR-10: a new home that fits everything asked is told', () => {
    const home = aHome();
    expect(newHomesFor({ ...search, told: [] }, [home])).toEqual([home]);
  });

  it('UX-SR-10: each home once: a home already told about is not told again', () => {
    const home = aHome();
    expect(newHomesFor({ ...search, told: [home.id] }, [home])).toEqual([]);
  });

  it('UX-SR-10: only new homes: one live before the search was saved isn’t news', () => {
    const before = aHome({ liveAt: new Date('2026-11-16T12:00:00Z') });
    expect(newHomesFor({ ...search, told: [] }, [before])).toEqual([]);
  });

  it('UX-SR-10: a home that is only close is not sent, and one elsewhere is not either', () => {
    const dear = aHome({ rentCents: 2_400_00 });
    const elsewhere = aHome({ area: 'Kinsale', county: 'Cork' });
    expect(newHomesFor({ ...search, told: [] }, [dear, elsewhere])).toEqual([]);
  });

  it('UX-MT-16, rule 3: who is told turns on the search and the home alone', () => {
    // The matcher is search's own: the same homes fit here as in results.
    const homes = [aHome(), aHome({ bedrooms: 1 }), aHome({ rentCents: 1_800_00 })];
    const told = newHomesFor({ ...search, told: [] }, homes).map((h) => h.id);
    expect(told.sort()).toEqual([homes[0]!.id, homes[2]!.id].sort());
  });
});

describe('UX-SR-10: one email a day at most', () => {
  it('UX-SR-10: nobody sent one today gets one; someone sent one today waits', () => {
    const now = new Date('2026-11-20T08:00:00Z');
    expect(alertDueToday(null, now)).toBe(true);
    expect(alertDueToday(new Date('2026-11-19T08:00:00Z'), now)).toBe(true);
    expect(alertDueToday(new Date('2026-11-20T00:30:00Z'), now)).toBe(false);
  });

  it('UX-SR-10: a day is an Irish day', () => {
    // 23:30 UTC on 19 November is already 20 November in Ireland's summer, not in its winter.
    expect(
      alertDueToday(new Date('2026-07-19T23:30:00Z'), new Date('2026-07-20T08:00:00Z')),
    ).toBe(false);
    expect(
      alertDueToday(new Date('2026-11-19T23:30:00Z'), new Date('2026-11-20T08:00:00Z')),
    ).toBe(true);
  });

  it('UX-SR-10: one email holds each home once, across every search, newest first', () => {
    const a = aHome({ liveAt: new Date('2026-11-20T09:00:00Z') });
    const b = aHome({ liveAt: new Date('2026-11-21T09:00:00Z') });
    const { homes, told } = homesForOneEmail([
      { searchId: 's1', homes: [a, b] },
      { searchId: 's2', homes: [b] },
    ]);
    expect(homes.map((h) => h.id)).toEqual([b.id, a.id]);
    expect(told.get('s1')).toEqual([a.id, b.id]);
    expect(told.get('s2')).toEqual([b.id]);
  });

  it('UX-SR-10: a long list waits: only the homes sent are marked told', () => {
    const many = Array.from({ length: MAX_HOMES_PER_ALERT + 2 }, (_, i) =>
      aHome({ liveAt: new Date(Date.UTC(2026, 10, 20, i)) }),
    );
    const { homes, told } = homesForOneEmail([{ searchId: 's1', homes: many }]);
    expect(homes).toHaveLength(MAX_HOMES_PER_ALERT);
    expect(told.get('s1')).toHaveLength(MAX_HOMES_PER_ALERT);
  });
});

describe('Rule 9: a saved search held by an email alone', () => {
  const created = new Date('2026-11-17T12:00:00Z');

  it('UX-SR-10: one not confirmed within a day is dropped', () => {
    const search = { createdAt: created, confirmedAt: null };
    expect(emailSearchRetention(search, new Date('2026-11-18T11:00:00Z'))).toBe('keep');
    expect(emailSearchRetention(search, new Date('2026-11-18T12:00:00Z'))).toBe('delete');
  });

  it('Q25: a confirmed one lasts two years, then is deleted by the job', () => {
    const search = { createdAt: created, confirmedAt: created };
    expect(emailSearchRetention(search, new Date('2028-11-16T12:00:00Z'))).toBe('keep');
    expect(emailSearchRetention(search, new Date('2028-11-17T12:00:00Z'))).toBe('delete');
  });
});

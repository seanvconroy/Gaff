import { describe, expect, it } from 'vitest';
import {
  type HomeFacts,
  type HomeVisibility,
  type ListerFacts,
  askToViewHref,
  homeBer,
  homeDescription,
  homeHighlights,
  homeHref,
  homeLettingDetails,
  homePageState,
  homeSummary,
  homeTitle,
  isPublicRef,
  letPageDue,
  listerMayShowHomes,
  placeOf,
  publicLister,
  sharePreview,
} from './home-page';

const now = new Date('2026-11-17T12:00:00Z');

const shown: HomeVisibility = {
  status: 'live',
  onGaff: true,
  berRating: 'C1',
  photos: 3,
  hiddenAt: null,
  pageRemovedAt: null,
  listerMayShow: true,
};

const home: HomeFacts = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  monthlyRentCents: 185_000,
  availableFrom: '2026-12-13',
  propertyType: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  furnished: 'furnished',
  parking: 'street',
  berRating: 'C1',
  description: 'A bright apartment on the first floor.\n\nFive minutes from the Luas.',
  criteria: { maxOccupants: 3, noPets: true, minStayMonths: 12 },
  noSmokingIndoors: true,
  facts: ['Gas central heating', 'Bins collected on Tuesdays'],
};

const agency: ListerFacts = {
  kind: 'agency',
  name: 'Halcyon Lettings',
  psraLicenceNumber: '001234',
  confirmedAt: new Date('2026-11-01'),
  licenceLapsedAt: null,
};

describe('UX-LS-11: a home’s page has a stable address with nothing personal in it', () => {
  it('UX-LS-11: the address is /homes/ and a random reference, never the letting’s ID', () => {
    expect(homeHref('3f9a1c2b7d4e')).toBe('/homes/3f9a1c2b7d4e');
    expect(askToViewHref('3f9a1c2b7d4e')).toBe('/homes/3f9a1c2b7d4e/ask');
    expect(isPublicRef('3f9a1c2b7d4e')).toBe(true);
    expect(isPublicRef('3f9a1c2b-7d4e-4a1b-9c2d-1e2f3a4b5c6d')).toBe(false);
    expect(isPublicRef('12-ranelagh-road')).toBe(false);
    expect(isPublicRef('3F9A1C2B7D4E')).toBe(false);
  });
});

describe('UX-LT-21, UX-LS-1, UX-LS-10: when a home’s page shows', () => {
  it('UX-LS-1: a live home that is on gaff.ie, with a BER and a photo, has its page', () => {
    expect(homePageState(shown)).toBe('live');
  });

  it('UX-LT-21: switching "On gaff.ie" off takes the page away at once', () => {
    expect(homePageState({ ...shown, onGaff: false })).toBe('not_available');
  });

  it('UX-LT-22: a home with no BER or no photo has no page', () => {
    expect(homePageState({ ...shown, berRating: null })).toBe('not_available');
    expect(homePageState({ ...shown, photos: 0 })).toBe('not_available');
  });

  it('UX-TS-1: a home whose lister may not have it live has no page', () => {
    expect(homePageState({ ...shown, listerMayShow: false })).toBe('not_available');
  });

  it('UX-TS-4: a home Gaff’s team hid has no page', () => {
    expect(homePageState({ ...shown, hiddenAt: now })).toBe('not_available');
  });

  it('a home in set-up or withdrawn has no page', () => {
    expect(homePageState({ ...shown, status: 'draft' })).toBe('not_available');
    expect(homePageState({ ...shown, status: 'withdrawn' })).toBe('not_available');
  });

  it('UX-LS-10: a let home says it has been let, until its page is removed', () => {
    expect(homePageState({ ...shown, status: 'let' })).toBe('let');
    expect(homePageState({ ...shown, status: 'let', pageRemovedAt: now })).toBe('not_available');
    // A let home that was never on Gaff never had a page to say so on.
    expect(homePageState({ ...shown, status: 'let', onGaff: false })).toBe('not_available');
  });

  it('UX-LS-10: the page of a let home is due to go 30 days after it was let', () => {
    const letAt = new Date('2026-10-18T12:00:00Z');
    expect(letPageDue(letAt, new Date('2026-11-16T12:00:00Z'))).toBe(false);
    expect(letPageDue(letAt, new Date('2026-11-17T12:00:00Z'))).toBe(true);
  });
});

describe('UX-TS-1: a lister may show homes while they may have them live', () => {
  it('UX-TS-1: a confirmed agency with its licence may; one being confirmed or lapsed may not', () => {
    expect(listerMayShowHomes(agency)).toBe(true);
    expect(listerMayShowHomes({ ...agency, confirmedAt: null })).toBe(false);
    expect(listerMayShowHomes({ ...agency, licenceLapsedAt: now })).toBe(false);
    expect(listerMayShowHomes({ ...agency, psraLicenceNumber: null })).toBe(false);
  });

  it('UX-TS-1: a landlord letting their own may (the identity check is WP-24)', () => {
    expect(
      listerMayShowHomes({
        kind: 'private_landlord',
        name: 'Mary',
        psraLicenceNumber: null,
        confirmedAt: null,
        licenceLapsedAt: null,
      }),
    ).toBe(true);
  });
});

describe('UX-LS-7: the lister, as renters see them', () => {
  it('UX-LS-7: an agency shows its name and its PSRA licence number', () => {
    expect(publicLister(agency)).toEqual({
      kind: 'agency',
      name: 'Halcyon Lettings',
      licence: '001234',
    });
  });

  it('UX-LS-7: a private landlord shows by first name only', () => {
    expect(
      publicLister({
        kind: 'private_landlord',
        name: 'Mary Byrne',
        psraLicenceNumber: null,
        confirmedAt: null,
        licenceLapsedAt: null,
      }),
    ).toEqual({ kind: 'landlord', name: 'Mary' });
  });

  it('a landlord’s team shows the name it gave', () => {
    expect(
      publicLister({
        kind: 'landlord',
        name: 'Doyle Homes',
        psraLicenceNumber: null,
        confirmedAt: null,
        licenceLapsedAt: null,
      }),
    ).toEqual({ kind: 'landlord', name: 'Doyle Homes' });
  });
});

describe('UX-LS-2: the page is made from the letting', () => {
  it('UX-LS-2: the title is the address, with one summary line', () => {
    expect(homeTitle(home)).toBe('12 Ranelagh Road, Ranelagh, Dublin 6');
    expect(homeSummary(home)).toBe('€1,850 a month · 2-bed apartment · Furnished');
    expect(homeSummary({ ...home, furnished: null })).toBe('€1,850 a month · 2-bed apartment');
  });

  it('UX-LS-2: highlights are the home’s facts, each with a kind for its icon', () => {
    expect(homeHighlights(home)).toEqual([
      { kind: 'bedrooms', text: '2 bedrooms' },
      { kind: 'bathrooms', text: '1 bathroom' },
      { kind: 'furnished', text: 'Furnished' },
      { kind: 'parking', text: 'On-street parking' },
      { kind: 'fact', text: 'Gas central heating' },
      { kind: 'fact', text: 'Bins collected on Tuesdays' },
    ]);
    expect(
      homeHighlights({
        ...home,
        bedrooms: 0,
        bathrooms: null,
        furnished: null,
        parking: null,
        facts: [],
      }),
    ).toEqual([]);
  });

  it('UX-LS-5, UX-MT-3: letting details are Gaff’s fixed words, starting with when it’s free', () => {
    expect(homeLettingDetails(home, now)).toEqual([
      'Available from Sunday 13 December',
      'A year or longer',
      'Up to 3 people',
      'No pets (assistance dogs always welcome)',
      'No smoking indoors',
    ]);
    expect(
      homeLettingDetails(
        { ...home, availableFrom: '2026-11-01', criteria: null, noSmokingIndoors: false },
        now,
      ),
    ).toEqual(['Available now']);
  });

  it('UX-LS-6: the description is the lister’s words, a paragraph at a time', () => {
    expect(homeDescription(home.description)).toEqual([
      'A bright apartment on the first floor.',
      'Five minutes from the Luas.',
    ]);
    expect(homeDescription(null)).toEqual([]);
  });

  it('UX-LS-8: the BER, or "BER exempt"', () => {
    expect(homeBer('C1')).toBe('BER C1');
    expect(homeBer('exempt')).toBe('BER exempt');
  });

  it('UX-LS-10: "See other homes in Ranelagh"', () => {
    expect(placeOf('Ranelagh, Dublin 6')).toBe('Ranelagh');
    expect(placeOf('Kinsale')).toBe('Kinsale');
  });

  it('UX-LS-11: a sharing preview has the address and the rent, and names nobody', () => {
    expect(sharePreview(home)).toEqual({
      title: '12 Ranelagh Road, Ranelagh, Dublin 6',
      description: '€1,850 a month · 2-bed apartment · Furnished',
    });
  });
});

describe('rule 3: nothing on a home’s page says who should live there', () => {
  it('UX-LS-6: a paragraph about who should apply is left out, the rest is kept', () => {
    expect(
      homeDescription(
        'A bright apartment on the first floor.\nWould suit a professional couple.\nNo HAP.\nGas heating.',
      ),
    ).toEqual(['A bright apartment on the first floor.', 'Gas heating.']);
  });

  it('rule 3: a fact about who should apply is not a highlight', () => {
    const texts = homeHighlights({
      ...home,
      facts: ['Gas central heating', 'Ideal for students', 'References required'],
    }).map((highlight) => highlight.text);
    expect(texts).toContain('Gas central heating');
    expect(texts).not.toContain('Ideal for students');
    expect(texts).not.toContain('References required');
  });

  it('rule 3: no line the page writes says "suit"', () => {
    const words = [
      homeTitle(home),
      homeSummary(home),
      ...homeLettingDetails(home, now),
      ...homeHighlights(home).map((highlight) => highlight.text),
    ].join(' ');
    expect(words).not.toMatch(/suit/i);
  });
});

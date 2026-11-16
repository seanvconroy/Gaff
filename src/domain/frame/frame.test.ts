import { describe, expect, it } from 'vitest';
import {
  frameFooter,
  frameHeader,
  homeFrom,
  homeSummaryLine,
  letBy,
  listerFrom,
  reachAPerson,
  type FrameHome,
} from './frame';

const now = new Date('2026-11-15T12:00:00Z');

const agency = listerFrom({
  name: 'Halcyon Lettings',
  kind: 'agency',
  psraLicenceNumber: '001234',
  inboundSlug: 'halcyon-lettings',
});
const landlord = listerFrom({
  name: 'Mary Byrne',
  kind: 'landlord',
  psraLicenceNumber: null,
  inboundSlug: 'mary-byrne',
});

const home: FrameHome = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  monthlyRentCents: 185_000,
  bedrooms: 2,
  propertyType: 'apartment',
  availableFrom: '2026-12-13',
  status: 'live',
};

describe('the frame of every private page: the header', () => {
  it('UX-PP-3: a renter’s page carries Gaff’s wordmark and “Talk to a person”', () => {
    expect(frameHeader('renter', agency)).toEqual({ brand: 'wordmark', talkToAPerson: true });
  });

  it('UX-PP-9: an owner’s and a referee’s page carry the agency’s name, not the wordmark', () => {
    for (const audience of ['owner', 'referee'] as const) {
      expect(frameHeader(audience, agency)).toEqual({
        brand: 'lister',
        name: 'Halcyon Lettings',
        talkToAPerson: false,
      });
    }
  });

  it('UX-PP-3: a renter can reach a person even when the link no longer names a lister', () => {
    expect(frameHeader('renter', null)).toEqual({ brand: 'wordmark', talkToAPerson: true });
  });

  it('UX-PP-9: with no agency to name (a link that has ended), the header is the wordmark alone', () => {
    expect(frameHeader('owner', null)).toEqual({ brand: 'wordmark', talkToAPerson: false });
  });
});

describe('the frame of every private page: who lets the home', () => {
  it('UX-PP-1: a renter’s page says who lets the home, under it', () => {
    expect(letBy('renter', agency)).toBe('Halcyon Lettings');
    expect(letBy('renter', landlord)).toBe('Mary Byrne');
  });

  it('UX-PP-9: an owner’s page names the agency in its header, not under the owner’s own home', () => {
    expect(letBy('owner', agency)).toBeNull();
    expect(letBy('referee', agency)).toBeNull();
    expect(letBy('renter', null)).toBeNull();
  });
});

describe('the frame of every private page: the home’s summary line', () => {
  it('UX-PP-5: before it’s let, the rent, the home and the date it’s free', () => {
    expect(homeSummaryLine(home, now)).toBe(
      '€1,850 a month · 2-bed apartment · From Sunday 13 December',
    );
  });

  it('UX-PP-5: a home not yet taking enquiries reads the same way', () => {
    expect(homeSummaryLine({ ...home, status: 'draft' }, now)).toBe(
      '€1,850 a month · 2-bed apartment · From Sunday 13 December',
    );
  });

  it('UX-PP-5: for the tenant, “From” is the day their tenancy starts', () => {
    expect(homeSummaryLine({ ...home, status: 'let', tenancyStartDate: '2026-12-20' }, now)).toBe(
      '€1,850 a month · 2-bed apartment · From Sunday 20 December',
    );
    // They are the tenant from the day they accept, before the letting is closed as let.
    expect(homeSummaryLine({ ...home, tenancyStartDate: '2026-12-20' }, now)).toBe(
      '€1,850 a month · 2-bed apartment · From Sunday 20 December',
    );
  });

  it('UX-PP-5: once it’s let or withdrawn, “From” is dropped for everyone else', () => {
    for (const status of ['let', 'withdrawn'] as const) {
      expect(homeSummaryLine({ ...home, status }, now)).toBe('€1,850 a month · 2-bed apartment');
    }
  });

  it('UX-PP-5: a studio is a studio, and a home of another kind is a home', () => {
    expect(homeSummaryLine({ ...home, propertyType: 'studio', bedrooms: 1 }, now)).toBe(
      '€1,850 a month · Studio · From Sunday 13 December',
    );
    expect(homeSummaryLine({ ...home, propertyType: 'other', bedrooms: 3 }, now)).toBe(
      '€1,850 a month · 3-bed home · From Sunday 13 December',
    );
    expect(homeSummaryLine({ ...home, propertyType: 'house', bedrooms: 4 }, now)).toBe(
      '€1,850 a month · 4-bed house · From Sunday 13 December',
    );
  });
});

describe('the frame of every private page: the home block’s facts', () => {
  const letting = {
    ...home,
    id: 'a-letting',
    eircode: 'D06 X0X0',
    createdBy: 'a-person',
    criteria: { noPets: true },
  };

  it('UX-PP-5: takes only what the home block shows from a letting', () => {
    expect(homeFrom(letting)).toEqual({ ...home, tenancyStartDate: null });
  });

  it('UX-PP-5: carries the tenancy’s start date on the tenant’s own page', () => {
    expect(homeSummaryLine(homeFrom(letting, '2026-12-20'), now)).toBe(
      '€1,850 a month · 2-bed apartment · From Sunday 20 December',
    );
  });
});

describe('the frame of every private page: the footer', () => {
  it('UX-PP-1: a renter’s footer names the lister, its PSRA licence and the privacy notice', () => {
    expect(frameFooter('renter', agency)).toEqual({
      listerName: 'Halcyon Lettings',
      licence: '001234',
      privacyHref: '/privacy/halcyon-lettings',
      reachLister: false,
      runWithGaff: false,
    });
  });

  it('UX-PP-1: the licence is shown only where there is one', () => {
    expect(frameFooter('renter', landlord).licence).toBeNull();
    expect(
      frameFooter(
        'renter',
        listerFrom({
          name: 'Halcyon Lettings',
          kind: 'agency',
          psraLicenceNumber: '  ',
          inboundSlug: 'halcyon-lettings',
        }),
      ).licence,
    ).toBeNull();
  });

  it('UX-PP-9: an owner’s and a referee’s footer say how to reach the agency, and “Run with Gaff”', () => {
    for (const audience of ['owner', 'referee'] as const) {
      expect(frameFooter(audience, agency)).toEqual({
        listerName: 'Halcyon Lettings',
        licence: '001234',
        // The privacy notice is written for renters, so it isn't linked for anyone else.
        privacyHref: null,
        reachLister: true,
        runWithGaff: true,
      });
    }
  });

  it('UX-PP-9: “Run with Gaff” is never on a renter’s page, which carries the wordmark instead', () => {
    expect(frameFooter('renter', agency).runWithGaff).toBe(false);
    expect(frameFooter('renter', null).runWithGaff).toBe(false);
  });

  it('a link that has ended names nobody, so its footer is empty', () => {
    expect(frameFooter('renter', null)).toEqual({
      listerName: null,
      licence: null,
      privacyHref: null,
      reachLister: false,
      runWithGaff: false,
    });
    expect(frameFooter('owner', null)).toEqual({
      listerName: null,
      licence: null,
      privacyHref: null,
      reachLister: false,
      runWithGaff: false,
    });
  });
});

describe('“Talk to a person”', () => {
  it('UX-PP-3, UX-AI-2: with no phone number on file, replying to any email is the one route', () => {
    expect(agency.phone).toBeNull();
    expect(reachAPerson(agency)).toEqual({ email: true, phone: null });
    expect(reachAPerson(null)).toEqual({ email: true, phone: null });
  });

  it('UX-PP-3, Q43: when the lister has a phone number, it is shown and can be rung', () => {
    const withPhone = listerFrom({
      name: 'Halcyon Lettings',
      kind: 'agency',
      psraLicenceNumber: '001234',
      inboundSlug: 'halcyon-lettings',
      phone: ' 01 496 0000 ',
    });
    expect(reachAPerson(withPhone)).toEqual({
      email: true,
      phone: { shown: '01 496 0000', href: 'tel:014960000' },
    });
    const international = listerFrom({
      name: 'Mary Byrne',
      kind: 'landlord',
      psraLicenceNumber: null,
      inboundSlug: 'mary-byrne',
      phone: '+353 (87) 123 4567',
    });
    expect(reachAPerson(international).phone).toEqual({
      shown: '+353 (87) 123 4567',
      href: 'tel:+353871234567',
    });
  });

  it('an empty phone number is no phone number', () => {
    const blank = listerFrom({
      name: 'Halcyon Lettings',
      kind: 'agency',
      psraLicenceNumber: '001234',
      inboundSlug: 'halcyon-lettings',
      phone: '   ',
    });
    expect(reachAPerson(blank)).toEqual({ email: true, phone: null });
  });
});

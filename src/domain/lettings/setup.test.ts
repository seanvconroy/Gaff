import { describe, expect, it } from 'vitest';
import { goLiveGate } from '@/domain/organisations/go-live-gate';
import {
  canLetAgain,
  canSendTestEnquiry,
  goLiveAsks,
  goLiveNeeds,
  needsForwarding,
  onGaffNeeds,
  phoneIsOptionalFor,
  readyToTakeEnquiries,
  type GoLiveFacts,
} from './setup';

const open = { open: true } as const;
const ready: GoLiveFacts = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  monthlyRentCents: 185_000,
  availableFrom: '2026-12-13',
  propertyType: 'apartment',
  bedrooms: 2,
  rentCheckDone: true,
  gate: open,
};

describe('UX-LT-14: what a letting needs to go live', () => {
  it('UX-LT-14: an address, a rent, a date, a type and bedrooms, a rent check and a confirmed lister', () => {
    expect(goLiveNeeds(ready)).toEqual([]);
  });

  it.each([
    [{ addressLine1: null }, 'address'],
    [{ area: null }, 'address'],
    [{ monthlyRentCents: null }, 'rent'],
    [{ availableFrom: null }, 'available_from'],
    [{ propertyType: null }, 'home'],
    [{ bedrooms: null }, 'home'],
    [{ rentCheckDone: false }, 'rent_check'],
  ] as const)('UX-LT-14: without %o it can’t go live: %s', (missing, need) => {
    expect(goLiveNeeds({ ...ready, ...missing })).toEqual([need]);
  });

  it('UX-LT-14: a studio with no bedrooms can go live', () => {
    expect(goLiveNeeds({ ...ready, propertyType: 'studio', bedrooms: 0 })).toEqual([]);
  });

  it('UX-LT-14: nothing else blocks go-live: the list of needs is exactly these six', () => {
    const nothing: GoLiveFacts = {
      addressLine1: null,
      area: null,
      county: null,
      monthlyRentCents: null,
      availableFrom: null,
      propertyType: null,
      bedrooms: null,
      rentCheckDone: false,
      gate: { open: false, reason: 'no_licence', waits: false },
    };
    expect(goLiveNeeds(nothing)).toEqual([
      'address',
      'rent',
      'available_from',
      'home',
      'rent_check',
      'lister',
    ]);
  });

  it('UX-LT-14: viewing times, letting details and comparable rents don’t come into it', () => {
    // A letting row always has its address, rent, date, type and bedrooms: only the rent check
    // is left to finish. Nothing about viewings, criteria or comparables is read.
    expect(readyToTakeEnquiries({ rentCheckDone: true })).toBe(true);
    expect(readyToTakeEnquiries({ rentCheckDone: false })).toBe(false);
    const state = { viewingSlots: 0, criteriaSet: false, comparables: 0, rentCheckDone: true };
    expect(readyToTakeEnquiries(state)).toBe(true);
  });

  it('UX-AG-2, UX-AG-6: an agency with no licence, or a lapsed one, is not a confirmed lister', () => {
    const agency = {
      kind: 'agency',
      psraLicenceNumber: null,
      confirmedAt: null,
      licenceLapsedAt: null,
    } as const;
    expect(goLiveNeeds({ ...ready, gate: goLiveGate(agency) })).toEqual(['lister']);
    expect(
      goLiveNeeds({
        ...ready,
        gate: goLiveGate({
          ...agency,
          psraLicenceNumber: '001234',
          confirmedAt: new Date(),
          licenceLapsedAt: new Date(),
        }),
      }),
    ).toEqual(['lister']);
  });

  it('UX-AG-4: an agency being confirmed can decide to go live: the decision waits, it isn’t refused', () => {
    const gate = goLiveGate({
      kind: 'agency',
      psraLicenceNumber: '001234',
      confirmedAt: null,
      licenceLapsedAt: null,
    });
    expect(gate).toEqual({ open: false, reason: 'being_confirmed', waits: true });
    expect(goLiveNeeds({ ...ready, gate })).toEqual([]);
  });

  it('UX-TS-2: a private landlord’s home can’t go live until they’ve confirmed it’s them', () => {
    const own = {
      kind: 'private_landlord',
      psraLicenceNumber: null,
      confirmedAt: null,
      licenceLapsedAt: null,
    } as const;
    expect(
      goLiveNeeds({ ...ready, gate: goLiveGate({ ...own, identityVerifiedAt: null }) }),
    ).toEqual(['lister']);
    expect(
      goLiveNeeds({ ...ready, gate: goLiveGate({ ...own, identityVerifiedAt: new Date() }) }),
    ).toEqual([]);
  });
});

describe('UX-LT-22: showing the home on Gaff', () => {
  it('UX-LT-14: to be shown on Gaff a home also needs a BER and one photo', () => {
    expect(onGaffNeeds({ berRating: null, photos: 0 })).toEqual(['ber', 'photo']);
    expect(onGaffNeeds({ berRating: 'C1', photos: 0 })).toEqual(['photo']);
    expect(onGaffNeeds({ berRating: null, photos: 2 })).toEqual(['ber']);
    expect(onGaffNeeds({ berRating: 'exempt', photos: 1 })).toEqual([]);
  });
});

describe('Step 9: what the go-live screen asks, each once', () => {
  it('Q43: a number renters can call is offered at a lister’s first go-live, if they have none', () => {
    expect(goLiveAsks({ kind: 'agency', phone: null, hasGoneLive: false }).phone).toBe('offered');
    expect(goLiveAsks({ kind: 'private_landlord', phone: null, hasGoneLive: false }).phone).toBe(
      'offered',
    );
  });

  it('Q43: it isn’t asked again: not with a number on file, and not after the first go-live', () => {
    expect(goLiveAsks({ kind: 'agency', phone: '01 234 5678', hasGoneLive: false }).phone).toBe(
      null,
    );
    expect(goLiveAsks({ kind: 'agency', phone: null, hasGoneLive: true }).phone).toBe(null);
  });

  it('Q43: for someone letting their own home, the number is optional in so many words', () => {
    expect(phoneIsOptionalFor('private_landlord')).toBe(true);
    expect(phoneIsOptionalFor('landlord')).toBe(true);
    expect(phoneIsOptionalFor('agency')).toBe(false);
  });
});

describe('UX-LT-23, UX-LT-24: what a letting’s menu offers', () => {
  it('UX-LT-24: a live letting can send a test enquiry until its first real one arrives', () => {
    expect(canSendTestEnquiry({ status: 'live', enquiries: 0 })).toBe(true);
    expect(canSendTestEnquiry({ status: 'live', enquiries: 1 })).toBe(false);
    expect(canSendTestEnquiry({ status: 'draft', enquiries: 0 })).toBe(false);
    expect(canSendTestEnquiry({ status: 'let', enquiries: 0 })).toBe(false);
  });

  it('UX-LT-23: only a closed letting can be let again', () => {
    expect(canLetAgain({ status: 'let' })).toBe(true);
    expect(canLetAgain({ status: 'withdrawn' })).toBe(true);
    expect(canLetAgain({ status: 'live' })).toBe(false);
    expect(canLetAgain({ status: 'draft' })).toBe(false);
  });

  it('UX-LT-20: a home advertised elsewhere with no forwarding in place has that as a task', () => {
    expect(needsForwarding({ advertisedOn: ['daft'], forwardingInPlace: false })).toBe(true);
    expect(needsForwarding({ advertisedOn: ['daft', 'myhome'], forwardingInPlace: true })).toBe(
      false,
    );
    expect(needsForwarding({ advertisedOn: [], forwardingInPlace: false })).toBe(false);
    expect(needsForwarding({ advertisedOn: null, forwardingInPlace: false })).toBe(false);
  });
});

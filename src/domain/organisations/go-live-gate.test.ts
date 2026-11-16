import { describe, expect, it } from 'vitest';
import { goLiveGate, isBeingConfirmed, licenceToShow } from './go-live-gate';

const confirmed = {
  kind: 'agency',
  psraLicenceNumber: '001234',
  confirmedAt: new Date('2026-11-16T10:00:00Z'),
  licenceLapsedAt: null,
} as const;

describe('UX-AG-4: until an agency is confirmed, the only thing held is go-live', () => {
  it('a confirmed agency with a licence on the register can put a home live', () => {
    expect(goLiveGate(confirmed)).toEqual({ open: true });
    expect(isBeingConfirmed(confirmed)).toBe(false);
  });

  it('an agency being confirmed can’t, and the home waits to go live when it is', () => {
    const agency = { ...confirmed, confirmedAt: null };
    expect(goLiveGate(agency)).toEqual({ open: false, reason: 'being_confirmed', waits: true });
    expect(isBeingConfirmed(agency)).toBe(true);
  });

  it('UX-AG-2: an agency applying for its licence can’t go live until a licence is found', () => {
    const applying = { ...confirmed, psraLicenceNumber: null, confirmedAt: null };
    expect(goLiveGate(applying)).toEqual({ open: false, reason: 'no_licence', waits: false });
  });
});

describe('UX-AG-6: a lapsed licence stops new lettings going live', () => {
  it('no new letting goes live until it’s renewed, confirmed or not', () => {
    const lapsed = { ...confirmed, licenceLapsedAt: new Date('2026-11-16T03:00:00Z') };
    expect(goLiveGate(lapsed)).toEqual({ open: false, reason: 'licence_lapsed', waits: false });
    expect(goLiveGate({ ...lapsed, confirmedAt: null })).toMatchObject({
      reason: 'licence_lapsed',
    });
  });

  it('once it’s back on the register, the agency can go live again', () => {
    expect(goLiveGate({ ...confirmed, licenceLapsedAt: null })).toEqual({ open: true });
  });
});

describe('UX-AC-7: a landlord letting their own homes has no licence to find', () => {
  it('a private landlord is never held for a licence or a confirmation', () => {
    const own = {
      kind: 'private_landlord',
      psraLicenceNumber: null,
      confirmedAt: null,
      licenceLapsedAt: null,
    } as const;
    // Q47's identity check before a first home goes live is work package WP-24: open for now.
    expect(goLiveGate(own)).toEqual({ open: true });
    expect(isBeingConfirmed(own)).toBe(false);
  });

  it('nor is a landlord’s team', () => {
    expect(
      goLiveGate({
        kind: 'landlord',
        psraLicenceNumber: null,
        confirmedAt: null,
        licenceLapsedAt: null,
      }),
    ).toEqual({ open: true });
  });
});

describe('UX-AG-7: the licence shown to renters comes from a confirmed agency’s register entry', () => {
  it('a confirmed agency’s licence number is shown', () => {
    expect(licenceToShow(confirmed)).toBe('001234');
  });

  it('an agency nobody has confirmed shows none: the number proves nothing about who uses it', () => {
    expect(licenceToShow({ ...confirmed, confirmedAt: null })).toBeNull();
  });

  it('a landlord shows none, whatever is stored', () => {
    expect(licenceToShow({ ...confirmed, kind: 'private_landlord' })).toBeNull();
    expect(licenceToShow({ ...confirmed, kind: 'landlord' })).toBeNull();
  });
});

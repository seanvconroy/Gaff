import { describe, expect, it } from 'vitest';
import {
  identityFromResult,
  identityStep,
  keptIdentityColumns,
  mayStartPersonCheck,
  namesMatch,
  offerToKeep,
} from './identity';

const kept = { verifiedName: 'Aoife Byrne', verifiedAt: new Date('2026-10-03T10:00:00Z') };

describe('UX-PF-10: a kept identity is three things', () => {
  it('UX-PF-10: whose it is, the verified name and the date: that it passed is that it exists', () => {
    expect(keptIdentityColumns).toEqual(['user_id', 'verified_name', 'verified_at']);
  });
});

describe('UX-PF-14: the verified name and the name on an application', () => {
  it('UX-PF-14: accents, case, apostrophes, hyphens, spacing and order don’t count', () => {
    expect(namesMatch('Seán Ó Briain', "sean o'briain")).toBe(false);
    expect(namesMatch('Seán Ó Briain', 'sean o briain')).toBe(true);
    expect(namesMatch('Seán O’Briain', "Sean O'Briain")).toBe(true);
    expect(namesMatch('Mary-Kate  Doyle', 'mary kate doyle')).toBe(true);
    expect(namesMatch('Byrne Aoife', 'Aoife Byrne')).toBe(true);
  });

  it('UX-PF-14: a different name is a different name, and an empty one matches nothing', () => {
    expect(namesMatch('Aoife Byrne', 'Aoife Ní Bhriain')).toBe(false);
    expect(namesMatch('Aoife Byrne', 'Aoife')).toBe(false);
    expect(namesMatch('', '')).toBe(false);
  });
});

describe('UX-PF-12: the renter’s ID check at the checks stage', () => {
  it('UX-PF-12: someone who keeps one is asked whether to use it', () => {
    expect(identityStep({ kept, applicationName: 'Aoife Byrne', doAgain: false })).toEqual({
      step: 'use_kept',
      kept,
    });
  });

  it('UX-PF-12: someone who said no does the check again; someone with none does it', () => {
    expect(identityStep({ kept, applicationName: 'Aoife Byrne', doAgain: true })).toEqual({
      step: 'provider',
    });
    expect(identityStep({ kept: null, applicationName: 'Aoife Byrne', doAgain: false })).toEqual({
      step: 'provider',
    });
  });

  it('UX-PF-14: a kept name that isn’t the application’s asks them to check their name', () => {
    expect(identityStep({ kept, applicationName: 'Aoife Kelly', doAgain: false })).toEqual({
      step: 'check_name',
      kept,
      applicationName: 'Aoife Kelly',
    });
  });
});

describe('UX-PF-8: "Keep this, so you never have to do it again?"', () => {
  it('UX-PF-8: asked after a check passes, when nothing is kept', () => {
    expect(offerToKeep({ passed: kept, kept: null })).toBe(true);
  });

  it('UX-PF-8: not asked when nothing passed, or what passed is what’s kept', () => {
    expect(offerToKeep({ passed: null, kept: null })).toBe(false);
    expect(offerToKeep({ passed: kept, kept: { ...kept } })).toBe(false);
  });

  it('UX-PF-9: a new check, after "My name has changed" or a "No", is asked about again', () => {
    const newer = { verifiedName: 'Aoife Kelly', verifiedAt: new Date('2026-11-17T10:00:00Z') };
    expect(offerToKeep({ passed: newer, kept })).toBe(true);
  });
});

describe('UX-PF-12: what the operator’s copy of an ID check holds', () => {
  it('UX-PF-12: the name and when it passed; an older result’s date is when the check ended', () => {
    const ended = new Date('2026-11-01T09:00:00Z');
    expect(
      identityFromResult({ verifiedName: 'Aoife Byrne', verifiedAt: kept.verifiedAt.toISOString() }, ended),
    ).toEqual(kept);
    expect(identityFromResult({ verifiedName: 'Aoife Byrne' }, ended)).toEqual({
      verifiedName: 'Aoife Byrne',
      verifiedAt: ended,
    });
    expect(identityFromResult(null, ended)).toBeNull();
  });
});

describe('UX-PF-13: a person’s own ID check, outside a letting’s checks', () => {
  it('UX-TS-2: a private landlord may, at their go-live', () => {
    expect(mayStartPersonCheck({ purpose: 'go_live', privateLandlord: true, kept: false })).toBe(
      true,
    );
  });

  it('UX-PF-13: a renter can’t verify before being chosen: no go-live, nothing kept, no check', () => {
    expect(mayStartPersonCheck({ purpose: 'go_live', privateLandlord: false, kept: false })).toBe(
      false,
    );
    expect(
      mayStartPersonCheck({ purpose: 'name_changed', privateLandlord: false, kept: false }),
    ).toBe(false);
  });

  it('UX-PF-9: someone who keeps one can redo it when their name has changed', () => {
    expect(
      mayStartPersonCheck({ purpose: 'name_changed', privateLandlord: false, kept: true }),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  agencyNameSchema,
  firstNameOf,
  landingFor,
  MOST_QUESTIONS,
  nameIsKnown,
  nameSchema,
  nextStep,
  purposeFromNext,
  purposes,
  stepsFor,
} from './first-run';

describe('UX-AC-6: first run asks one question per screen, and never more than four', () => {
  it('a renter and a private landlord each answer at most two', () => {
    for (const purpose of ['renting', 'own_home'] as const) {
      const asked = stepsFor({ nameKnown: false, purposeKnownBefore: false, purpose });
      expect(asked).toEqual(['name', 'purpose']);
    }
  });

  it('someone at an agency answers four at most: name, purpose, which agency, is it yours', () => {
    const asked = stepsFor({ nameKnown: false, purposeKnownBefore: false, purpose: 'agency' });
    expect(asked).toEqual(['name', 'purpose', 'agency', 'confirm']);
    expect(asked.length).toBeLessThanOrEqual(MOST_QUESTIONS);
  });

  it('nobody, whatever is known about them, is asked more than four', () => {
    for (const nameKnown of [true, false]) {
      for (const purposeKnownBefore of [true, false]) {
        for (const purpose of [...purposes, null]) {
          const asked = stepsFor({ nameKnown, purposeKnownBefore, purpose });
          expect(asked.length).toBeLessThanOrEqual(MOST_QUESTIONS);
        }
      }
    }
  });

  it('"What’s your name?" is skipped when sign-in supplied it', () => {
    expect(stepsFor({ nameKnown: true, purposeKnownBefore: false, purpose: null })).toEqual([
      'purpose',
    ]);
    expect(nameIsKnown('Ann Power')).toBe(true);
    // An email code supplies no name: the account carries nothing, or the address itself.
    expect(nameIsKnown('')).toBe(false);
    expect(nameIsKnown('   ')).toBe(false);
    expect(nameIsKnown('ann@halcyon.test')).toBe(false);
    expect(nameIsKnown(null)).toBe(false);
  });

  it('"What brings you to Gaff?" is skipped when Gaff already knows', () => {
    expect(stepsFor({ nameKnown: true, purposeKnownBefore: true, purpose: 'own_home' })).toEqual(
      [],
    );
    expect(stepsFor({ nameKnown: false, purposeKnownBefore: true, purpose: 'own_home' })).toEqual([
      'name',
    ]);
  });

  it('where they were going says why they came', () => {
    expect(purposeFromNext('/lettings/new')).toBe('own_home');
    expect(purposeFromNext('/lettings/new?from=%2F')).toBe('own_home');
    expect(purposeFromNext('/saved')).toBe('renting');
    expect(purposeFromNext('/enquiries')).toBe('renting');
    // UX-RN-13: someone who ticked "Keep my details for next time" is on their way back to
    // that home's page.
    expect(purposeFromNext(`/r/${'a'.repeat(43)}/keep`)).toBe('renting');
    expect(purposeFromNext(`/r/${'a'.repeat(43)}`)).toBeNull();
    // Anything else says nothing, so the question is asked.
    expect(purposeFromNext('/today')).toBeNull();
    expect(purposeFromNext('/profile')).toBeNull();
    expect(purposeFromNext('/lettings/new/extra')).toBeNull();
    expect(purposeFromNext(null)).toBeNull();
    expect(purposeFromNext('')).toBeNull();
  });
});

describe('UX-AC-10: a person can leave at any step and come back to where they were', () => {
  it('the step that opens is the first question they have not answered', () => {
    expect(nextStep({ nameKnown: false, purpose: null, agencyPicked: false })).toBe('name');
    expect(nextStep({ nameKnown: true, purpose: null, agencyPicked: false })).toBe('purpose');
    expect(nextStep({ nameKnown: true, purpose: 'agency', agencyPicked: false })).toBe('agency');
    expect(nextStep({ nameKnown: true, purpose: 'agency', agencyPicked: true })).toBe('confirm');
  });

  it('the name is asked first even when the purpose is already known', () => {
    expect(nextStep({ nameKnown: false, purpose: 'own_home', agencyPicked: false })).toBe('name');
  });

  it('a renter and a private landlord are done once the purpose is known', () => {
    expect(nextStep({ nameKnown: true, purpose: 'renting', agencyPicked: false })).toBe('done');
    expect(nextStep({ nameKnown: true, purpose: 'own_home', agencyPicked: false })).toBe('done');
  });
});

describe('where first run ends', () => {
  it('a renter lands on Search, a private landlord in "Add your home", an agency on Today', () => {
    expect(landingFor('renting')).toBe('/');
    expect(landingFor('own_home')).toBe('/lettings/new');
    expect(landingFor('agency')).toBe('/today');
  });
});

describe('the answers', () => {
  it('a name is one field, first and last, and is never an email address', () => {
    expect(nameSchema.parse('  Ann Power ')).toBe('Ann Power');
    expect(nameSchema.safeParse('').error?.issues[0]?.message).toBe('Enter your name');
    expect(nameSchema.safeParse('ann@halcyon.test').success).toBe(false);
  });

  it('UX-AC-9: renters call a private landlord by their first name, for now', () => {
    expect(firstNameOf('Ann Power')).toBe('Ann');
    expect(firstNameOf('  Seán   Ó Briain ')).toBe('Seán');
    expect(firstNameOf('Madonna')).toBe('Madonna');
  });

  it('UX-AG-2: an agency applying for its licence gives only its name', () => {
    expect(agencyNameSchema.parse(' Halcyon Lettings ')).toBe('Halcyon Lettings');
    expect(agencyNameSchema.safeParse('').error?.issues[0]?.message).toBe(
      'Enter the name of your agency',
    );
  });
});

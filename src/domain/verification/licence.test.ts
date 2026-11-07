import { describe, expect, it } from 'vitest';
import { matchRegister, normaliseLicence, sameLicence } from './licence';

const register = [
  {
    licenceNumber: '001234',
    name: 'Halcyon Property Solutions Limited',
    status: 'current' as const,
  },
  { licenceNumber: '002345', name: 'Ann Power', status: 'current' as const },
  { licenceNumber: '009999', name: 'Old Agency Ltd', status: 'expired' as const },
];

describe('M23: PSRA licences against the public register', () => {
  it('reads licence numbers as printed', () => {
    expect(normaliseLicence(' 001 234 ')).toBe('001234');
    expect(normaliseLicence('PSRA-1')).toBeNull();
    expect(sameLicence('1234', '001234')).toBe(true);
  });

  it('passes when the number and the name both agree', () => {
    expect(
      matchRegister({ licenceNumber: '1234', names: ['Halcyon Property Solutions'] }, register),
    ).toMatchObject({ outcome: 'match' });
    expect(
      matchRegister({ licenceNumber: '002345', names: ['Power, Ann'] }, register),
    ).toMatchObject({ outcome: 'match' });
  });

  it('sends anything else to a person', () => {
    expect(matchRegister({ licenceNumber: '001234', names: ['Someone Else'] }, register)).toEqual({
      outcome: 'needs_review',
      reason: 'name_differs',
    });
    expect(matchRegister({ licenceNumber: '009999', names: ['Old Agency'] }, register)).toEqual({
      outcome: 'needs_review',
      reason: 'not_current',
    });
    expect(matchRegister({ licenceNumber: '005555', names: ['Anyone'] }, register)).toEqual({
      outcome: 'needs_review',
      reason: 'not_found',
    });
  });
});

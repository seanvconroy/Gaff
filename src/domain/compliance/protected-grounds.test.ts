import { describe, expect, it } from 'vitest';
import { findProtectedGrounds, protectedGroundProblem } from './protected-grounds';

describe('Q7: wording that touches the protected grounds is caught', () => {
  it.each([
    ['No HAP', 'housing_assistance'],
    ['Rent supplement not accepted', 'housing_assistance'],
    ['Would suit working professionals', 'housing_assistance'],
    ['Suits a professional couple', 'housing_assistance'],
    ['No children', 'family_status'],
    ['Ideal for a young family', 'family_status'],
    ['Couples only', 'civil_status'],
    ['Married couple preferred', 'civil_status'],
    ['Female tenants only', 'gender'],
    ['Suits a mature person', 'age'],
    ['No students', 'age'],
    ['Near the Catholic church', 'religion'],
    ['Irish only', 'race'],
    ['No travellers', 'traveller_community'],
    ['Not suitable for disabled people', 'disability'],
    ['Gay-friendly', 'sexual_orientation'],
    ['Straight couples only', 'sexual_orientation'],
  ])('flags "%s" (%s)', (text, ground) => {
    expect(findProtectedGrounds(text).map((m) => m.ground)).toContain(ground);
  });

  it.each([
    'Bins are collected on Tuesdays',
    'Gas central heating',
    'Two double bedrooms and a box room',
    'Wheelchair accessible, with a lift to every floor',
    'Ten minutes to the Luas at Ranelagh',
    'Off-street parking for one car',
    'Single bed in the box room',
    'Professionally cleaned before you move in',
    'Professional cleaning between tenancies',
    'We’ll email you straight away',
    'Straight down the road from the Luas',
  ])('allows "%s"', (text) => {
    expect(findProtectedGrounds(text)).toEqual([]);
  });

  it('explains the problem to the operator in plain words', () => {
    expect(protectedGroundProblem('No HAP')).toBe(
      "“HAP” touches on housing assistance, which equality law protects, so Gaff can't share it with renters. Describe the home instead, or leave it out.",
    );
    expect(protectedGroundProblem('Gas central heating')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  homeWordingProblem,
  homeWordingReason,
  homeWordingWhy,
  whoShouldApplyPhrase,
} from './who-should-apply';

describe('UX-LT-6, UX-MT-4: words about a home never say who should live there', () => {
  it.each([
    'Would suit a working couple',
    'Would ideally suit a commuter',
    'Suits someone working in the city',
    'Ideal for a professional person',
    'Perfect for sharers',
    'Suitable for a single person',
    'Quiet tenants preferred',
    'Working tenants only',
    'Respectable people wanted',
    'References required',
    'Work references and payslips are essential',
    'Must be working',
    'Non-smokers',
    'No sharers',
    'A lovely home for a couple',
    'Applicants considered on references',
  ])('flags "%s"', (text) => {
    expect(whoShouldApplyPhrase(text)).not.toBeNull();
    expect(homeWordingProblem(text)).toContain("Gaff can't share it with renters");
  });

  it.each([
    'Gas fired central heating',
    'A couple of minutes from the Luas',
    'En-suite bathroom off the main bedroom',
    'Suitable for a home office',
    'Ideal for commuting: the bus stops outside',
    'Up to 3 people',
    'No pets',
    'No smoking indoors',
    'Minimum 12 month lease',
    'Bins are collected on Tuesdays',
    'A parking space is included',
    'Deposit and first month’s rent required before move-in',
    'Working fireplace in the sitting room',
    'Quiet cul-de-sac, five minutes’ walk to the village',
    'The only apartment on the top floor',
  ])('allows "%s"', (text) => {
    expect(homeWordingReason(text)).toBeNull();
    expect(homeWordingProblem(text)).toBeNull();
  });

  it('names a protected ground first, where the words touch one', () => {
    expect(homeWordingReason('Would suit a professional couple')).toEqual({
      reason: 'housing_assistance',
      phrase: 'suit a professional',
    });
    expect(homeWordingReason('No rent allowance')?.reason).toBe('housing_assistance');
    expect(homeWordingReason('References required')).toEqual({
      reason: 'about_who',
      phrase: 'References required',
    });
  });

  it('says why in a sentence', () => {
    expect(homeWordingWhy('about_who')).toBe(
      'It says who should live there, not what the home is like.',
    );
    expect(homeWordingWhy('housing_assistance')).toBe(
      'It touches on housing assistance, which equality law protects.',
    );
    expect(homeWordingProblem('References required')).toBe(
      "“References required” says who should live there, not what the home is like, so Gaff can't share it with renters. Describe the home instead, or leave it out.",
    );
  });
});

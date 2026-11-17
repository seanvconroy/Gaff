import { describe, expect, it } from 'vitest';
import {
  homeWordingProblem,
  homeWordingReason,
  homeWordingWhy,
  leftOutWhy,
  whoShouldApplyPhrase,
} from './who-should-apply';
import { lawfulVersion } from './lawful-version';

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
      "“References required” says who should live there, not what the home is like, so Gaff can't share it with renters. Gaff’s income rule, the same for everyone, and the checks on the person you choose do that job.",
    );
    expect(homeWordingProblem('A bright home near the sea, quiet tenants preferred')).toBe(
      "“quiet tenants” says who should live there, not what the home is like, so Gaff can't share it with renters. Describe the home instead, or leave it out.",
    );
  });
});

describe('UX-MT-4: an unlawful line is left out, and its lawful version offered where there is one', () => {
  it.each([
    ['Would suit a working couple', 'Did you mean “Up to 2 people”?'],
    ['College students only', 'Did you mean a move-in date and a length of stay?'],
    ['Non-smokers only', 'Did you mean “No smoking indoors”?'],
    ['Long-term tenants preferred', 'Did you mean “A year or longer”?'],
    ['A family home', 'Describe its bedrooms, its garden and what’s nearby.'],
    ['No HAP', 'HAP is accepted, and counts it as income.'],
    ['Professionals only', 'income rule, the same for everyone'],
  ])('UX-MT-4: “%s”', (line, instead) => {
    expect(homeWordingProblem(line)).toContain(instead);
    const reason = homeWordingReason(line)!.reason;
    expect(leftOutWhy(line, reason)).toContain(instead);
    expect(leftOutWhy(line, reason)).toContain(homeWordingWhy(reason));
  });

  it.each(['Mature tenants', 'Over 25s only', 'A quiet tenant wanted'])(
    'UX-MT-4: “%s” has no lawful version: it is left out, with why',
    (line) => {
      expect(lawfulVersion(line)).toBeNull();
      const reason = homeWordingReason(line)!.reason;
      expect(leftOutWhy(line, reason)).toBe(homeWordingWhy(reason));
    },
  );
});

import { describe, expect, it } from 'vitest';
import { berBand, berFromLettingRating, berLabel, berProblem, scaleForCertificate } from './ber';

describe('M40: BER on the right scale', () => {
  it('picks the scale from the certificate date', () => {
    expect(scaleForCertificate('2026-05-23')).toBe('previous');
    expect(scaleForCertificate('2026-05-24')).toBe('new');
  });

  it('accepts ratings on their own scale only', () => {
    expect(berProblem({ kind: 'rated', scale: 'previous', rating: 'C2' })).toBeNull();
    expect(berProblem({ kind: 'rated', scale: 'new', rating: 'B' })).toBeNull();
    expect(berProblem({ kind: 'rated', scale: 'new', rating: 'C2' })).toMatch(/A to G/);
    expect(berProblem({ kind: 'rated', scale: 'previous', rating: 'B' })).toMatch(/A1 to G/);
  });

  it('checks the BER number and that the date matches the scale', () => {
    expect(berProblem({ kind: 'rated', scale: 'previous', rating: 'C2', number: '12345' })).toMatch(
      /9 digits/,
    );
    expect(
      berProblem({ kind: 'rated', scale: 'previous', rating: 'C2', certificateDate: '2026-06-01' }),
    ).toMatch(/from 24 May 2026/);
  });

  it('M100: shows the rating, or "BER exempt"', () => {
    expect(berLabel({ kind: 'rated', scale: 'previous', rating: 'C2' })).toBe('BER C2');
    expect(berLabel({ kind: 'exempt', reason: 'protected_structure' })).toBe('BER exempt');
  });

  it('M58: compares homes by letter band across both scales', () => {
    expect(berBand({ kind: 'rated', scale: 'previous', rating: 'B3' })).toBe('B');
    expect(berBand({ kind: 'rated', scale: 'new', rating: 'B' })).toBe('B');
    expect(berBand({ kind: 'exempt', reason: 'other' })).toBeNull();
  });

  it('reads the workflow’s ratings', () => {
    expect(berFromLettingRating('A2')).toEqual({ kind: 'rated', scale: 'previous', rating: 'A2' });
    expect(berFromLettingRating('exempt')).toEqual({ kind: 'exempt', reason: 'other' });
  });
});

import { describe, expect, it } from 'vitest';
import { isValidPpsn, maskPpsn, ppsnSchema } from './ppsn';

describe('R24: the PPS number, for RTB registration only, and optional (Q24)', () => {
  it('checks the check letter, so a typo is caught', () => {
    expect(isValidPpsn('1234567T')).toBe(true);
    expect(isValidPpsn('1234567 t')).toBe(true);
    expect(isValidPpsn('1234567FA')).toBe(true);
    expect(isValidPpsn('1234567A')).toBe(false);
    expect(isValidPpsn('123456T')).toBe(false);
  });

  it('can be left blank, and is never shown in full outside the RTB pack', () => {
    expect(ppsnSchema.parse({ ppsn: '' })).toEqual({ ppsn: null });
    expect(ppsnSchema.parse({ ppsn: ' 1234567t ' })).toEqual({ ppsn: '1234567T' });
    expect(ppsnSchema.safeParse({ ppsn: '1234567A' }).error!.issues[0]!.message).toBe(
      'That PPS number doesn’t look right. Check it, or leave it blank.',
    );
    expect(maskPpsn('1234567T')).toBe('•••••67T');
  });
});

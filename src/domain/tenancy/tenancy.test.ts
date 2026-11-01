import { describe, expect, it } from 'vitest';
import {
  agreementHash,
  rentDueDay,
  rtbDeadline,
  signatureMatches,
  signatureSchema,
} from './tenancy';

describe('R22: signing the tenancy agreement', () => {
  it('takes a typed name that matches the person’s, ignoring case, spacing and accents', () => {
    expect(signatureMatches('  ciarán  ó súilleabháin ', 'Ciarán Ó Súilleabháin')).toBe(true);
    expect(signatureMatches('Ciaran O Suilleabhain', 'Ciarán Ó Súilleabháin')).toBe(true);
    expect(signatureMatches('Aoife Byrne', 'Ciarán Ó Súilleabháin')).toBe(false);
  });

  it('needs their name and their agreement to sign electronically', () => {
    const missing = signatureSchema.safeParse({ typedName: '', consent: '' });
    expect(missing.error!.issues.map((i) => i.message)).toEqual([
      'Type your full name to sign.',
      'Tick the box to sign electronically.',
    ]);
    expect(signatureSchema.parse({ typedName: ' Aoife Byrne ', consent: 'yes' })).toEqual({
      typedName: 'Aoife Byrne',
    });
  });

  it('fixes exactly what was sent for signing, so a change shows', () => {
    const a = agreementHash({ sections: [{ heading: 'Rent', paragraphs: ['€1,850 a month'] }] });
    const b = agreementHash({ sections: [{ heading: 'Rent', paragraphs: ['€1,950 a month'] }] });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('sets the rent day from the start date, never later than the 28th', () => {
    expect(rentDueDay('2026-12-01')).toBe(1);
    expect(rentDueDay('2026-12-15')).toBe(15);
    expect(rentDueDay('2026-12-31')).toBe(28);
  });
});

describe('R24: registering with the RTB', () => {
  it('is due within one month of the tenancy starting', () => {
    expect(rtbDeadline('2026-12-01')).toBe('2027-01-01');
    expect(rtbDeadline('2027-01-31')).toBe('2027-02-28');
  });
});

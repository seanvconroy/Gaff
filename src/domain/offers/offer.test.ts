import { describe, expect, it } from 'vitest';
import { offerTermsSchema, whoCanBeOffered } from './offer';

const rentCents = 185_000;

describe('R20: the offer’s terms', () => {
  it('caps the deposit at one month’s rent, and asks for nothing else (rule 4)', () => {
    const terms = offerTermsSchema(rentCents, '2026-11-02');
    expect(terms.parse({ deposit: '1,850', startDate: '2026-12-01', deadlineHours: '48' })).toEqual(
      {
        depositCents: 185_000,
        startDate: '2026-12-01',
        deadlineHours: 48,
        offerBackup: false,
        landlordConfirmed: false,
      },
    );
    const tooMuch = terms.safeParse({
      deposit: '2,000',
      startDate: '2026-12-01',
      deadlineHours: '48',
    });
    expect(tooMuch.error!.issues[0]!.message).toBe(
      'The deposit can’t be more than one month’s rent: €1,850.',
    );
  });

  it('needs a move-in date from today, and a time to answer from the fixed choices', () => {
    const terms = offerTermsSchema(rentCents, '2026-11-02');
    const result = terms.safeParse({
      deposit: '1850',
      startDate: '2026-11-01',
      deadlineHours: '5',
    });
    expect(result.error!.issues.map((i) => i.message)).toEqual([
      'Choose a move-in date from today on.',
      'Choose how long they have to answer.',
    ]);
  });
});

describe('R20, Q20: who can be offered the home, and when', () => {
  it('needs the landlord’s approval for each person, by link or confirmed by the operator', () => {
    expect(
      whoCanBeOffered({
        route: 'link',
        approval: { status: 'answered', preferredAnswer: 'approved', backupAnswer: 'declined' },
        landlordConfirmed: false,
        hasBackup: true,
      }),
    ).toEqual({ preferred: true, backup: false, problem: null });
    expect(
      whoCanBeOffered({ route: 'link', approval: null, landlordConfirmed: false, hasBackup: true }),
    ).toEqual({
      preferred: false,
      backup: false,
      problem: 'Ask the landlord to approve first.',
    });
    expect(
      whoCanBeOffered({
        route: 'link',
        approval: { status: 'answered', preferredAnswer: 'declined', backupAnswer: 'approved' },
        landlordConfirmed: false,
        hasBackup: true,
      }).problem,
    ).toBe('The landlord declined your preferred applicant. Choose again.');
    expect(
      whoCanBeOffered({
        route: 'operator_confirms',
        approval: null,
        landlordConfirmed: false,
        hasBackup: false,
      }).problem,
    ).toBe('Confirm that the landlord has approved.');
    expect(
      whoCanBeOffered({
        route: 'operator_confirms',
        approval: null,
        landlordConfirmed: true,
        hasBackup: true,
      }),
    ).toEqual({ preferred: true, backup: true, problem: null });
  });

  it('a landlord letting their own home approves by making the offer', () => {
    expect(
      whoCanBeOffered({
        route: 'own_home',
        approval: null,
        landlordConfirmed: false,
        hasBackup: true,
      }),
    ).toEqual({ preferred: true, backup: true, problem: null });
  });
});

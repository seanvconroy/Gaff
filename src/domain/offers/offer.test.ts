import { describe, expect, it } from 'vitest';
import { offerBlockers, offerTermsSchema, parseEuro, whoCanBeOffered } from './offer';

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
        withoutChecks: false,
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

describe('R20, Q20, Q22: who can be offered the home, and when', () => {
  const answered = (
    preferredAnswer: 'approved' | 'declined',
    backupAnswer: 'approved' | 'declined',
  ) => ({ status: 'answered', preferredAnswer, backupAnswer }) as const;

  it('needs the owner’s approval for each person, by link or recorded by the operator', () => {
    expect(
      whoCanBeOffered({
        route: 'link',
        approval: answered('approved', 'declined'),
        hasBackup: true,
      }),
    ).toEqual({ preferred: true, backup: false, problem: null });
    expect(whoCanBeOffered({ route: 'link', approval: null, hasBackup: true })).toEqual({
      preferred: false,
      backup: false,
      problem: 'Ask the owner to approve first.',
    });
    expect(
      whoCanBeOffered({
        route: 'link',
        approval: { status: 'requested', preferredAnswer: null, backupAnswer: null },
        hasBackup: true,
      }).problem,
    ).toBe('Wait for the owner’s answer first.');
    expect(
      whoCanBeOffered({
        route: 'link',
        approval: answered('declined', 'approved'),
        hasBackup: true,
      }).problem,
    ).toBe('The owner declined your preferred applicant. Choose again.');
    // Q22: with no email for the owner, the operator records that the owner approved.
    expect(
      whoCanBeOffered({ route: 'operator_confirms', approval: null, hasBackup: false }).preferred,
    ).toBe(false);
    expect(
      whoCanBeOffered({
        route: 'operator_confirms',
        approval: answered('approved', 'approved'),
        hasBackup: true,
      }),
    ).toEqual({ preferred: true, backup: true, problem: null });
  });

  it('a landlord letting their own home approves by making the offer', () => {
    expect(whoCanBeOffered({ route: 'own_home', approval: null, hasBackup: true })).toEqual({
      preferred: true,
      backup: true,
      problem: null,
    });
  });
});

describe('UX-DC-18: the deposit as it is typed (rule 4)', () => {
  it.each([
    ['1,850', 185_000],
    ['1850', 185_000],
    ['€1,850', 185_000],
    ['€ 1,850.00', 185_000],
    [' 1849.5 ', 184_950],
  ])('reads %s', (typed, cents) => {
    expect(parseEuro(typed)).toBe(cents);
  });

  it.each(['', 'one month', '1.850,00', '18,50', '-100'])('refuses %s', (typed) => {
    expect(parseEuro(typed)).toBeNull();
  });

  it('accepts a month’s rent typed with a euro sign and a comma, and never more', () => {
    const terms = offerTermsSchema(rentCents, '2026-11-02');
    const fine = { startDate: '2026-12-01', deadlineHours: '48' };
    expect(terms.parse({ ...fine, deposit: '€1,850' }).depositCents).toBe(185_000);
    expect(terms.safeParse({ ...fine, deposit: '€1,850.01' }).success).toBe(false);
  });
});

describe('UX-DC-19: what the offer waits for', () => {
  const ready = {
    route: 'link' as const,
    approval: { status: 'answered', preferredAnswer: 'approved', backupAnswer: null } as const,
    hasBackup: false,
    comparables: 3,
    checks: [{ status: 'passed' }, { status: 'answered' }],
    withoutChecks: false,
  };

  it('nothing, once the owner approved, three rents are in and the checks are back', () => {
    expect(offerBlockers(ready)).toEqual([]);
  });

  it('names each thing missing', () => {
    expect(
      offerBlockers({
        ...ready,
        approval: null,
        comparables: 1,
        checks: [{ status: 'passed' }, { status: 'in_progress' }, { status: 'to_do' }],
      }),
    ).toEqual([
      { code: 'owner', standing: 'ask' },
      { code: 'comparables', recorded: 1 },
      { code: 'checks', waiting: 2 },
    ]);
    expect(
      offerBlockers({
        ...ready,
        approval: { status: 'requested', preferredAnswer: null, backupAnswer: null },
      }),
    ).toEqual([{ code: 'owner', standing: 'waiting' }]);
  });

  it('lets the person go ahead without the checks, as their own choice', () => {
    expect(
      offerBlockers({ ...ready, checks: [{ status: 'in_progress' }], withoutChecks: true }),
    ).toEqual([]);
  });

  it('asks no owner of a landlord letting their own home, but still needs the rents', () => {
    expect(offerBlockers({ ...ready, route: 'own_home', approval: null, comparables: 0 })).toEqual([
      { code: 'comparables', recorded: 0 },
    ]);
  });
});

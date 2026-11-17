import { describe, expect, it } from 'vitest';
import {
  cleanAnswers,
  detailsToKeep,
  keptAnswersSchema,
  keptDetailsSchema,
  keptIncomeSchema,
  mergeKept,
  NOTHING_KEPT,
  partsKept,
  withoutPart,
  type EnteredOnApplication,
} from './kept';

const at = (iso: string) => new Date(iso);

const application: EnteredOnApplication = {
  phone: '087 123 4567',
  smsReminders: true,
  answers: { occupants: 2, hasPets: false, moveInDate: '2026-12-13', stayMonths: 12 },
  answersAt: at('2026-11-01T10:00:00Z'),
  earning: 'employed',
  monthlyIncomeCents: 520_000,
  appliedAt: at('2026-11-10T19:00:00Z'),
};

describe('UX-PF-4: what a profile may hold', () => {
  it('UX-PF-4: the fixed four answers, how they earn, an income and a mobile number', () => {
    expect(
      keptDetailsSchema.safeParse({
        mobile: '087 123 4567',
        answers: { occupants: 2, hasPets: false, moveInDate: '2026-12-13', stayMonths: 12 },
        income: { earning: 'employed', monthlyIncomeCents: 520_000 },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a photo', { photo: 'me.jpg' }],
    ['a description of themselves', { about: 'Quiet professional couple' }],
    ['a date of birth', { dateOfBirth: '1990-01-01' }],
    ['a nationality', { nationality: 'Irish' }],
    ['whether they receive housing support', { hap: true }],
    ['a document', { payslip: 'payslip.pdf' }],
    ['a reference', { reference: 'A great tenant' }],
  ])('UX-PF-4, rule 3: %s has nowhere to go', (_what, extra) => {
    expect(keptDetailsSchema.safeParse({ ...extra }).success).toBe(false);
    expect(keptAnswersSchema.safeParse({ occupants: 2, ...extra }).success).toBe(false);
    expect(
      keptIncomeSchema.safeParse({ earning: 'employed', monthlyIncomeCents: 1, ...extra }).success,
    ).toBe(false);
  });

  it('rule 3: how someone earns is one of three codes, with nowhere to say more', () => {
    for (const earning of ['employed', 'self_employed', 'other']) {
      expect(keptIncomeSchema.safeParse({ earning, monthlyIncomeCents: 320_000 }).success).toBe(
        true,
      );
    }
    for (const earning of ['hap', 'social_welfare', 'On HAP since 2022']) {
      expect(keptIncomeSchema.safeParse({ earning, monthlyIncomeCents: 320_000 }).success).toBe(
        false,
      );
    }
  });

  it('UX-PF-4: a mobile number is a number, never a note', () => {
    expect(keptDetailsSchema.safeParse({ mobile: '+353 87 123 4567' }).success).toBe(true);
    expect(keptDetailsSchema.safeParse({ mobile: 'ring my mam after 6' }).success).toBe(false);
  });
});

describe('UX-PF-2: what is kept from an application', () => {
  it('UX-PF-2: their answers, their income with its date, and the mobile they gave', () => {
    expect(detailsToKeep(application)).toEqual({
      mobile: '087 123 4567',
      answers: {
        values: { occupants: 2, hasPets: false, moveInDate: '2026-12-13', stayMonths: 12 },
        at: at('2026-11-01T10:00:00Z'),
      },
      income: {
        earning: 'employed',
        monthlyIncomeCents: 520_000,
        at: at('2026-11-10T19:00:00Z'),
      },
    });
  });

  it('Q12: a number that came with the enquiry was never theirs to reuse', () => {
    expect(detailsToKeep({ ...application, smsReminders: false }).mobile).toBeUndefined();
  });

  it('rule 2: income is kept only once they have applied', () => {
    expect(detailsToKeep({ ...application, appliedAt: null }).income).toBeUndefined();
    expect(
      detailsToKeep({ ...application, earning: null, monthlyIncomeCents: null }).income,
    ).toBeUndefined();
  });

  it('UX-PF-4: anything else on the answers is left behind', () => {
    expect(
      cleanAnswers({ occupants: 2, note: 'two adults and a baby', hasPets: 'a small dog' }),
    ).toEqual({ occupants: 2 });
    expect(detailsToKeep({ ...application, answers: null }).answers).toBeUndefined();
  });

  it('a length of stay kept under older choices becomes one of today’s three', () => {
    expect(cleanAnswers({ stayMonths: 24 })).toEqual({ stayMonths: 36 });
    expect(cleanAnswers({ stayMonths: 6 })).toEqual({ stayMonths: 6 });
  });
});

describe('UX-PF-2: keeping, changing and removing', () => {
  it('UX-PF-2: a newer answer replaces the older one; other answers stay', () => {
    const first = mergeKept(NOTHING_KEPT, detailsToKeep(application));
    const second = mergeKept(first, {
      answers: { values: { occupants: 3 }, at: at('2027-01-05T10:00:00Z') },
    });
    expect(second.answers).toEqual({
      occupants: 3,
      hasPets: false,
      moveInDate: '2026-12-13',
      stayMonths: 12,
    });
    expect(second.answersAt).toEqual(at('2027-01-05T10:00:00Z'));
    expect(second.monthlyIncomeCents).toBe(520_000);
    expect(second.mobile).toBe('087 123 4567');
  });

  it('UX-PF-5: a new income replaces the old one, with its own date', () => {
    const first = mergeKept(NOTHING_KEPT, detailsToKeep(application));
    const second = mergeKept(first, {
      income: {
        earning: 'self_employed',
        monthlyIncomeCents: 480_000,
        at: at('2027-02-01T09:00:00Z'),
      },
    });
    expect(second).toMatchObject({
      earning: 'self_employed',
      monthlyIncomeCents: 480_000,
      incomeAt: at('2027-02-01T09:00:00Z'),
    });
  });

  it('each part can be taken off on its own', () => {
    const kept = mergeKept(NOTHING_KEPT, detailsToKeep(application));
    expect(partsKept(kept)).toEqual(['mobile', 'answers', 'income']);
    expect(partsKept(withoutPart(kept, 'income'))).toEqual(['mobile', 'answers']);
    expect(partsKept(withoutPart(kept, 'answers'))).toEqual(['mobile', 'income']);
    expect(partsKept(withoutPart(kept, 'mobile'))).toEqual(['answers', 'income']);
    expect(withoutPart(kept, 'income')).toMatchObject({
      earning: null,
      monthlyIncomeCents: null,
      incomeAt: null,
    });
    expect(partsKept(NOTHING_KEPT)).toEqual([]);
  });
});

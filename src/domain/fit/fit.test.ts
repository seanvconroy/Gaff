import { describe, expect, it } from 'vitest';
import { answersBesideDetails, criterionCost, fitDetail, poolSummary } from '@/copy/fit';
import type { RenterAnswers } from '@/domain/criteria/answers';
import type { Criteria } from '@/domain/criteria/criteria';
import { mostCommonMiss, poolCounts } from './fit';

const now = new Date('2026-11-17T12:00:00Z');
const criteria: Criteria = {
  moveInBy: '2026-12-13',
  minStayMonths: 12,
  maxOccupants: 3,
  noPets: true,
};
const fits: RenterAnswers = {
  moveInDate: '2026-12-13',
  stayMonths: 12,
  occupants: 2,
  hasPets: false,
};
const answered = (answers: Partial<RenterAnswers>) => ({
  answers: { ...fits, ...answers },
  answered: true,
});

describe('UX-MT-11: the renter’s answers beside the letting details, without judgement', () => {
  it('UX-MT-11: “You said: 4 people. This home is for up to 3.”', () => {
    expect(answersBesideDetails({ maxOccupants: 3, noPets: false }, { occupants: 4 }, now)).toEqual(
      ['You said: 4 people. This home is for up to 3.'],
    );
  });

  it('UX-MT-11: every answer, in the letting details’ order, the same shape met or not', () => {
    expect(
      answersBesideDetails(
        criteria,
        { moveInDate: '2027-01-08', stayMonths: 6, occupants: 1, hasPets: true },
        now,
      ),
    ).toEqual([
      'You said: from Friday 8 January 2027. This home is for moving in by Sunday 13 December.',
      'You said: under a year. This home is for a year or longer.',
      'You said: just you. This home is for up to 3.',
      'You said: you have pets. This home doesn’t take pets. Assistance dogs are always welcome.',
    ]);
    expect(answersBesideDetails(criteria, fits, now)).toEqual([
      'You said: you could move in by Sunday 13 December. This home is for moving in by Sunday 13 December.',
      'You said: a year. This home is for a year or longer.',
      'You said: 2 people. This home is for up to 3.',
      'You said: no pets. This home doesn’t take pets. Assistance dogs are always welcome.',
    ]);
  });

  it('UX-MT-11, rule 1: it never says they don’t qualify, and never judges', () => {
    const lines = answersBesideDetails(
      criteria,
      { moveInDate: '2027-03-01', stayMonths: 6, occupants: 6, hasPets: true },
      now,
    ).join(' ');
    expect(lines).not.toMatch(
      /qualif|eligib|reject|unsuitab|sorry|unfortunately|can’t|cannot|not meet|doesn’t meet|fail/i,
    );
  });
});

describe('UX-MT-6: fit is a count with words, and the detail is each criterion and the answer', () => {
  it('UX-MT-6: each criterion in the letting details’ words, the answer, and whether it meets it', () => {
    expect(fitDetail(criteria, { ...fits, occupants: 4 }, now)).toEqual([
      { label: 'Move in by Sunday 13 December', value: 'Said by Sunday 13 December. Meets this.' },
      { label: 'A year or longer', value: 'Said a year. Meets this.' },
      { label: 'Up to 3 people', value: 'Said 4 people. Doesn’t meet this.' },
      {
        label: 'No pets (assistance dogs always welcome)',
        value: 'Said no pets. Meets this.',
      },
    ]);
  });

  it('UX-MT-6: never a score, a percentage or a star', () => {
    const words = JSON.stringify(fitDetail(criteria, { occupants: 9 }, now));
    expect(words).not.toMatch(/%|score|star|★|points|rating|\/10/i);
    expect(words).toContain('Not answered');
  });
});

describe('UX-MT-7, UX-MT-9: the pool summary is written from counts of answers only', () => {
  const pool = [
    answered({}),
    answered({}),
    answered({ moveInDate: '2027-01-08' }),
    answered({ moveInDate: '2027-02-01' }),
    answered({ moveInDate: '2027-02-01', hasPets: true }),
    answered({ occupants: 4 }),
    { answers: null, answered: false },
  ];

  it('UX-MT-7: counts who’s answered, who meets everything, and what is missed', () => {
    const counts = poolCounts(criteria, pool);
    expect(counts).toEqual({
      answered: 6,
      meetEverything: 2,
      costs: [
        { key: 'move_in', missing: 3, onlyThis: 2 },
        { key: 'stay', missing: 0, onlyThis: 0 },
        { key: 'occupants', missing: 1, onlyThis: 1 },
        { key: 'pets', missing: 1, onlyThis: 0 },
      ],
    });
    expect(mostCommonMiss(counts)?.key).toBe('move_in');
  });

  it('UX-MT-7: one sentence that names criteria and never people', () => {
    expect(poolSummary(criteria, poolCounts(criteria, pool), now)).toBe(
      'Of 6 people who’ve answered, 2 meet everything. The most common miss is the move-in date: 3 need later than Sunday 13 December.',
    );
    expect(poolSummary(criteria, poolCounts(criteria, [answered({})]), now)).toBe(
      'Of 1 person who’s answered, 1 meets everything.',
    );
  });

  it('UX-MT-7: nothing to sum up when nothing was asked or nobody has answered', () => {
    expect(poolSummary({ noPets: false }, poolCounts({ noPets: false }, pool), now)).toBeNull();
    expect(
      poolSummary(criteria, poolCounts(criteria, [{ answers: null, answered: false }]), now),
    ).toBeNull();
  });

  it('UX-MT-9: what each criterion is costing: how many miss it, and how many more would meet everything', () => {
    const counts = poolCounts(criteria, pool);
    expect(counts.costs.map((cost) => criterionCost(criteria, cost, now))).toEqual([
      {
        label: 'Move in by Sunday 13 December',
        value: '3 need later than Sunday 13 December. Without it, 2 more would meet everything.',
      },
      { label: 'A year or longer', value: 'Everyone who’s answered meets this.' },
      {
        label: 'Up to 3 people',
        value: '1 is more than 3 people. Without it, 1 more would meet everything.',
      },
      {
        label: 'No pets (assistance dogs always welcome)',
        value: '1 has pets. Without it, nobody more would meet everything.',
      },
    ]);
  });
});

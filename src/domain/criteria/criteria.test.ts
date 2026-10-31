import { describe, expect, it } from 'vitest';
import {
  countCriteria,
  criteriaFormSchema,
  criteriaSchema,
  describeCriteria,
  questionsFor,
} from './criteria';

const now = new Date('2026-10-31T12:00:00Z');

describe('R2: criteria come from a fixed list of lawful options', () => {
  it('reads the four criteria from the form', () => {
    const criteria = criteriaFormSchema(now).parse({
      moveInBy: '2026-12-01',
      minStayMonths: '12',
      maxOccupants: '3',
      pets: 'no_pets',
    });
    expect(criteria).toEqual({
      moveInBy: '2026-12-01',
      minStayMonths: 12,
      maxOccupants: 3,
      noPets: true,
    });
  });

  it('treats blank fields as no criterion at all', () => {
    const criteria = criteriaFormSchema(now).parse({
      moveInBy: '',
      minStayMonths: '',
      maxOccupants: '',
      pets: 'considered',
    });
    expect(criteria).toEqual({ noPets: false });
    expect(countCriteria(criteria)).toBe(0);
  });

  it('has no way to store a free-text criterion', () => {
    expect(criteriaSchema.safeParse({ noPets: false, other: 'Professionals only' }).success).toBe(
      false,
    );
    expect(criteriaSchema.safeParse({ noPets: false, maxOccupants: 'two adults' }).success).toBe(
      false,
    );
  });

  it('ignores anything else sent with the form', () => {
    const criteria = criteriaFormSchema(now).parse({
      pets: 'considered',
      nationality: 'Irish',
      familyStatus: 'no children',
    });
    expect(Object.keys(criteria)).toEqual(['noPets']);
  });

  it.each([
    [{ moveInBy: '2026-10-01', pets: 'considered' }, 'can’t be in the past'],
    [{ minStayMonths: '9', pets: 'considered' }, 'lengths of stay'],
    [{ maxOccupants: '0', pets: 'considered' }, 'from 1 to 10'],
    [{ maxOccupants: '11', pets: 'considered' }, 'from 1 to 10'],
    [{}, 'whether pets are considered'],
  ])('explains a problem: %o', (input, message) => {
    const result = criteriaFormSchema(now).safeParse(input);
    expect(result.error?.issues[0]?.message).toContain(message);
  });

  it('describes the criteria in plain words, with assistance dogs always welcome', () => {
    expect(
      describeCriteria(
        { moveInBy: '2026-12-01', minStayMonths: 24, maxOccupants: 1, noPets: true },
        now,
      ),
    ).toEqual([
      'Can move in by Tuesday 1 December',
      'Plans to stay at least 2 years',
      'Up to 1 person',
      'No pets (assistance dogs are always welcome)',
    ]);
  });

  it('R9: asks renters only the questions the criteria need (data minimisation)', () => {
    expect(questionsFor({ noPets: false })).toEqual([]);
    expect(questionsFor({ maxOccupants: 3, noPets: true })).toEqual(['occupants', 'hasPets']);
    expect(
      questionsFor({ moveInBy: '2026-12-01', minStayMonths: 12, maxOccupants: 2, noPets: true }),
    ).toEqual(['moveInDate', 'stayMonths', 'occupants', 'hasPets']);
  });
});

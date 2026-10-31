import { describe, expect, it } from 'vitest';
import { renterAnswersSchema } from './answers';

const now = new Date('2026-10-31T12:00:00Z');
const all = { moveInBy: '2026-12-01', minStayMonths: 12 as const, maxOccupants: 3, noPets: true };

describe('R9: the renter’s answers', () => {
  it('reads answers to every question the criteria need', () => {
    expect(
      renterAnswersSchema(all, now).parse({
        moveInDate: '2026-11-20',
        stayMonths: '24',
        occupants: '2',
        hasPets: 'no',
      }),
    ).toEqual({ moveInDate: '2026-11-20', stayMonths: 24, occupants: 2, hasPets: false });
  });

  it('keeps only answers to questions it asked, whatever else is sent (data minimisation)', () => {
    expect(
      renterAnswersSchema({ maxOccupants: 3, noPets: false }, now).parse({
        occupants: '2',
        hasPets: 'yes',
        moveInDate: '2026-11-20',
        nationality: 'Irish',
      }),
    ).toEqual({ occupants: 2 });
  });

  it('asks nothing when there are no criteria', () => {
    expect(renterAnswersSchema({ noPets: false }, now).parse({})).toEqual({});
  });

  it.each([
    [{ stayMonths: '24', occupants: '2', hasPets: 'no' }, 'Enter the date you could move in'],
    [
      { moveInDate: '2026-10-01', stayMonths: '24', occupants: '2', hasPets: 'no' },
      'between today and a year',
    ],
    [
      { moveInDate: '2026-11-20', stayMonths: '7', occupants: '2', hasPets: 'no' },
      'how long you’d like to stay',
    ],
    [
      { moveInDate: '2026-11-20', stayMonths: '24', occupants: '0', hasPets: 'no' },
      'how many people',
    ],
    [{ moveInDate: '2026-11-20', stayMonths: '24', occupants: '2' }, 'whether you have any pets'],
  ])('explains a missing or wrong answer kindly: %o', (input, message) => {
    const result = renterAnswersSchema(all, now).safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(' ')).toContain(message);
  });
});

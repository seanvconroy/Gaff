import { describe, expect, it } from 'vitest';
import {
  answersAsValues,
  answersInWords,
  readAnswer,
  renterAnswersSchema,
  stayChoices,
  stayLabel,
} from './answers';

const now = new Date('2026-10-31T12:00:00Z');
const all = { moveInBy: '2026-12-01', minStayMonths: 12 as const, maxOccupants: 3, noPets: true };

describe('R9: the renter’s answers', () => {
  it('reads answers to every question the criteria need', () => {
    expect(
      renterAnswersSchema(all, now).parse({
        moveInDate: '2026-11-20',
        stayMonths: '36',
        occupants: '2',
        hasPets: 'no',
      }),
    ).toEqual({ moveInDate: '2026-11-20', stayMonths: 36, occupants: 2, hasPets: false });
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
    [{ stayMonths: '36', occupants: '2', hasPets: 'no' }, 'whether you could move in by then'],
    [
      { canMoveIn: 'later', stayMonths: '36', occupants: '2', hasPets: 'no' },
      'Choose the date you could move in',
    ],
    [
      { moveInDate: '2026-10-01', stayMonths: '36', occupants: '2', hasPets: 'no' },
      'between today and a year',
    ],
    [
      { moveInDate: '2026-11-20', stayMonths: '7', occupants: '2', hasPets: 'no' },
      'how long you’d like to stay',
    ],
    [
      { moveInDate: '2026-11-20', stayMonths: '36', occupants: '0', hasPets: 'no' },
      'how many people',
    ],
    [
      { moveInDate: '2026-11-20', stayMonths: '36', occupants: 'more', hasPets: 'no' },
      'Enter how many people, from 6 to 12',
    ],
    [{ moveInDate: '2026-11-20', stayMonths: '36', occupants: '2' }, 'whether you have any pets'],
  ])('explains a missing or wrong answer kindly: %o', (input, message) => {
    const result = renterAnswersSchema(all, now).safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(' ')).toContain(message);
  });
});

describe('UX-RN-2: each question is answered with taps', () => {
  it('“Could you move in by…?” Yes is kept as the date that was asked about, whatever the form sends', () => {
    expect(
      readAnswer('moveInDate', { canMoveIn: 'yes', moveInDate: '2027-06-01' }, all, now),
    ).toEqual({ ok: true, answer: { moveInDate: '2026-12-01' } });
  });

  it('“No, I’d need later” asks for a date, and keeps it', () => {
    expect(readAnswer('moveInDate', { canMoveIn: 'later' }, all, now)).toMatchObject({
      ok: false,
      field: 'moveInDate',
    });
    expect(
      readAnswer('moveInDate', { canMoveIn: 'later', moveInDate: '2027-01-10' }, all, now),
    ).toEqual({ ok: true, answer: { moveInDate: '2027-01-10' } });
  });

  it('the number buttons give 1 to 5; “6 or more” asks for the number, so the answer is exact', () => {
    expect(readAnswer('occupants', { occupants: '4' }, all, now)).toEqual({
      ok: true,
      answer: { occupants: 4 },
    });
    expect(readAnswer('occupants', { occupants: 'more' }, all, now)).toMatchObject({
      ok: false,
      field: 'occupantsMore',
    });
    expect(
      readAnswer('occupants', { occupants: 'more', occupantsMore: '5' }, all, now),
    ).toMatchObject({ ok: false, field: 'occupantsMore' });
    expect(readAnswer('occupants', { occupants: 'more', occupantsMore: '7' }, all, now)).toEqual({
      ok: true,
      answer: { occupants: 7 },
    });
  });

  it('“How long would you like to stay?” has three answers: under a year, a year, longer', () => {
    expect(stayChoices.map((c) => c.label)).toEqual(['Under a year', 'A year', 'Longer']);
    expect(readAnswer('stayMonths', { stayMonths: '12' }, all, now)).toEqual({
      ok: true,
      answer: { stayMonths: 12 },
    });
    expect(stayLabel(3)).toBe('Under a year');
    expect(stayLabel(12)).toBe('A year');
    expect(stayLabel(24)).toBe('Longer than a year');
  });

  it('UX-RN-4 (rule 1): no answer is refused for what it says. Pets, nine people, a later date: all kept', () => {
    expect(
      renterAnswersSchema(all, now).safeParse({
        canMoveIn: 'later',
        moveInDate: '2027-03-01',
        stayMonths: '6',
        occupants: 'more',
        occupantsMore: '9',
        hasPets: 'yes',
      }),
    ).toMatchObject({
      success: true,
      data: { moveInDate: '2027-03-01', stayMonths: 6, occupants: 9, hasPets: true },
    });
  });

  it('answers already given come back as the taps that made them, for “Change my answers”', () => {
    expect(
      answersAsValues(
        { moveInDate: '2026-12-01', stayMonths: 24, occupants: 7, hasPets: false },
        all,
      ),
    ).toEqual({
      canMoveIn: 'yes',
      stayMonths: '36',
      occupants: 'more',
      occupantsMore: '7',
      hasPets: 'no',
    });
    expect(answersAsValues({ moveInDate: '2027-01-10', occupants: 2 }, all)).toEqual({
      canMoveIn: 'later',
      moveInDate: '2027-01-10',
      occupants: '2',
    });
    expect(answersAsValues(null, all)).toEqual({});
  });

  it('says the answers back in plain words, with no judgement of them', () => {
    expect(
      answersInWords(
        { moveInDate: '2026-12-01', stayMonths: 12, occupants: 1, hasPets: true },
        (date) => `<${date}>`,
      ).map((row) => `${row.label}: ${row.value}`),
    ).toEqual(['Move in: By <2026-12-01>', 'Stay: A year', 'People: Just me', 'Pets: Yes']);
  });
});

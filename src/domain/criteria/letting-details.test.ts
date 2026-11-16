import { describe, expect, it } from 'vitest';
import { lettingDetailsFormSchema, lettingDetailsLine, questionsFor } from './criteria';

const now = new Date('2026-11-16T12:00:00Z');
const schema = lettingDetailsFormSchema(now);

describe('UX-LT-11: letting details offer only the four fixed criteria', () => {
  it('UX-LT-11: every row is off until tapped: nothing tapped asks nothing', () => {
    expect(schema.parse({})).toEqual({ criteria: { noPets: false }, noSmokingIndoors: false });
  });

  it('UX-LT-11: a row that is on gives one value', () => {
    expect(
      schema.parse({
        moveInOn: 'on',
        moveInBy: '2026-12-13',
        stayOn: 'on',
        minStayMonths: '12',
        peopleOn: 'on',
        maxOccupants: '3',
        noPets: 'on',
        noSmokingIndoors: 'on',
      }),
    ).toEqual({
      criteria: { moveInBy: '2026-12-13', minStayMonths: 12, maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
  });

  it('UX-LT-11: a row that is off asks nothing, whatever its field still holds', () => {
    expect(
      schema.parse({ moveInBy: '2026-12-13', minStayMonths: '12', maxOccupants: '3' }),
    ).toEqual({ criteria: { noPets: false }, noSmokingIndoors: false });
  });

  it.each([
    [{ moveInOn: 'on' }, 'moveInBy', 'Choose the latest move-in date, or switch this off'],
    [
      { moveInOn: 'on', moveInBy: '2026-11-01' },
      'moveInBy',
      'The move-in date can’t be in the past',
    ],
    [{ stayOn: 'on' }, 'minStayMonths', 'Choose a length of stay, or switch this off'],
    [{ stayOn: 'on', minStayMonths: '9' }, 'minStayMonths', 'Choose a length of stay'],
    [{ peopleOn: 'on' }, 'maxOccupants', 'Choose a number from 1 to 10, or switch this off'],
    [{ peopleOn: 'on', maxOccupants: '11' }, 'maxOccupants', 'from 1 to 10'],
  ])('UX-FL-3: a row that is on with no value says so at that row: %o', (input, field, message) => {
    const result = schema.safeParse(input);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual([field]);
    expect(result.error?.issues[0]?.message).toContain(message);
  });

  it('rule 3: there is no free text: anything else sent with the form is ignored', () => {
    const parsed = schema.parse({
      noPets: 'on',
      idealTenant: 'A working couple',
      whoItSuits: 'Professionals',
      nationality: 'Irish',
    });
    expect(parsed).toEqual({ criteria: { noPets: true }, noSmokingIndoors: false });
    expect(JSON.stringify(parsed)).not.toMatch(/couple|Professionals|Irish/);
  });

  it('UX-MT-5: the house rule is not a criterion: it asks renters nothing and ranks nobody', () => {
    const { criteria, noSmokingIndoors } = schema.parse({ noSmokingIndoors: 'on' });
    expect(noSmokingIndoors).toBe(true);
    expect(criteria).toEqual({ noPets: false });
    expect(questionsFor(criteria)).toEqual([]);
  });
});

describe('UX-MT-3: Gaff writes the line renters see', () => {
  it('UX-MT-3: in fixed wording, from the four criteria and the house rule', () => {
    expect(
      lettingDetailsLine(
        { moveInBy: '2026-12-13', minStayMonths: 12, maxOccupants: 3, noPets: true },
        true,
        now,
      ),
    ).toBe(
      'Move in by Sunday 13 December · A year or longer · Up to 3 people · No pets (assistance dogs always welcome) · No smoking indoors',
    );
  });

  it('rule 3: wherever pets are mentioned, assistance dogs are always welcome', () => {
    expect(lettingDetailsLine({ noPets: true }, false, now)).toBe(
      'No pets (assistance dogs always welcome)',
    );
  });

  it('UX-MT-3: each length of stay reads as a length or longer', () => {
    expect(lettingDetailsLine({ minStayMonths: 6, noPets: false }, false, now)).toBe(
      '6 months or longer',
    );
    expect(lettingDetailsLine({ minStayMonths: 24, noPets: false }, false, now)).toBe(
      '2 years or longer',
    );
    expect(lettingDetailsLine({ maxOccupants: 1, noPets: false }, false, now)).toBe(
      'Up to 1 person',
    );
  });

  it('UX-LT-11: nothing asked is no line at all', () => {
    expect(lettingDetailsLine({ noPets: false }, false, now)).toBeNull();
    expect(lettingDetailsLine(null, false, now)).toBeNull();
    expect(lettingDetailsLine(null, true, now)).toBe('No smoking indoors');
  });

  it('rule 3: the line never says who a home would suit', () => {
    const line = lettingDetailsLine(
      { moveInBy: '2026-12-13', minStayMonths: 12, maxOccupants: 2, noPets: true },
      true,
      now,
    );
    expect(line).not.toMatch(/suit|ideal|professional|couple|family|student/i);
  });
});

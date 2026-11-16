import { describe, expect, it } from 'vitest';
import {
  checkRent,
  rentAnswersFromCheck,
  rentAnswersFromLastTime,
  rentCheckFormSchema,
  rentQuestionProblems,
  rentQuestions,
} from './rent-check';

const today = '2026-11-16';
const schema = rentCheckFormSchema(today);

describe('UX-LT-12: the rent check, one question per screen', () => {
  it('UX-LT-12: it starts with one question, and a first letting is one tap', () => {
    expect(rentQuestions({})).toEqual(['lastLet']);
    expect(rentQuestions({ lastLet: 'never' })).toEqual(['lastLet']);
    expect(schema.parse({ lastLet: 'never' })).toEqual({ lastLet: 'never' });
  });

  it('UX-LT-12: how the tenancy ended is asked only where it changes the answer', () => {
    expect(rentQuestions({ lastLet: 'under_new_rules' })).toEqual([
      'lastLet',
      'ending',
      'previousRent',
    ]);
    expect(rentQuestions({ lastLet: 'before_new_rules' })).not.toContain('ending');
  });

  it('UX-LT-12: a substantial change is asked only of a tenancy from before the new rules', () => {
    expect(rentQuestions({ lastLet: 'before_new_rules' })).toEqual([
      'lastLet',
      'substantialChange',
      'previousRent',
    ]);
    expect(rentQuestions({ lastLet: 'under_new_rules' })).not.toContain('substantialChange');
  });

  it('UX-LT-12: nobody answers more than three questions, and none asks the rent again', () => {
    for (const lastLet of ['never', 'before_new_rules', 'under_new_rules']) {
      const questions = rentQuestions({ lastLet });
      expect(questions.length).toBeLessThanOrEqual(3);
      expect(questions).not.toContain('askingRent');
    }
    // A rent sent with the answers is not read: the letting's own rent is what's checked.
    expect(schema.parse({ lastLet: 'never', askingRent: '9,999' })).toEqual({ lastLet: 'never' });
  });

  it('UX-LT-12: a tenancy under the new rules needs no answer about substantial change', () => {
    const input = schema.parse({
      lastLet: 'under_new_rules',
      ending: 'tenant_left',
      previousRent: '1,700',
      previousRentSetOn: '2026-05-01',
    });
    expect(input).toEqual({
      lastLet: 'under_new_rules',
      ending: 'tenant_left',
      previousRentCents: 170_000,
      previousRentSetOn: '2026-05-01',
    });
    expect(checkRent(input)).toEqual({ result: 'market', reason: 'tenant_ended' });
  });

  it('UX-LT-12: a tenancy from before the new rules needs no answer about how it ended', () => {
    const input = schema.parse({
      lastLet: 'before_new_rules',
      substantialChange: 'no',
      previousRent: '1,700',
      previousRentSetOn: '2025-10-31',
    });
    expect(input).toEqual({
      lastLet: 'before_new_rules',
      substantialChange: false,
      previousRentCents: 170_000,
      previousRentSetOn: '2025-10-31',
    });
    expect(checkRent(input)).toEqual({ result: 'capped', reason: 'tenancy_before_new_rules' });
  });

  it('UX-LT-12: an answer to a question that no longer applies is ignored', () => {
    // They said "under the new rules", answered how it ended, then went back and changed it.
    const input = schema.parse({
      lastLet: 'never',
      ending: 'landlord_other',
      previousRent: '1,700',
    });
    expect(input).toEqual({ lastLet: 'never' });
  });

  it('UX-FL-3: each screen is held only to its own fields', () => {
    const answers = { lastLet: 'under_new_rules' };
    expect(rentQuestionProblems('lastLet', answers, today)).toEqual({});
    expect(rentQuestionProblems('ending', answers, today)).toEqual({
      ending: 'Choose how the last tenancy ended',
    });
    expect(rentQuestionProblems('previousRent', answers, today)).toEqual({
      previousRent: 'Enter the last monthly rent in euro, like 1,700',
      previousRentSetOn: 'Choose the date the last rent was set. It can’t be in the future.',
    });
    expect(rentQuestionProblems('lastLet', {}, today)).toEqual({
      lastLet: 'Choose whether the home has been let before, and when',
    });
  });
});

describe('UX-LT-23: the rent check starts filled in from last time', () => {
  it('UX-LT-23: the last rent and the day that tenancy began, under the rules of its day', () => {
    expect(rentAnswersFromLastTime({ rentCents: 185_000, tenancyStartedOn: '2026-06-01' })).toEqual(
      { lastLet: 'under_new_rules', previousRent: '1,850', previousRentSetOn: '2026-06-01' },
    );
    expect(
      rentAnswersFromLastTime({ rentCents: 170_050, tenancyStartedOn: '2025-09-01' }),
    ).toEqual({
      lastLet: 'before_new_rules',
      previousRent: '1,700.5',
      previousRentSetOn: '2025-09-01',
    });
  });

  it('UX-LT-23: it answers nothing for the person: how it ended is still theirs to say', () => {
    const answers = rentAnswersFromLastTime({ rentCents: 185_000, tenancyStartedOn: '2026-06-01' });
    expect(answers.ending).toBeUndefined();
    expect(schema.safeParse(answers).success).toBe(false);
  });

  it('R3: a recorded check opens with the answers it was made from', () => {
    expect(
      rentAnswersFromCheck({
        lastLet: 'before_new_rules',
        ending: null,
        substantialChange: false,
        previousRentCents: 170_000,
        previousRentSetOn: '2025-10-31',
      }),
    ).toEqual({
      lastLet: 'before_new_rules',
      ending: undefined,
      substantialChange: 'no',
      previousRent: '1,700',
      previousRentSetOn: '2025-10-31',
    });
    expect(
      rentAnswersFromCheck({
        lastLet: 'never',
        ending: null,
        substantialChange: false,
        previousRentCents: null,
        previousRentSetOn: null,
      }),
    ).toEqual({ lastLet: 'never' });
  });
});

import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import {
  checksFor,
  describeReference,
  employerQuestions,
  landlordQuestions,
  referenceAnswersSchema,
  referenceSchedule,
  refereesSchema,
} from './checks';

describe('R18: which checks, for whom', () => {
  it('asks for ID, income and a landlord reference; an employer reference only from a job', () => {
    expect(checksFor('employed')).toEqual([
      { kind: 'identity', status: 'to_do' },
      { kind: 'income', status: 'to_do' },
      { kind: 'landlord_reference', status: 'to_do' },
      { kind: 'employer_reference', status: 'to_do' },
    ]);
    expect(checksFor('self_employed').at(-1)).toEqual({
      kind: 'employer_reference',
      status: 'not_needed',
    });
  });
});

describe('R18: references', () => {
  it('chases twice, two days apart, and flags no answer after six days', () => {
    const at = new Date('2026-11-02T10:00:00Z');
    const day = 86_400_000;
    expect(referenceSchedule(at)).toEqual({
      reminders: [new Date(at.getTime() + 2 * day), new Date(at.getTime() + 4 * day)],
      noAnswerAt: new Date(at.getTime() + 6 * day),
    });
  });

  it('takes each referee’s name and email, or "I don’t have one"', () => {
    expect(
      refereesSchema.parse({
        landlordName: 'Mary Kelly',
        landlordEmail: 'mary@example.ie',
        employerNone: 'yes',
      }),
    ).toEqual({
      landlord: { name: 'Mary Kelly', email: 'mary@example.ie' },
      employer: null,
    });
    const missing = refereesSchema.safeParse({ landlordName: 'Mary', landlordEmail: 'nope' });
    expect(missing.error!.issues.map((i) => i.message)).toEqual([
      'Enter an email address, like name@example.ie.',
      'Enter your employer’s name and email, or tick that you don’t have one.',
    ]);
  });

  it('asks referees fixed questions only: no free text, nothing on protected grounds', () => {
    for (const question of [...landlordQuestions, ...employerQuestions]) {
      expect(findProtectedGrounds(question.label)).toEqual([]);
      for (const option of question.options) expect(findProtectedGrounds(option.label)).toEqual([]);
    }
    const parsed = referenceAnswersSchema('landlord_reference').parse({
      rentedFromYou: 'yes',
      paidOnTime: 'always',
      lookedAfter: 'yes',
      rentAgain: 'yes',
      comment: 'free text is dropped',
    });
    expect(Object.keys(parsed)).toEqual([
      'rentedFromYou',
      'paidOnTime',
      'lookedAfter',
      'rentAgain',
    ]);
  });

  it('describes answers in plain words for the operator', () => {
    expect(
      describeReference('landlord_reference', {
        rentedFromYou: 'yes',
        paidOnTime: 'always',
        lookedAfter: 'mostly',
        rentAgain: 'yes',
      }),
    ).toBe(
      'Rented from them. Rent always on time. Looked after the home mostly. Would rent to them again.',
    );
    expect(describeReference('employer_reference', { worksForYou: 'no' })).toBe(
      'Says they don’t work for them.',
    );
  });
});

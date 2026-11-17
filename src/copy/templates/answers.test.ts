import { describe, expect, it } from 'vitest';
import {
  answersEmail,
  draftParts,
  draftWithAnswers,
  operatorAnswerEmail,
  operatorAnswersEmail,
} from './answers';

const frame = {
  renterName: 'Aoife Byrne',
  operatorName: 'Halcyon Lettings',
  address: '12 Ranelagh Road',
};
const furnished = { question: 'Is it furnished?', answer: 'Yes, it’s furnished.' };
const garden = { question: 'Is there a garden?', answer: 'Yes, a small back garden.' };

const draft = answersEmail({ ...frame, answers: [furnished], passedToPerson: true }).body;
const everything = answersEmail({ ...frame, answers: [furnished, garden], passedToPerson: false });

describe('UX-NV-15: the part Gaff couldn’t answer is marked in the draft', () => {
  it('finds where the draft says a person will answer the rest', () => {
    expect(draftParts(draft, 'Halcyon Lettings')).toEqual({
      before: 'Hello Aoife,\n\nYou asked: Is it furnished?\nYes, it’s furnished.',
      line: 'I’ve passed your other question to a person at Halcyon Lettings. They’ll reply to you by email.',
      after:
        'If you have any other questions, just reply to this email.\n\nHalcyon Lettings’ AI assistant',
    });
  });

  it('finds it when Gaff answered nothing, too', () => {
    const nothing = answersEmail({ ...frame, answers: [], passedToPerson: true }).body;
    expect(draftParts(nothing, 'Halcyon Lettings')?.line).toContain('your other questions');
  });

  it('is null when everything was answered, or the line was edited away', () => {
    expect(draftParts(everything.body, 'Halcyon Lettings')).toBeNull();
    expect(draftParts(draft.replace('I’ve passed', 'We passed'), 'Halcyon Lettings')).toBeNull();
  });
});

describe('UX-NV-15: sending answers both, in one email, in the answer email’s own words', () => {
  it('puts the person’s answer where the draft said a person would reply', () => {
    const body = draftWithAnswers({
      body: draft,
      operatorName: 'Halcyon Lettings',
      answers: [garden],
      stillWithAPerson: false,
    });
    // Exactly the email Gaff would have written had it known both answers.
    expect(body).toBe(everything.body);
    expect(body).not.toContain('passed your other question');
  });

  it('keeps the line when something is still left for a person', () => {
    const body = draftWithAnswers({
      body: draft,
      operatorName: 'Halcyon Lettings',
      answers: [garden],
      stillWithAPerson: true,
    });
    expect(body).toBe(
      answersEmail({ ...frame, answers: [furnished, garden], passedToPerson: true }).body,
    );
  });

  it('puts the answers before the closing line of a draft the person edited', () => {
    const edited = draft.replace(
      'I’ve passed your other question to a person at Halcyon Lettings. They’ll reply to you by email.\n\n',
      '',
    );
    expect(
      draftWithAnswers({
        body: edited,
        operatorName: 'Halcyon Lettings',
        answers: [garden],
        stillWithAPerson: false,
      }),
    ).toBe(everything.body);
  });

  it('puts them at the end of a draft the person rewrote altogether', () => {
    expect(
      draftWithAnswers({
        body: 'Hello Aoife,\n\nIt is furnished.\n',
        operatorName: 'Halcyon Lettings',
        answers: [garden],
        stillWithAPerson: false,
      }),
    ).toBe(
      'Hello Aoife,\n\nIt is furnished.\n\nYou asked: Is there a garden?\nYes, a small back garden.',
    );
  });

  it('changes nothing when the person answered nothing', () => {
    expect(
      draftWithAnswers({
        body: draft,
        operatorName: 'Halcyon Lettings',
        answers: [],
        stillWithAPerson: true,
      }),
    ).toBe(draft);
  });
});

describe('R8: a person’s own answers go in one email, signed by them', () => {
  const person = { ...frame, personName: 'Ann Power' };

  it('is the same email as before for one question', () => {
    expect(operatorAnswersEmail({ ...person, answers: [garden] })).toEqual(
      operatorAnswerEmail({ ...person, ...garden }),
    );
    expect(operatorAnswerEmail({ ...person, ...garden }).body).toBe(
      [
        'Hello Aoife,',
        '',
        'You asked: Is there a garden?',
        'Yes, a small back garden.',
        '',
        'If you have any other questions, just reply to this email.',
        '',
        'Ann Power, Halcyon Lettings',
      ].join('\n'),
    );
  });

  it('answers two questions in one email, each in the same words', () => {
    const { subject, body } = operatorAnswersEmail({ ...person, answers: [furnished, garden] });
    expect(subject).toBe('Re: 12 Ranelagh Road');
    expect(body).toBe(
      [
        'Hello Aoife,',
        '',
        'You asked: Is it furnished?',
        'Yes, it’s furnished.',
        '',
        'You asked: Is there a garden?',
        'Yes, a small back garden.',
        '',
        'If you have any other questions, just reply to this email.',
        '',
        'Ann Power, Halcyon Lettings',
      ].join('\n'),
    );
    // A person's answer is never signed as the assistant's.
    expect(body).not.toContain('AI assistant');
  });
});

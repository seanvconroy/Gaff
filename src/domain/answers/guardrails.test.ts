import { describe, expect, it } from 'vitest';
import { asksForAPerson, checkDraftItem, fixedAnswerFor, questionsIn, redact } from './guardrails';

const facts = [
  { id: 'core:parking', text: 'Parking: On-street parking' },
  { id: 'f1', text: 'Gas central heating' },
];

describe('R8: fixed, lawful answers to protected-ground questions (Q7)', () => {
  it.each([
    ['Do you accept HAP?', 'Housing Assistance Payment (HAP) is welcome here'],
    ['Is rent supplement OK?', 'Housing Assistance Payment (HAP) is welcome here'],
    ['Can I bring my guide dog?', 'Assistance dogs are always welcome'],
    ['Is it suitable for kids?', 'Everyone is welcome to apply'],
    ['Do you take foreigners?', 'Everyone is welcome to apply'],
  ])('%s', (question, answer) => {
    expect(fixedAnswerFor(question)).toContain(answer);
  });

  it('leaves ordinary questions to the facts', () => {
    expect(fixedAnswerFor('Is there parking?')).toBeNull();
  });
});

describe('R8: guardrails', () => {
  it('sends a request for a person straight to a person', () => {
    expect(asksForAPerson('Could I speak to someone please?')).toBe(true);
    expect(asksForAPerson('Can I talk to a real person')).toBe(true);
    expect(asksForAPerson('Is there parking?')).toBe(false);
  });

  it('finds the questions in a message', () => {
    expect(questionsIn('Hi! Is it still available? Is there parking?\nThanks, Aoife')).toEqual([
      'Is it still available?',
      'Is there parking?',
    ]);
    expect(questionsIn('I would love to view it.')).toEqual([]);
    expect(questionsIn('Hi there, is it furnished?')).toEqual(['Is it furnished?']);
  });

  it('removes the renter’s name and contact details before text reaches the AI', () => {
    expect(
      redact(
        'Hi, Aoife Byrne here, aoife.byrne@example.ie or 087 123 4567. Is there parking?',
        'Aoife Byrne',
      ),
    ).toBe('Hi, [name] [name] here, [email] or [phone]. Is there parking?');
  });

  it('accepts an answer that cites real facts', () => {
    expect(
      checkDraftItem(
        {
          question: 'Is there parking?',
          answer: 'Yes, there’s on-street parking.',
          factIds: ['core:parking'],
        },
        facts,
      ),
    ).toEqual({
      question: 'Is there parking?',
      outcome: 'answered',
      answer: 'Yes, there’s on-street parking.',
      factIds: ['core:parking'],
    });
  });

  it.each([
    [{ answer: null, factIds: [] }, 'no_facts'],
    [{ answer: 'Yes, a garden.', factIds: [] }, 'no_facts'],
    [{ answer: 'Yes, a garden.', factIds: ['made-up'] }, 'unknown_facts'],
    [{ answer: 'It suits a young family.', factIds: ['f1'] }, 'protected_ground'],
    [{ answer: 'Call the landlord on 087 999 9999.', factIds: ['f1'] }, 'contact_details'],
    [{ answer: 'x'.repeat(601), factIds: ['f1'] }, 'too_long'],
  ])('sends anything else to the operator: %o → %s', (draft, reason) => {
    expect(checkDraftItem({ question: 'Q?', ...draft }, facts)).toEqual({
      question: 'Q?',
      outcome: 'to_operator',
      reason,
    });
  });
});

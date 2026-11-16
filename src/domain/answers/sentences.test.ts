import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { checkDraftItem, type Fact } from './guardrails';
import { asASentence, inASentence, repeatsTheFact } from './sentences';

const fact = (id: string, text: string): Fact => ({ id, text });

describe('UX-AI-11: a drafted answer reads like a person wrote it', () => {
  it('answers a yes-or-no question with yes or no, then the fact', () => {
    const furnished = fact('core:furnishing', 'Furnishing: Furnished');
    expect(inASentence('Is it furnished?', furnished)).toBe('Yes, it’s furnished.');
    expect(
      inASentence('Is it furnished?', fact('core:furnishing', 'Furnishing: Unfurnished')),
    ).toBe('No, it’s unfurnished.');
    // Neither a yes nor a no: it says what it is.
    expect(
      inASentence('Is it furnished?', fact('core:furnishing', 'Furnishing: Part furnished')),
    ).toBe('It’s part furnished.');
    expect(inASentence('What about furniture?', furnished)).toBe('It’s furnished.');
  });

  it('says parking the way a person would', () => {
    expect(
      inASentence('Is there parking?', fact('core:parking', 'Parking: On-street parking')),
    ).toBe('Yes, there’s on-street parking.');
    expect(inASentence('Is there parking?', fact('core:parking', 'Parking: No parking'))).toBe(
      'No, there’s no parking.',
    );
    expect(inASentence('Where do I park?', fact('core:parking', 'Parking: A parking space'))).toBe(
      'There’s a parking space.',
    );
  });

  it.each([
    ['core:rent', 'Rent: €1,850 a month', 'How much is it?', 'The rent is €1,850 a month.'],
    [
      'core:available',
      'Available from Tuesday 1 December',
      'When is it available from?',
      'It’s available from Tuesday 1 December.',
    ],
    ['core:bedrooms', 'Bedrooms: 2', 'How many bedrooms?', 'It has 2 bedrooms.'],
    ['core:bedrooms', 'Bedrooms: 1', 'How many bedrooms?', 'It has 1 bedroom.'],
    [
      'core:bedrooms',
      'Bedrooms: Studio (no separate bedroom)',
      'How many bedrooms?',
      'It’s a studio (no separate bedroom).',
    ],
    ['core:bathrooms', 'Bathrooms: 1', 'How many bathrooms?', 'It has 1 bathroom.'],
    ['core:type-of-home', 'Type of home: Apartment', 'Is it a house?', 'It’s an apartment.'],
    ['core:type-of-home', 'Type of home: House', 'What is it?', 'It’s a house.'],
    ['core:ber-rating', 'BER rating: C1', 'What’s the BER?', 'The BER rating is C1.'],
    ['core:ber-rating', 'BER rating: Exempt', 'What’s the BER?', 'It’s exempt from a BER rating.'],
    [
      'core:address',
      'Address: 12 Ranelagh Road, Ranelagh, Dublin 6',
      'Where is it?',
      'The address is 12 Ranelagh Road, Ranelagh, Dublin 6.',
    ],
    [
      'core:viewings',
      'Viewing times (renters book after they’re invited): Saturday 7 November, 6pm to 7pm',
      'When are the viewings?',
      'The viewing times are Saturday 7 November, 6pm to 7pm. You book a time once you’re invited.',
    ],
    [
      'core:criteria-1',
      'Criteria for viewing: No pets (assistance dogs are always welcome)',
      'Can I bring my cat?',
      'One of the things asked of everyone who wants to view: no pets (assistance dogs are always welcome).',
    ],
  ])('%s: "%s" answers "%s"', (id, text, question, sentence) => {
    expect(inASentence(question, fact(id, text))).toBe(sentence);
  });

  it('gives a remembered answer as the operator wrote it', () => {
    const remembered = fact(
      '3f0c1f0e-0000-4000-8000-000000000001',
      'Asked: Is there a garden? Answer: Yes, a small back garden',
    );
    expect(inASentence('Does it have a garden?', remembered)).toBe('Yes, a small back garden.');
  });

  it('says a fact written as plain words as it is, and a field it doesn’t know in a sentence', () => {
    expect(inASentence('What heating is there?', fact('f1', 'gas central heating'))).toBe(
      'Gas central heating.',
    );
    expect(inASentence('What is the deposit?', fact('f2', 'Deposit: one month’s rent'))).toBe(
      'The deposit is one month’s rent.',
    );
  });

  it('keeps a web address whole, so it is still the one in the fact', () => {
    const photos = fact('core:photos', 'Photos: https://photos.example.ie/12-ranelagh-road');
    const answer = inASentence('Are there photos?', photos);
    expect(answer).toBe('You can see the photos here: https://photos.example.ie/12-ranelagh-road');
    expect(
      checkDraftItem({ question: 'Are there photos?', answer, factIds: [photos.id] }, [photos])
        .outcome,
    ).toBe('answered');
  });

  it('never has a field and a value, an exclamation mark or a protected ground in it', () => {
    const facts = [
      fact('core:furnishing', 'Furnishing: Furnished'),
      fact('core:parking', 'Parking: On-street parking'),
      fact('core:rent', 'Rent: €1,850 a month'),
      fact('core:bedrooms', 'Bedrooms: 2'),
      fact('core:criteria-1', 'Criteria for viewing: Up to 3 people'),
      fact('core:criteria-2', 'Criteria for viewing: No pets (assistance dogs are always welcome)'),
    ];
    for (const one of facts) {
      const sentence = inASentence('Is it?', one);
      expect(sentence).not.toMatch(/^[A-Z][A-Za-z ]+: [A-Z]/);
      expect(sentence).not.toContain('!');
      expect(findProtectedGrounds(sentence)).toEqual([]);
    }
  });
});

describe('UX-AI-11: an answer that only repeats a fact is put as a sentence, from the same fact', () => {
  const facts = [
    fact('core:furnishing', 'Furnishing: Furnished'),
    fact('core:parking', 'Parking: On-street parking'),
    fact('f1', 'Gas central heating'),
  ];

  it('knows a field and a value when it sees one', () => {
    expect(repeatsTheFact('Furnishing: Furnished.', facts[0]!)).toBe(true);
    expect(repeatsTheFact('furnishing: furnished', facts[0]!)).toBe(true);
    expect(repeatsTheFact('Yes, it’s furnished.', facts[0]!)).toBe(false);
    // A fact that is already plain words isn't a field and a value.
    expect(repeatsTheFact('Gas central heating.', facts[2]!)).toBe(false);
  });

  it('rewrites it, and cites the same fact', () => {
    expect(
      asASentence(
        {
          question: 'Is it furnished?',
          answer: 'Furnishing: Furnished.',
          factIds: ['core:furnishing'],
        },
        facts,
      ),
    ).toEqual({
      question: 'Is it furnished?',
      answer: 'Yes, it’s furnished.',
      factIds: ['core:furnishing'],
    });
  });

  it('leaves every other answer exactly as it was written', () => {
    const written = {
      question: 'Is it furnished?',
      answer: 'Yes, it comes furnished.',
      factIds: ['core:furnishing'],
    };
    expect(asASentence(written, facts)).toBe(written);
    const unanswered = { question: 'Is there a garden?', answer: null, factIds: [] };
    expect(asASentence(unanswered, facts)).toBe(unanswered);
    // An answer that cites a fact that doesn't exist is left for the guardrails to stop.
    const invented = { question: 'Q?', answer: 'Furnishing: Furnished.', factIds: ['made-up'] };
    expect(asASentence(invented, facts)).toBe(invented);
    expect(checkDraftItem(invented, facts)).toMatchObject({
      outcome: 'to_operator',
      reason: 'unknown_facts',
    });
  });

  it('is checked by the same guardrails as anything else the AI writes', () => {
    const item = asASentence(
      {
        question: 'Is there parking?',
        answer: 'Parking: On-street parking',
        factIds: ['core:parking'],
      },
      facts,
    );
    expect(checkDraftItem(item, facts)).toEqual({
      question: 'Is there parking?',
      outcome: 'answered',
      answer: 'Yes, there’s on-street parking.',
      factIds: ['core:parking'],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { confirmedFindings, descriptionProblem, numbersIn } from './validators';

const facts = [
  { id: 'home:type', text: 'Type: Apartment' },
  { id: 'home:bedrooms', text: 'Bedrooms: 2' },
  { id: 'home:size', text: 'Floor area: 68 square metres' },
  { id: 'home:heating', text: 'Heating: Gas central heating' },
  { id: 'home:outdoor', text: 'Outdoor space: Balcony' },
];

const good =
  'A bright apartment with two bedrooms and 68 square metres of living space. It has gas central heating, so it stays warm through the winter months, and a balcony to sit out on when the weather allows. The rooms are laid out simply, with plenty of light coming in through the day, and it is ready to move into.';

describe('P10: a drafted description is used only if it keeps to the facts', () => {
  it('accepts a description made only of the facts', () => {
    expect(descriptionProblem({ description: good, factIds: ['home:bedrooms'] }, facts)).toBeNull();
  });

  it('refuses a number the facts don’t have, such as a made-up distance', () => {
    const text = `${good} The Luas is 5 minutes away.`;
    expect(descriptionProblem({ description: text, factIds: [] }, facts)).toBe(
      'number_not_in_facts',
    );
  });

  it('reads numbers written as words', () => {
    expect(numbersIn('two bedrooms and three bathrooms, 48 m²')).toEqual(new Set(['2', '3', '48']));
    const text = good.replace('two bedrooms', 'three bedrooms');
    expect(descriptionProblem({ description: text, factIds: [] }, facts)).toBe(
      'number_not_in_facts',
    );
  });

  it('refuses wording the letter’s own words couldn’t have (M46)', () => {
    const text = `${good} It would suit a professional couple.`;
    expect(descriptionProblem({ description: text, factIds: [] }, facts)).toBe('listing_text');
    expect(
      descriptionProblem({ description: `${good} Call 087 123 4567.`, factIds: [] }, facts),
    ).not.toBeNull();
  });

  it('refuses a fact it wasn’t given, and anything too short or too long', () => {
    expect(descriptionProblem({ description: good, factIds: ['home:pool'] }, facts)).toBe(
      'unknown_fact',
    );
    expect(descriptionProblem({ description: 'A flat.', factIds: [] }, facts)).toBe('too_short');
    expect(descriptionProblem({ description: good.repeat(6), factIds: [] }, facts)).toBe(
      'too_long',
    );
  });
});

describe('P13: a wording finding counts only if its phrase is in the text', () => {
  const text = 'Bright two-bed. Would suit a quiet professional couple.';
  it('keeps phrases copied word for word, once', () => {
    const kept = confirmedFindings(
      [
        { phrase: 'quiet professional couple' },
        { phrase: 'Quiet professional couple' },
        { phrase: 'quiet professional couple' },
      ],
      text,
    );
    expect(kept).toEqual([{ phrase: 'quiet professional couple' }]);
  });

  it('drops phrases the model made up or misquoted', () => {
    expect(confirmedFindings([{ phrase: 'no children' }, { phrase: '' }], text)).toEqual([]);
  });
});

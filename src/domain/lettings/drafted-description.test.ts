import { describe, expect, it } from 'vitest';
import {
  canDraftFrom,
  descriptionFacts,
  descriptionProblem,
  numbersIn,
  withDescriptionMark,
} from './drafted-description';

const facts = [
  { id: 'home:type', text: 'Type: Apartment' },
  { id: 'home:bedrooms', text: 'Bedrooms: 2' },
  { id: 'home:size', text: 'Floor area: 68 square metres' },
  { id: 'own:1', text: 'Gas central heating' },
  { id: 'own:2', text: 'A balcony off the living room' },
];

const good =
  'A bright apartment with two bedrooms and 68 square metres of living space. It has gas central heating, so it stays warm through the winter months, and a balcony to sit out on when the weather allows. The rooms are laid out simply, with plenty of light coming in through the day, and it is ready to move into.';

describe('P10: a drafted description is used only if it keeps to the facts', () => {
  it('P10: accepts a description made only of the facts', () => {
    expect(
      descriptionProblem({ description: good, factIds: ['home:bedrooms', 'own:1'] }, facts),
    ).toBeNull();
  });

  it('P11: refuses a number the facts don’t have, such as a made-up distance', () => {
    const text = `${good} The Luas is 5 minutes away.`;
    expect(descriptionProblem({ description: text, factIds: ['home:type'] }, facts)).toBe(
      'number_not_in_facts',
    );
  });

  it('P11: reads numbers written as words', () => {
    expect(numbersIn('two bedrooms and three bathrooms, 48 m²')).toEqual(new Set(['2', '3', '48']));
    const text = good.replace('two bedrooms', 'three bedrooms');
    expect(descriptionProblem({ description: text, factIds: ['home:type'] }, facts)).toBe(
      'number_not_in_facts',
    );
  });

  it('P10: refuses wording a lister’s own description couldn’t have (rule 3)', () => {
    for (const line of [
      'It would suit a professional couple.',
      'Ideal for a young family.',
      'References required.',
      'Perfect for students.',
    ]) {
      expect(
        descriptionProblem({ description: `${good} ${line}`, factIds: ['home:type'] }, facts),
        line,
      ).toBe('wording');
    }
  });

  it('P10: refuses contact details and links', () => {
    for (const extra of ['Email owner@example.ie.', 'See www.example.ie.', 'Ask [name].']) {
      expect(
        descriptionProblem({ description: `${good} ${extra}`, factIds: ['home:type'] }, facts),
        extra,
      ).toBe('contact_details');
    }
    expect(
      descriptionProblem(
        { description: `${good} Call 087 123 4567.`, factIds: ['home:type'] },
        facts,
      ),
    ).not.toBeNull();
  });

  it('P11: refuses a fact it wasn’t given, none at all, and anything too short or too long', () => {
    expect(descriptionProblem({ description: good, factIds: ['home:pool'] }, facts)).toBe(
      'unknown_fact',
    );
    expect(descriptionProblem({ description: good, factIds: [] }, facts)).toBe('no_facts');
    expect(descriptionProblem({ description: 'A flat.', factIds: ['home:type'] }, facts)).toBe(
      'too_short',
    );
    expect(descriptionProblem({ description: good.repeat(6), factIds: ['home:type'] }, facts)).toBe(
      'too_long',
    );
  });
});

describe('P10: what the model is given', () => {
  const answers = {
    addressLine1: '14 Harbour View',
    addressLine2: 'Ranelagh',
    area: 'Ranelagh',
    county: 'Dublin' as const,
    eircode: 'D06 F2X3',
    rentCents: 185_000,
    availableFrom: '2026-12-01',
    propertyType: 'apartment' as const,
    bedrooms: 2,
    bathrooms: 1,
    furnished: 'furnished' as const,
    berRating: 'B2' as const,
    parking: 'space' as const,
    description: 'The lister’s own words',
    otherFacts: ['Gas central heating', 'Ring Aoife Byrne on 087 123 4567 to view'],
    daftUrl: 'https://www.daft.ie/for-rent/1',
    criteria: { noPets: true, maxOccupants: 3, minStayMonths: 12 },
    noSmokingIndoors: true,
  };
  const now = new Date('2026-11-20T12:00:00Z');

  it('P10: gives the home’s facts, the area and the lister’s own statements', () => {
    const given = descriptionFacts(answers, ['Aoife Byrne'], now);
    expect(given).toEqual([
      { id: 'home:type', text: 'Type: Apartment' },
      { id: 'home:area', text: 'Area: Ranelagh, Dublin' },
      { id: 'home:bedrooms', text: 'Bedrooms: 2' },
      { id: 'home:bathrooms', text: 'Bathrooms: 1' },
      { id: 'home:furnished', text: 'Furnishing: Furnished' },
      { id: 'home:ber', text: 'BER: B2' },
      { id: 'home:parking', text: 'Parking: A parking space' },
      { id: 'home:available', text: 'Available from Tuesday 1 December' },
      { id: 'own:1', text: 'Gas central heating' },
      { id: 'own:2', text: 'Ring [name] on [phone] to view' },
    ]);
  });

  it('P10: never the rent, the criteria, the house rule, the street, the Eircode or a link', () => {
    const sent = JSON.stringify(descriptionFacts(answers, ['Aoife Byrne'], now));
    for (const never of [
      '1,850',
      '1850',
      '185000',
      '€',
      'pets',
      'occupants',
      'smok',
      '14 Harbour View',
      'D06',
      'daft',
      'Aoife',
      '087',
      'The lister’s own words',
    ]) {
      expect(sent, never).not.toContain(never);
    }
  });

  it('P10: needs the type or the bedrooms before there is anything to draft from', () => {
    expect(canDraftFrom({ area: 'Ranelagh' })).toBe(false);
    expect(canDraftFrom({ propertyType: 'house' })).toBe(true);
    expect(canDraftFrom({ bedrooms: 0 })).toBe(true);
  });
});

describe('P11: "Drafted by AI" stays until the lister changes the words', () => {
  it('P11: marks the draft Gaff gave, as it was given', () => {
    expect(withDescriptionMark({}, { description: good }, true)).toEqual({
      description: good,
      descriptionByAi: true,
    });
  });

  it('P11: keeps the mark on a save that changes nothing, and drops it on any change', () => {
    const before = { description: good, descriptionByAi: true as const };
    expect(withDescriptionMark(before, { description: good }, false).descriptionByAi).toBe(true);
    expect(
      withDescriptionMark(before, { description: `${good} Close to the park.` }, false)
        .descriptionByAi,
    ).toBeUndefined();
    expect(withDescriptionMark(before, { description: undefined }, true).descriptionByAi).toBe(
      undefined,
    );
  });

  it('P11: words the lister wrote are never marked, and a save without the description leaves it be', () => {
    expect(withDescriptionMark({}, { description: good }, false).descriptionByAi).toBeUndefined();
    expect(withDescriptionMark({ descriptionByAi: true }, { bedrooms: 2 }, false)).toEqual({
      bedrooms: 2,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { homeWordingReason } from '@/domain/compliance/who-should-apply';
import { homeStepSchema, withAnswers } from './add-letting';
import {
  appliances,
  broadbandTypes,
  floorWords,
  heatingTypes,
  isTourUrl,
  keptMoreFacts,
  moreFactHighlights,
  moreFactLines,
  outdoorSpaces,
  readMoreFacts,
  tourLink,
} from './more-facts';
import { describeKeyFacts } from './new-letting';

describe('M39, M40, M44: more of a home’s facts', () => {
  it('M39: each fact is offered: a home step with none of them still reads', () => {
    const parsed = homeStepSchema().parse({ propertyType: 'apartment', bedrooms: '2' });
    expect(keptMoreFacts(parsed)).toBeNull();
  });

  it('M39: the step reads each fact from its form value', () => {
    const parsed = homeStepSchema().parse({
      propertyType: 'apartment',
      bedrooms: '2',
      ensuites: '1',
      floorAreaSqm: '68',
      floor: '2',
      lift: 'yes',
      heating: 'heat_pump',
      outdoorSpace: 'balcony',
      appliances: 'washing_machine,dishwasher,toaster',
      broadband: 'fibre',
      berNumber: '104 123 456',
      tourUrl: 'https://my.matterport.com/show/?m=abc123',
    });
    expect(keptMoreFacts(parsed)).toEqual({
      ensuites: 1,
      floorAreaSqm: 68,
      floor: 2,
      lift: true,
      heating: 'heat_pump',
      outdoorSpace: 'balcony',
      appliances: ['washing_machine', 'dishwasher'],
      broadband: 'fibre',
      berNumber: '104123456',
      tourUrl: 'https://my.matterport.com/show/?m=abc123',
    });
  });

  it('M39: a value that doesn’t read is an error at its field', () => {
    const problems = (values: Record<string, string>) => {
      const parsed = homeStepSchema().safeParse({
        propertyType: 'house',
        bedrooms: '3',
        ...values,
      });
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
    };
    expect(problems({ floorAreaSqm: '4' })).toEqual(['floorAreaSqm']);
    expect(problems({ floor: '99' })).toEqual(['floor']);
    expect(problems({ heating: 'coal_fire' })).toEqual(['heating']);
    expect(problems({ berNumber: '12345' })).toEqual(['berNumber']);
    expect(problems({ tourUrl: 'https://example.com/tour' })).toEqual(['tourUrl']);
  });

  it('M44: a tour link is a secure address on YouTube, Vimeo or Matterport, and nothing else', () => {
    expect(isTourUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isTourUrl('https://youtu.be/abc')).toBe(true);
    expect(isTourUrl('https://vimeo.com/123')).toBe(true);
    expect(isTourUrl('https://my.matterport.com/show/?m=x')).toBe(true);
    expect(isTourUrl('http://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isTourUrl('https://youtube.com.example.ie/watch')).toBe(false);
    expect(isTourUrl('https://notyoutube.com/watch')).toBe(false);
    expect(isTourUrl('https://user:pass@vimeo.com/1')).toBe(false);
    expect(isTourUrl('javascript:alert(1)')).toBe(false);
    expect(isTourUrl('not a link')).toBe(false);
    expect(tourLink({ tourUrl: 'https://vimeo.com/123' })).toEqual({
      href: 'https://vimeo.com/123',
      host: 'Vimeo',
    });
    expect(tourLink({})).toBeNull();
  });

  it('M39: the facts are said as label and value, for the Home view and the AI’s answers', () => {
    expect(
      moreFactLines({ ensuites: 1, floorAreaSqm: 75, floor: 0, lift: false, heating: 'gas' }),
    ).toEqual([
      { key: 'ensuites', label: 'En-suites', value: '1' },
      { key: 'floorAreaSqm', label: 'Floor area', value: '75 m²' },
      { key: 'floor', label: 'Floor', value: 'Ground floor' },
      { key: 'lift', label: 'Lift', value: 'No' },
      { key: 'heating', label: 'Heating', value: 'Gas central heating' },
    ]);
    const facts = describeKeyFacts({
      propertyType: 'apartment',
      bedrooms: 2,
      more: { appliances: ['washing_machine', 'dryer', 'dishwasher'], berNumber: '104123456' },
    });
    expect(facts.slice(2)).toEqual([
      { label: 'Appliances', value: 'Washing machine, dryer and dishwasher' },
      { label: 'BER number', value: '104123456' },
    ]);
  });

  it('M39: a home’s page says them as short highlights; a lift is a fact about the building', () => {
    expect(
      moreFactHighlights({ ensuites: 2, floor: 3, lift: true, outdoorSpace: 'garden' }).map(
        (h) => h.text,
      ),
    ).toEqual(['2 en-suites', '3rd floor, with a lift', 'Private garden']);
    expect(moreFactHighlights({ lift: true }).map((h) => h.text)).toEqual(['Lift in the building']);
    expect(floorWords(-1)).toBe('Basement');
    expect(floorWords(1)).toBe('1st floor');
    expect(floorWords(12)).toBe('12th floor');
    expect(floorWords(22)).toBe('22nd floor');
  });

  it('rule 3: no fact describes who a home suits or touches a protected ground', () => {
    const words = [
      ...Object.values(heatingTypes),
      ...Object.values(outdoorSpaces),
      ...Object.values(appliances),
      ...Object.values(broadbandTypes),
      'Lift in the building',
      'No lift',
      'Ground floor, with a lift',
    ];
    for (const text of words) expect(homeWordingReason(text)).toBeNull();
  });

  it('M39: what a letting holds is read back, and a value that no longer reads is left out', () => {
    expect(readMoreFacts(null)).toEqual({});
    expect(
      readMoreFacts({ floor: 2, heating: 'peat', tourUrl: 'https://example.com', other: 1 }),
    ).toEqual({ floor: 2 });
  });

  it('M39: answers take and drop facts like any other: a blank one is taken out', () => {
    const answers = withAnswers({ floor: 2, appliances: ['dryer'] }, { appliances: undefined });
    expect(answers).toEqual({ floor: 2 });
  });
});

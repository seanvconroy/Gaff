import { describe, expect, it } from 'vitest';
import {
  type AdvertReading,
  advertReadingSchema,
  checkReading,
  stripPersonalDetails,
} from '@/domain/lettings/advert-reading';
import { INJECTED_ADVERT, RANELAGH_ADVERT, SPARSE_ADVERT } from '../../../tests/fixtures/adverts';
import { fakeAi } from './fake';

/**
 * The local stand-in for the model that reads adverts, and the whole path a pasted advert
 * takes with it: strip, read, then let code decide what is kept (work package WP-10).
 */

const TODAY = '2026-11-17';

async function read(advert: string, names: string[] = []) {
  const text = stripPersonalDetails(advert, names);
  const { output: reading } = await fakeAi.readAdvert({ text, today: TODAY });
  const checked = checkReading(text, reading, TODAY);
  if (!checked) throw new Error('the stand-in handed back something that is not a reading');
  return { text, raw: reading as AdvertReading, ...checked };
}

describe('UX-LT-2: what an advert says is read into the home', () => {
  it('fills in the address, rent, date, type, rooms, furnishing, BER and parking', async () => {
    const { answers } = await read(RANELAGH_ADVERT);
    expect(answers).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
      eircode: 'D06 F2X3',
      rentCents: 185_000,
      availableFrom: '2026-12-01',
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      furnished: 'furnished',
      berRating: 'B2',
      parking: 'street',
    });
  });

  it('keeps other facts and the description in the lister’s own words', async () => {
    const { answers, text, reading } = await read(RANELAGH_ADVERT);
    expect(answers.otherFacts).toEqual(['Gas fired central heating']);
    expect(answers.description).toBe(
      'Bright two-bed apartment on the first floor, five minutes from the Luas.',
    );
    expect(text).toContain(answers.description);
    expect(reading.ownWords).toEqual(['description', 'otherFacts']);
  });

  it('hands back a reading of the strict shape, every time', async () => {
    for (const advert of [RANELAGH_ADVERT, SPARSE_ADVERT, INJECTED_ADVERT, '', 'hello']) {
      const { output: reading } = await fakeAi.readAdvert({ text: advert, today: TODAY });
      expect(advertReadingSchema.safeParse(reading).success).toBe(true);
    }
  });

  it('gives a date with no year the next time that day comes round', async () => {
    const { answers } = await read('Apartment to let. Available from 5 January.');
    expect(answers.availableFrom).toBe('2027-01-05');
  });
});

describe('UX-AI-4: every value carries the words it came from', () => {
  it('has a source for each found field, and the source is in the advert', async () => {
    const { answers, reading, text } = await read(RANELAGH_ADVERT);
    const fields = Object.keys(answers).filter(
      (key) => key !== 'otherFacts' && key !== 'description',
    );
    expect(fields.length).toBeGreaterThan(10);
    for (const field of fields) {
      const source = reading.sources[field as keyof typeof reading.sources];
      expect(source, field).toBeDefined();
      expect(text).toContain(source!.quote);
    }
    expect(reading.sources.rentCents?.quote).toBe('Rent: €1,850 per month');
    expect(reading.sources.berRating?.quote).toBe('BER: B2');
  });
});

describe('UX-LT-3, UX-AI-5: Gaff never invents a value', () => {
  it('leaves empty what the advert does not give', async () => {
    const { answers } = await read(SPARSE_ADVERT);
    expect(answers.propertyType).toBe('house');
    expect(answers.bedrooms).toBe(3);
    for (const field of [
      'addressLine1',
      'rentCents',
      'availableFrom',
      'berRating',
      'eircode',
      'bathrooms',
      'furnished',
      'parking',
    ] as const) {
      expect(answers[field], field).toBeUndefined();
    }
  });

  it('marks an unclear number of bedrooms for the person to check', async () => {
    const { answers, reading } = await read('2/3 bed house to let in Kinsale.');
    expect(answers.bedrooms).toBe(2);
    expect(reading.sources.bedrooms?.sure).toBe(false);
  });

  it('finds nothing in words that say nothing about a home', async () => {
    const { answers, reading } = await read('Hello there');
    expect(answers).toEqual({});
    expect(reading.found).toBe(0);
  });
});

describe('UX-LT-6: lines about who should apply are left out, with a reason', () => {
  it('leaves them out of the facts and the description, and says why', async () => {
    const { answers, reading, raw } = await read(RANELAGH_ADVERT);
    // The stand-in does put one forward as description. Code is what leaves it out.
    expect(raw.description).toContain('Would suit a professional couple.');
    expect(reading.leftOut).toEqual([
      { line: 'Would suit a professional couple.', reason: 'housing_assistance' },
      { line: 'No HAP.', reason: 'housing_assistance' },
    ]);
    const shown = [answers.description, ...(answers.otherFacts ?? [])].join(' ');
    expect(shown).not.toMatch(/suit|professional|couple|HAP/i);
  });

  it('never makes a criterion: what the advert says about one is only a suggestion', async () => {
    const { answers, reading } = await read(RANELAGH_ADVERT);
    expect(answers.criteria).toBeUndefined();
    expect(answers.noSmokingIndoors).toBeUndefined();
    expect(reading.suggested).toEqual({
      minStayMonths: { value: 12, quote: 'Minimum 12 month lease.' },
      noPets: { quote: 'No pets.' },
    });
  });

  it('suggests nothing from a line about who should live there', async () => {
    const { answers, reading } = await read(
      'House to let. Would suit a couple. Professionals only. Max 2 adults, no children.',
    );
    expect(answers.criteria).toBeUndefined();
    expect(reading.suggested).toEqual({});
  });
});

describe('UX-LT-7, UX-AI-8, UX-AI-9: stripped first, and nothing in the text is followed', () => {
  it('the reader never sees a name, a phone number or an email address', async () => {
    const { text, raw } = await read(RANELAGH_ADVERT, ['Ann Power']);
    for (const given of [text, JSON.stringify(raw)]) {
      expect(given).not.toMatch(/Mary|Byrne|087|123 4567|example\.ie/);
    }
  });

  it('reads the home and follows no instruction in it', async () => {
    const { answers } = await read(INJECTED_ADVERT);
    expect(answers).toMatchObject({
      addressLine1: '8 Harbour View',
      area: 'Kinsale',
      county: 'Cork',
      rentCents: 210_000,
      propertyType: 'house',
      bedrooms: 3,
      furnished: 'unfurnished',
      berRating: 'C1',
    });
    expect(JSON.stringify(answers)).not.toMatch(/admin|approves|instructions|assistant/i);
  });
});

describe('M39, M40 (BA-14): the stand-in reads the further facts too', () => {
  it('M39: floor, lift, area, heating, outdoor space, appliances, broadband, en-suites and BER number', async () => {
    const { answers } = await read(
      [
        '4 Harbour View, Kinsale, Co. Cork.',
        'A bright 2nd floor apartment of 68 sq m, with a lift.',
        'Gas central heating. BER No. 104123456.',
        'Private balcony.',
        'Washing machine and dishwasher.',
        'Fibre broadband.',
        'One en-suite.',
      ].join('\n'),
    );
    expect(answers).toMatchObject({
      floor: 2,
      floorAreaSqm: 68,
      lift: true,
      heating: 'gas',
      berNumber: '104123456',
      outdoorSpace: 'balcony',
      appliances: ['washing_machine', 'dishwasher'],
      broadband: 'fibre',
      ensuites: 1,
    });
  });
});

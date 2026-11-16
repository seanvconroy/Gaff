import { describe, expect, it } from 'vitest';
import {
  addressStepSchema,
  advertLinksIn,
  draftAnswersSchema,
  flowSteps,
  formValuesFrom,
  furthestStep,
  hasCore,
  homeStepSchema,
  letAgainAnswers,
  missingCore,
  needsAnswer,
  partialAnswers,
  rentStepSchema,
  resumeStep,
  stepAfter,
  stepBefore,
  stepsLeft,
  thingsToCheck,
  withAnswers,
  type DraftAnswers,
  type HomeLetBefore,
} from './add-letting';

const now = new Date('2026-11-16T12:00:00Z');

const address: DraftAnswers = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
};
const rent: DraftAnswers = { rentCents: 185_000, availableFrom: '2026-12-13' };
const home: DraftAnswers = { propertyType: 'apartment', bedrooms: 2 };
const core: DraftAnswers = { ...address, ...rent, ...home };

describe('UX-LT-14: what a home needs before it is a letting', () => {
  it('UX-LT-14: nothing is known at the start, so every first step is missing, in order', () => {
    expect(missingCore({})).toEqual(['address', 'rent', 'home']);
    expect(hasCore({})).toBe(false);
  });

  it('UX-LT-14: an address, a rent, a date, a type and a bedroom count are all it needs', () => {
    expect(missingCore(core)).toEqual([]);
    expect(hasCore(core)).toBe(true);
  });

  it('UX-LT-9: an address without an Eircode is accepted', () => {
    expect(missingCore({ ...core, eircode: undefined })).toEqual([]);
  });

  it('UX-LT-14: a studio has no bedrooms, and that is an answer', () => {
    expect(missingCore({ ...address, ...rent, propertyType: 'studio', bedrooms: 0 })).toEqual([]);
  });

  it('UX-LT-14: a rent with no date still needs the rent step', () => {
    expect(missingCore({ ...address, ...home, rentCents: 185_000 })).toEqual(['rent']);
  });
});

describe('UX-LT-5: only the steps that still need an answer', () => {
  it('UX-LT-5: filling it in yourself shows every step, in order', () => {
    const progress = { answers: {}, photos: 0 };
    let step = stepAfter('start', progress, 'manual');
    const seen = [step];
    while (step !== 'go_live') {
      step = stepAfter(step, progress, 'manual');
      seen.push(step);
    }
    expect(seen).toEqual([...flowSteps]);
  });

  it('UX-LT-5: a complete import goes from the review straight to letting details', () => {
    expect(stepAfter('review', { answers: core, photos: 4 }, 'advert')).toBe('details');
  });

  it('UX-LT-5: an import with no photos stops at photos, and nothing before it', () => {
    expect(stepAfter('review', { answers: core, photos: 0 }, 'advert')).toBe('photos');
  });

  it('UX-LT-5: an import missing only the date asks for the rent step, then moves past the rest', () => {
    const answers = { ...address, ...home, rentCents: 185_000 };
    expect(stepAfter('review', { answers, photos: 2 }, 'again')).toBe('rent');
    expect(stepAfter('rent', { answers: core, photos: 2 }, 'again')).toBe('details');
  });

  it('UX-LT-5: letting details, the rent check and going live are never skipped', () => {
    const full = { answers: core, photos: 9 };
    for (const step of ['details', 'rent_check', 'go_live'] as const) {
      expect(needsAnswer(step, full)).toBe(true);
    }
    expect(stepAfter('details', full, 'advert')).toBe('rent_check');
    expect(stepAfter('rent_check', full, 'advert')).toBe('go_live');
  });

  it('UX-FL-1: Back goes to the step before, and from the first step to where the flow began', () => {
    expect(stepBefore('rent', 'manual')).toBe('address');
    expect(stepBefore('address', 'manual')).toBe('start');
    expect(stepBefore('address', 'again')).toBe('review');
    expect(stepBefore('go_live', 'manual')).toBe('rent_check');
  });
});

describe('UX-FL-2: leaving and returning lands on the same step', () => {
  it('UX-FL-2: someone who has only started comes back to the address', () => {
    expect(resumeStep(null, { answers: {}, rentCheckDone: false })).toBe('address');
  });

  it('UX-FL-2: someone who reached photos comes back to photos', () => {
    expect(resumeStep('photos', { answers: core, rentCheckDone: false })).toBe('photos');
  });

  it('UX-FL-2: a draft that arrived filled in comes back to its review until it is confirmed', () => {
    expect(resumeStep('review', { answers: core, rentCheckDone: false })).toBe('review');
  });

  it('UX-FL-2: nobody lands past something that is still missing', () => {
    const noDate = { ...address, ...home, rentCents: 185_000 };
    expect(resumeStep('details', { answers: noDate, rentCheckDone: false })).toBe('rent');
    expect(resumeStep('go_live', { answers: core, rentCheckDone: false })).toBe('rent_check');
    expect(resumeStep('go_live', { answers: core, rentCheckDone: true })).toBe('go_live');
  });

  it('UX-FL-2: how far someone has got only moves forward', () => {
    expect(furthestStep('details', 'photos')).toBe('details');
    expect(furthestStep('photos', 'details')).toBe('details');
    expect(furthestStep(null, 'photos')).toBe('photos');
  });

  it('UX-LP: the letting says how many steps are left, the one it is on included', () => {
    expect(stepsLeft('photos')).toBe(4);
    expect(stepsLeft('rent_check')).toBe(2);
    expect(stepsLeft('go_live')).toBe(1);
    expect(stepsLeft(null)).toBe(4);
  });
});

describe('UX-LT-4: the review marks what to check', () => {
  it('UX-LT-3: what wasn’t found is marked, never filled in', () => {
    expect(thingsToCheck({ answers: {}, photos: 0 }, '2026-11-16')).toEqual([
      'address',
      'rent',
      'available_from',
      'home',
      'ber',
      'photos',
    ]);
  });

  it('UX-LT-4: a complete home has nothing to check', () => {
    const answers = { ...core, berRating: 'C1' as const };
    expect(thingsToCheck({ answers, photos: 3 }, '2026-11-16')).toEqual([]);
  });

  it('UX-LT-4: a date that has passed is marked', () => {
    const answers = { ...core, berRating: 'C1' as const, availableFrom: '2026-11-01' };
    expect(thingsToCheck({ answers, photos: 3 }, '2026-11-16')).toEqual(['available_from']);
  });
});

describe('UX-LT-9 to UX-LT-11: each step reads its own answers', () => {
  it('UX-LT-9: the address step tidies the Eircode and takes an address without one', () => {
    expect(
      addressStepSchema().parse({
        addressLine1: ' 12 Ranelagh Road ',
        area: 'Ranelagh, Dublin 6',
        county: 'Dublin',
        eircode: 'd06f2x3',
      }),
    ).toEqual({
      addressLine1: '12 Ranelagh Road',
      addressLine2: undefined,
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
      eircode: 'D06 F2X3',
    });
    expect(
      addressStepSchema().safeParse({
        addressLine1: '4 Main Street',
        area: 'Navan',
        county: 'Meath',
      }).success,
    ).toBe(true);
  });

  it('UX-FL-3: an empty address step says what each field needs, in a sentence', () => {
    const result = addressStepSchema().safeParse({});
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ['addressLine1', 'Enter the first line of the address, like 12 Ranelagh Road'],
      ['area', 'Enter the area, like Ranelagh, Dublin 6'],
      ['county', 'Choose the county'],
    ]);
  });

  it('UX-LT-12: the rent step gives the rent in cents and the date', () => {
    expect(rentStepSchema(now).parse({ rent: '€1,850', availableFrom: '2026-12-13' })).toEqual({
      rentCents: 185_000,
      availableFrom: '2026-12-13',
    });
    const empty = rentStepSchema(now).safeParse({});
    expect(empty.error?.issues.map((issue) => issue.path[0])).toEqual(['rent', 'availableFrom']);
  });

  it('UX-LT-14: the home step needs a type and bedrooms, and offers the rest', () => {
    expect(homeStepSchema().parse({ propertyType: 'apartment', bedrooms: '2' })).toEqual({
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: undefined,
      furnished: undefined,
      berRating: undefined,
      parking: undefined,
      description: undefined,
      otherFacts: [],
    });
    const empty = homeStepSchema().safeParse({});
    expect(empty.error?.issues.map((issue) => issue.path[0])).toEqual([
      'propertyType',
      'bedrooms',
    ]);
  });

  it.each([
    ['Bright two-bed. Would suit a professional couple.', 'housing assistance'],
    ['Lovely home, no HAP.', 'housing assistance'],
    ['Ideal for a young family.', 'family status'],
    ['Students welcome.', 'age'],
  ])(
    'rule 3: a description that says who should apply is refused at the field: %s',
    (text, ground) => {
      const result = homeStepSchema().safeParse({
        propertyType: 'apartment',
        bedrooms: '2',
        description: text,
      });
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0]?.path).toEqual(['description']);
      expect(result.error?.issues[0]?.message).toContain(ground);
    },
  );

  it('rule 3: a description of the home passes', () => {
    const description =
      'A bright two-bed on the second floor, with a balcony facing south.\n\nFive minutes’ walk to the Luas.';
    expect(
      homeStepSchema().parse({ propertyType: 'apartment', bedrooms: '2', description })
        .description,
    ).toBe(description);
  });

  it('UX-FL-2: answers go in and come out again as a form shows them', () => {
    const answers = withAnswers(core, {
      eircode: 'D06 F2X3',
      otherFacts: ['Gas central heating', 'Bins collected on Tuesdays'],
    });
    expect(formValuesFrom(answers)).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      eircode: 'D06 F2X3',
      rent: '1,850',
      availableFrom: '2026-12-13',
      bedrooms: '2',
      bathrooms: '',
      otherFacts: 'Gas central heating\nBins collected on Tuesdays',
    });
  });

  it('UX-FL-2: an answer that is cleared is taken out, not kept as blank', () => {
    const answers = withAnswers({ ...core, berRating: 'C1' }, { berRating: undefined });
    expect('berRating' in answers).toBe(false);
    expect(withAnswers(core, { otherFacts: [] }).otherFacts).toBeUndefined();
  });

  it('UX-FL-2: "Save and exit" keeps each field that reads cleanly, and nothing else', () => {
    expect(
      partialAnswers('address', { addressLine1: '12 Ranelagh Road', area: '', eircode: 'D06' }),
    ).toEqual({ addressLine1: '12 Ranelagh Road' });
    expect(partialAnswers('rent', { rent: '1,850', availableFrom: '' }, now)).toEqual({
      rentCents: 185_000,
    });
    expect(partialAnswers('rent', { rent: 'lots', availableFrom: '2026-12-13' }, now)).toEqual({
      availableFrom: '2026-12-13',
    });
    expect(
      partialAnswers('home', { bedrooms: '2', description: 'Lovely home, no HAP.', otherFacts: '' }),
    ).toEqual({ bedrooms: 2 });
  });

  it('UX-FL-2: leaving a step empty clears nothing that was there', () => {
    const answers = withAnswers(core, partialAnswers('address', { addressLine1: '', area: '' }));
    expect(answers).toEqual(core);
  });

  it('rule 3: a draft has no field for free-text criteria or anything about a person', () => {
    expect(draftAnswersSchema.safeParse({ ...core, idealTenant: 'A quiet couple' }).success).toBe(
      false,
    );
    expect(
      draftAnswersSchema.safeParse({ ...core, criteria: { noPets: true, other: 'No students' } })
        .success,
    ).toBe(false);
  });
});

describe('UX-LT-8: a Daft or MyHome link is kept, never fetched', () => {
  it('UX-LT-8: a link pasted alone is found, and the screen can ask for the words too', () => {
    expect(advertLinksIn(' https://www.daft.ie/for-rent/apartment-12-ranelagh-road/123456 ')).toEqual(
      {
        daftUrl: 'https://www.daft.ie/for-rent/apartment-12-ranelagh-road/123456',
        alone: true,
      },
    );
    expect(advertLinksIn('https://www.myhome.ie/rentals/brochure/12-ranelagh-road/987')).toEqual({
      myhomeUrl: 'https://www.myhome.ie/rentals/brochure/12-ranelagh-road/987',
      alone: true,
    });
  });

  it('UX-LT-8: a link inside an advert’s text is kept, and the text is still there to read', () => {
    const found = advertLinksIn(
      'Bright two-bed apartment. See https://www.daft.ie/for-rent/12-ranelagh-road/123456.',
    );
    expect(found).toEqual({
      daftUrl: 'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
      alone: false,
    });
  });

  it('UX-LT-8: other links, and look-alike addresses, are not advert links', () => {
    expect(advertLinksIn('https://example.ie/daft.ie/123')).toEqual({ alone: false });
    expect(advertLinksIn('https://daft.ie.example.com/for-rent/1')).toEqual({ alone: false });
    expect(advertLinksIn('http://www.daft.ie/for-rent/1')).toEqual({ alone: false });
    expect(advertLinksIn('A two-bed in Ranelagh')).toEqual({ alone: false });
  });
});

describe('UX-LT-23: let it again', () => {
  const previous: HomeLetBefore = {
    addressLine1: '12 Ranelagh Road',
    addressLine2: null,
    area: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    eircode: 'D06 F2X3',
    monthlyRentCents: 185_000,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: 'furnished',
    berRating: 'C1',
    parking: null,
    description: 'A bright two-bed on the second floor.',
    facts: ['Gas central heating', 'Bins collected on Tuesdays'],
    criteria: { moveInBy: '2026-01-10', minStayMonths: 12, maxOccupants: 3, noPets: true },
    noSmokingIndoors: true,
  };

  it('UX-LT-23: everything about the home comes across: facts, description, details, last rent', () => {
    expect(letAgainAnswers(previous)).toEqual({
      addressLine1: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
      eircode: 'D06 F2X3',
      rentCents: 185_000,
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      furnished: 'furnished',
      berRating: 'C1',
      description: 'A bright two-bed on the second floor.',
      otherFacts: ['Gas central heating', 'Bins collected on Tuesdays'],
      criteria: { minStayMonths: 12, maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
  });

  it('UX-LT-23: last time’s dates and advert links are left for the person to give', () => {
    const again = letAgainAnswers(previous);
    expect(again.availableFrom).toBeUndefined();
    expect(again.criteria?.moveInBy).toBeUndefined();
    expect(again.daftUrl).toBeUndefined();
    expect(again.myhomeUrl).toBeUndefined();
    expect(missingCore(again)).toEqual(['rent']);
    expect(thingsToCheck({ answers: again, photos: 3 }, '2026-11-16')).toEqual(['available_from']);
  });

  it('UX-LT-23: a letting before that asked nothing carries no letting details', () => {
    const again = letAgainAnswers({ ...previous, criteria: null, noSmokingIndoors: false });
    expect(again.criteria).toBeUndefined();
    expect(again.noSmokingIndoors).toBeUndefined();
  });

  it('rule 2: what it reads has no field for a renter, a tenant or an owner', () => {
    const again = letAgainAnswers({
      ...previous,
      // Anything else on the row is not read: the function names every field it copies.
      ...({ landlordName: 'Mary Byrne', tenantName: 'Aoife Byrne' } as object),
    });
    expect(JSON.stringify(again)).not.toMatch(/Mary|Aoife/);
  });
});

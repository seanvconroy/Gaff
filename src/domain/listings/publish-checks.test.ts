import { describe, expect, it } from 'vitest';
import { publishProblems, type PublishDraft } from './publish-checks';

const ready: PublishDraft = {
  lettingStatus: 'live',
  rentCents: 250_000,
  depositCents: 250_000,
  criteriaSet: true,
  home: {
    berRating: 'C1',
    berScale: 'previous',
    berNumber: null,
    berCertificateDate: null,
    heating: 'gas',
    outdoorSpace: 'balcony',
    latitude: 53.32,
    longitude: -6.26,
    pointSource: 'letter',
  },
  pinNeeded: true,
  photosReady: 5,
  description:
    'A bright two-bedroom apartment on a quiet road, a short walk from the Luas, with a balcony and gas central heating.',
  missingChecks: [],
  declared: true,
};

describe('M48: a listing goes live only when it’s complete', () => {
  it('a complete listing has no problems', () => {
    expect(publishProblems(ready)).toEqual([]);
  });

  it('names what’s missing, and where to fix it', () => {
    const problems = publishProblems({
      ...ready,
      depositCents: null,
      photosReady: 2,
      criteriaSet: false,
      declared: false,
      missingChecks: ['identity'],
      home: { ...ready.home, heating: null },
    });
    expect(problems.map((p) => p.section)).toEqual([
      'checks',
      'home',
      'price',
      'photos',
      'criteria',
      'publish',
    ]);
  });

  it('rule 4: refuses a deposit above one month’s rent', () => {
    expect(publishProblems({ ...ready, depositCents: 250_001 })).toEqual([
      { section: 'price', message: 'The deposit can’t be more than one month’s rent' },
    ]);
  });

  it('M46, M45: blocks protected grounds and contact details in the description', () => {
    const problems = publishProblems({
      ...ready,
      description: `${ready.description} Would suit professionals. Call 087 123 4567.`,
    });
    expect(problems.map((p) => p.section)).toEqual(['description', 'description']);
  });

  it('M40: checks the BER against its scale', () => {
    expect(
      publishProblems({ ...ready, home: { ...ready.home, berScale: 'new', berRating: 'C1' } })[0],
    ).toMatchObject({ section: 'home' });
  });

  it('the workflow must be taking enquiries first', () => {
    expect(publishProblems({ ...ready, lettingStatus: 'draft' })).toEqual([
      {
        section: 'setup',
        message: 'Confirm the letting’s set-up first: viewing times, criteria and the rent check',
      },
    ]);
  });

  it('a closed letting can’t be listed', () => {
    expect(publishProblems({ ...ready, lettingStatus: 'let' })).toEqual([
      { section: 'publish', message: 'This letting is closed. Let the home again to list it.' },
    ]);
  });

  it('M38: needs the letter’s pin, never just the centre of the home’s area', () => {
    const unplaced = { ...ready, home: { ...ready.home, pointSource: 'area' as const } };
    expect(publishProblems(unplaced)).toEqual([
      {
        section: 'location',
        message: 'Place the pin on the map, so renters see where the home is',
      },
    ]);
    // The test copy's made-up homes have points of their own.
    expect(publishProblems({ ...ready, home: { ...ready.home, pointSource: 'seed' } })).toEqual([]);
  });

  it('M135: while the map is switched off, a home goes live without a pin, as before', () => {
    const unplaced = {
      ...ready,
      pinNeeded: false,
      home: { ...ready.home, pointSource: 'area' as const },
    };
    expect(publishProblems(unplaced)).toEqual([]);
    expect(
      publishProblems({ ...unplaced, home: { ...unplaced.home, latitude: null, longitude: null } }),
    ).toEqual([{ section: 'home', message: 'Confirm where the home is' }]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BURST_HOMES,
  comparableDescription,
  confirmedFindings,
  contactDetailsIn,
  contactDetailsProblem,
  hasDetailToMatch,
  hasScamWording,
  holdDueBy,
  type RiskFacts,
  riskSignalsFrom,
  signalsToHold,
} from './checks';

const now = new Date('2026-11-18T10:00:00Z'); // a Wednesday, 10am in Ireland

const clear: RiskFacts = {
  reusedPhotos: 0,
  rentCents: 185_000,
  similar: { n: 6, medianRentCents: 190_000 },
  copiedDescriptions: 0,
  account: { createdAt: new Date('2026-01-01T00:00:00Z'), homesShownLately: 1 },
  description: 'A bright two-bedroom apartment near the Luas.',
  wordingFindings: 0,
};

describe('M45: no contact details in a home’s description', () => {
  it('M45: finds emails, links, phone numbers and messaging apps', () => {
    expect(contactDetailsIn('Email mary@example.ie to view')?.what).toBe('an email address');
    expect(contactDetailsIn('More at www.myflat.ie')?.what).toBe('a web link');
    expect(contactDetailsIn('See myflat.ie for more')?.what).toBe('a web address');
    expect(contactDetailsIn('Call 087 123 4567 today')?.what).toBe('a phone number');
    expect(contactDetailsIn('Ring +353 87 123 4567')?.what).toBe('a phone number');
    expect(contactDetailsIn('Message me on WhatsApp')?.what).toBe('a messaging app');
  });

  it('M45: doesn’t mistake ordinary numbers for phone numbers', () => {
    expect(contactDetailsIn('Built in 2019, 75 square metres, 2 minutes from the 46A bus')).toBe(
      null,
    );
  });

  it('M45: says what to take out, at the field, and why', () => {
    expect(contactDetailsProblem('Call 087 123 4567')).toBe(
      'Take out a phone number. Renters enquire through Gaff, so everyone hears back and nobody is pushed off Gaff.',
    );
    expect(contactDetailsProblem('Two double bedrooms')).toBeNull();
  });
});

describe('M29: wording typical of rental scams is held, not refused', () => {
  it('M29: flags money before a viewing, keys by post and an absent landlord', () => {
    expect(hasScamWording('Send the deposit before the viewing by Western Union')).toBe(true);
    expect(hasScamWording('I am working abroad so the keys will be sent by post')).toBe(true);
    expect(hasScamWording('I’m abroad at the moment')).toBe(true);
    expect(hasScamWording('Viewings on weekday evenings. Deposit of one month’s rent.')).toBe(
      false,
    );
  });
});

describe('M29: the risk signals', () => {
  it('M29: a clear home raises nothing', () => {
    expect(riskSignalsFrom(clear, 'all', now)).toEqual([]);
  });

  it('M29: a photo on another lister’s home', () => {
    expect(riskSignalsFrom({ ...clear, reusedPhotos: 1 }, 'all', now)).toEqual(['photo_reused']);
  });

  it('M29: a rent far below similar homes, only where there are enough of them', () => {
    const cheap = { ...clear, rentCents: 100_000 };
    expect(riskSignalsFrom(cheap, 'all', now)).toEqual(['rent_far_below']);
    expect(
      riskSignalsFrom({ ...cheap, similar: { n: 4, medianRentCents: 190_000 } }, 'all', now),
    ).toEqual([]);
    expect(riskSignalsFrom({ ...cheap, similar: { n: 0, medianRentCents: null } }, 'all', now)).toEqual(
      [],
    );
    // Just above the line is fine.
    expect(riskSignalsFrom({ ...clear, rentCents: 114_000 }, 'all', now)).toEqual([]);
  });

  it('M29: a description copied from another lister', () => {
    expect(riskSignalsFrom({ ...clear, copiedDescriptions: 2 }, 'all', now)).toEqual([
      'description_copied',
    ]);
  });

  it('M29: a new account putting many homes on gaff.ie at once, and not an older one', () => {
    const young = { createdAt: new Date('2026-11-16T00:00:00Z'), homesShownLately: BURST_HOMES };
    expect(riskSignalsFrom({ ...clear, account: young }, 'all', now)).toEqual([
      'new_account_burst',
    ]);
    expect(
      riskSignalsFrom(
        { ...clear, account: { ...young, homesShownLately: BURST_HOMES - 1 } },
        'all',
        now,
      ),
    ).toEqual([]);
    expect(
      riskSignalsFrom(
        { ...clear, account: { ...young, createdAt: new Date('2026-11-01T00:00:00Z') } },
        'all',
        now,
      ),
    ).toEqual([]);
  });

  it('M29, P12: scam wording, and the AI’s finding of unfair wording', () => {
    expect(
      riskSignalsFrom({ ...clear, description: 'Pay before viewing, keys by post.' }, 'all', now),
    ).toEqual(['scam_wording']);
    expect(riskSignalsFrom({ ...clear, wordingFindings: 1 }, 'all', now)).toEqual([
      'unfair_wording',
    ]);
    // P5: no output from the model is not a finding.
    expect(riskSignalsFrom({ ...clear, wordingFindings: null }, 'all', now)).toEqual([]);
  });

  it('M48: a change looks again only at the part it touched', () => {
    const everything: RiskFacts = {
      ...clear,
      reusedPhotos: 1,
      rentCents: 50_000,
      copiedDescriptions: 1,
      wordingFindings: 1,
    };
    expect(riskSignalsFrom(everything, 'photos', now)).toEqual(['photo_reused']);
    expect(riskSignalsFrom(everything, 'rent', now)).toEqual(['rent_far_below']);
    expect(riskSignalsFrom(everything, 'words', now)).toEqual([
      'description_copied',
      'unfair_wording',
    ]);
  });

  it('M98: what a person released holds again only on new evidence', () => {
    expect(signalsToHold(['photo_reused'], 'all', ['photo_reused'])).toEqual([]);
    expect(signalsToHold(['photo_reused'], 'photos', ['photo_reused'])).toEqual(['photo_reused']);
    expect(signalsToHold(['photo_reused', 'rent_far_below'], 'all', ['photo_reused'])).toEqual([
      'rent_far_below',
    ]);
  });

  it('M97: a sign of a scam is due in 4 working hours, unfair wording alone in 1 working day', () => {
    expect(holdDueBy(['photo_reused'], now)).toEqual(new Date('2026-11-18T14:00:00Z'));
    expect(holdDueBy(['unfair_wording'], now)).toEqual(new Date('2026-11-19T10:00:00Z'));
    expect(holdDueBy(['unfair_wording', 'rent_far_below'], now)).toEqual(
      new Date('2026-11-18T14:00:00Z'),
    );
  });
});

describe('M29: photos with too little detail match nothing', () => {
  it('M29: a plain square’s hash is all zeros or all ones; a real photo’s is mixed', () => {
    expect(hasDetailToMatch(0n)).toBe(false);
    expect(hasDetailToMatch(0xffff_ffff_ffff_ffffn)).toBe(false);
    expect(hasDetailToMatch(0b1011n)).toBe(false);
    expect(hasDetailToMatch(0x0f0f_3c3c_a5a5_1234n)).toBe(true);
  });
});

describe('M29: a copied description', () => {
  it('M29: compares the words, not the spacing, case or punctuation, and only a long one', () => {
    const long = 'A bright two-bedroom apartment on the second floor. '.repeat(5);
    expect(comparableDescription(long)).toBe(
      comparableDescription(long.toUpperCase().replace(/ /g, '  ').replace(/\./g, '!')),
    );
    expect(comparableDescription('Two beds, near the Luas.')).toBeNull();
    expect(comparableDescription(null)).toBeNull();
  });
});

describe('P13: the AI’s findings count only when they are in the text', () => {
  it('P13: drops phrases that aren’t there, empty ones and repeats', () => {
    const text = 'Bright flat. Would suit a quiet professional.';
    const found = confirmedFindings(
      [
        { phrase: 'quiet professional', ground: 'age' as const },
        { phrase: 'Quiet professional', ground: 'age' as const },
        { phrase: 'no children', ground: 'family_status' as const },
        { phrase: '  ', ground: 'age' as const },
      ],
      text,
    );
    expect(found).toEqual([{ phrase: 'quiet professional', ground: 'age' }]);
  });
});

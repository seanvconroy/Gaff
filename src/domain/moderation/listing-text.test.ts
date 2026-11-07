import { describe, expect, it } from 'vitest';
import { blockingFindings, checkListingText } from './listing-text';

const kinds = (text: string) => checkListingText(text).map((f) => f.kind);

describe('M46: equality in listing text', () => {
  it('blocks wording on the protected grounds, with the reason', () => {
    const [noHap] = checkListingText('Lovely flat. No HAP.');
    expect(noHap).toMatchObject({ kind: 'protected_ground', phrase: 'HAP' });
    expect(noHap!.message).toMatch(/housing assistance/);
    expect(kinds('Would suit professionals')).toEqual(['protected_ground']);
    expect(kinds('Ideal for a mature couple')).toContain('protected_ground');
    expect(kinds('Not suitable for children')).toEqual(['protected_ground']);
  });

  it('lets ordinary property words through', () => {
    expect(kinds('Bright family bathroom and a separate family room upstairs')).toEqual([]);
    expect(kinds('Professionally managed block, close to the Luas')).toEqual([]);
    expect(kinds('Two double bedrooms, gas central heating, south-facing garden')).toEqual([]);
  });
});

describe('M45: no contact details in listing text', () => {
  it('finds emails, links, phone numbers and messaging apps', () => {
    expect(kinds('Email mary@example.ie to view')).toEqual(['contact_details']);
    expect(kinds('More at www.myflat.ie')).toEqual(['contact_details']);
    expect(kinds('Call 087 123 4567 today')).toEqual(['contact_details']);
    expect(kinds('Ring +353 87 123 4567')).toEqual(['contact_details']);
    expect(kinds('Message me on WhatsApp')).toEqual(['contact_details']);
  });

  it('doesn’t mistake ordinary numbers for phone numbers', () => {
    expect(kinds('Built in 2019, 75 square metres, 2 minutes from the 46A bus')).toEqual([]);
  });
});

describe('M29: wording typical of rental scams is held, not blocked', () => {
  it('flags money before a viewing, keys by post and an absent landlord', () => {
    expect(kinds('Send the deposit before the viewing by Western Union')).toEqual(['scam_wording']);
    expect(kinds('I am working abroad so the keys will be sent by post')).toEqual(['scam_wording']);
    expect(blockingFindings(checkListingText('Keys by post'))).toEqual([]);
  });
});

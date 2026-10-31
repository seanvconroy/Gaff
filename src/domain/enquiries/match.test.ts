import { describe, expect, it } from 'vitest';
import { isSameRenter, matchLetting } from './match';

const lettings = [
  {
    id: 'ranelagh',
    addressLine1: '12 Ranelagh Road',
    daftUrl: 'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
    myhomeUrl: null,
  },
  {
    id: 'rathmines',
    addressLine1: '112 Ranelagh Road',
    daftUrl: null,
    myhomeUrl: 'https://www.myhome.ie/rentals/brochure/112-ranelagh-road/4567890',
  },
  { id: 'cork', addressLine1: 'Apartment 4, Shandon Court', daftUrl: null, myhomeUrl: null },
];

describe('R6: matching an enquiry to a home', () => {
  it('matches by the advert link first', () => {
    expect(matchLetting({ advertId: '4567890', addressHint: null }, 'Enquiry', lettings)).toBe(
      'rathmines',
    );
  });

  it('matches by address, whole words only (12 is not 112)', () => {
    expect(
      matchLetting({ advertId: null, addressHint: '12 Ranelagh Road, Dublin 6' }, '', lettings),
    ).toBe('ranelagh');
    expect(
      matchLetting({ advertId: null, addressHint: null }, 'Enquiry: 112 Ranelagh Road', lettings),
    ).toBe('rathmines');
  });

  it('ignores accents and punctuation', () => {
    expect(
      matchLetting({ advertId: null, addressHint: 'apartment 4 shandon court' }, '', lettings),
    ).toBe('cork');
  });

  it('leaves it for the operator when there is no clear match', () => {
    expect(
      matchLetting({ advertId: '999999', addressHint: 'Somewhere else' }, '', lettings),
    ).toBeNull();
  });
});

describe('R6: the same renter across portals', () => {
  const aoife = { emailNormalised: 'aoife@example.ie', phoneE164: '+353871234567' };
  it('is the same renter by email or by phone', () => {
    expect(isSameRenter(aoife, { emailNormalised: 'aoife@example.ie', phoneE164: null })).toBe(
      true,
    );
    expect(
      isSameRenter(aoife, { emailNormalised: 'a.b@example.ie', phoneE164: '+353871234567' }),
    ).toBe(true);
    expect(isSameRenter(aoife, { emailNormalised: 'other@example.ie', phoneE164: null })).toBe(
      false,
    );
  });
});

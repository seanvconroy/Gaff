import { describe, expect, it } from 'vitest';
import {
  canWithdraw,
  ENQUIRIES_PER_DAY,
  enquiryLimitReached,
  fairUseProblem,
  readEnquiry,
} from './marketplace';

const now = new Date('2026-11-07T12:00:00Z');

describe('M76: the enquiry sheet asks only the letter’s own questions', () => {
  it('reads contact details, the answers asked for, and an optional message', () => {
    const read = readEnquiry(
      {
        fullName: ' Aoife Byrne ',
        mobile: '087 123 4567',
        message: 'Is there parking?',
        occupants: '2',
        hasPets: 'no',
        keepDetails: 'yes',
        // Not asked by these criteria, so never read:
        stayMonths: '12',
      },
      { maxOccupants: 3, noPets: true },
      now,
    );
    expect(read).toEqual({
      ok: true,
      enquiry: {
        fullName: 'Aoife Byrne',
        mobile: '087 123 4567',
        message: 'Is there parking?',
        keepDetails: true,
        answers: { occupants: 2, hasPets: false },
      },
    });
  });

  it('needs a name and the answers, and a mobile only if one is given', () => {
    const read = readEnquiry(
      { mobile: '12', occupants: '' },
      { maxOccupants: 3, noPets: false },
      now,
    );
    expect(read).toEqual({
      ok: false,
      errors: {
        fullName: expect.stringMatching(/Enter your name/),
        mobile: expect.stringMatching(/mobile number/),
        occupants: expect.stringMatching(/how many people/),
      },
    });
    expect(readEnquiry({ fullName: 'Aoife Byrne' }, { noPets: false }, now)).toMatchObject({
      ok: true,
      enquiry: { mobile: null, message: '', keepDetails: false, answers: {} },
    });
  });
});

describe('M52, M82: limits, the same for everyone', () => {
  it('closes enquiries at the number the letter set', () => {
    expect(enquiryLimitReached(199, 200)).toBe(false);
    expect(enquiryLimitReached(200, 200)).toBe(true);
    expect(enquiryLimitReached(5000, null)).toBe(false);
  });

  it('stops mass enquiries without slowing a real renter', () => {
    expect(fairUseProblem(ENQUIRIES_PER_DAY - 1)).toBeNull();
    expect(fairUseProblem(ENQUIRIES_PER_DAY)).toMatch(/tomorrow/);
  });
});

describe('M81: withdrawing an enquiry', () => {
  it('is possible until the renter is offered the home', () => {
    expect(canWithdraw('enquired')).toBe(true);
    expect(canWithdraw('booked')).toBe(true);
    expect(canWithdraw('preferred')).toBe(true);
    expect(canWithdraw('offered')).toBe(false);
    expect(canWithdraw('accepted')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
  });
});

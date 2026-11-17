import { describe, expect, it } from 'vitest';
import {
  collectedAt,
  needsCode,
  renterView,
  type RenterSituation,
  type RenterStatus,
  type RenterView,
} from './path';

const base: RenterSituation = {
  status: 'enquired',
  lettingStatus: 'live',
  questions: 2,
  answered: false,
  hasBooking: false,
  bookingCancelled: false,
  timesToBook: 3,
  placeOffered: false,
  holdRanOut: false,
  offer: null,
};
const view = (over: Partial<RenterSituation>) => renterView({ ...base, ...over });

describe('UX-PP-7: one link, and the page always shows where the renter stands now', () => {
  it('UX-RN-2: someone who hasn’t answered sees the questions; once sent, “Thanks”', () => {
    expect(view({})).toBe('questions');
    expect(view({ answered: true })).toBe('answers_sent');
    expect(view({ questions: 0 })).toBe('answers_sent');
  });

  it('UX-RN-4 (rule 1): what a renter answered never changes the page. Only a person’s decision moves them on', () => {
    // The rule takes no answers at all: there is nothing in a situation that holds one.
    expect(Object.keys(base).sort()).toEqual(
      [
        'answered',
        'bookingCancelled',
        'hasBooking',
        'holdRanOut',
        'lettingStatus',
        'offer',
        'placeOffered',
        'questions',
        'status',
        'timesToBook',
      ].sort(),
    );
  });

  it('UX-RN-5, UX-RN-8, UX-RN-9: invited, booked, and cancelled each have their own page', () => {
    expect(view({ status: 'invited' })).toBe('invited');
    expect(view({ status: 'invited', timesToBook: 0 })).toBe('no_times');
    expect(view({ status: 'booked', hasBooking: true })).toBe('booked');
    expect(view({ status: 'invited', bookingCancelled: true })).toBe('cancelled');
  });

  it('UX-RN-6, UX-RN-10: the waiting list, a place offered, and a hold that ran out', () => {
    expect(view({ status: 'waitlisted' })).toBe('waiting_list');
    expect(view({ status: 'waitlisted', placeOffered: true })).toBe('place_offered');
    expect(view({ status: 'waitlisted', holdRanOut: true })).toBe('hold_ran_out');
    // A new place beats an old hold.
    expect(view({ status: 'waitlisted', holdRanOut: true, placeOffered: true })).toBe(
      'place_offered',
    );
  });

  it('follows the path table from viewing to tenancy', () => {
    const steps: Array<[RenterStatus, RenterView]> = [
      ['not_invited', 'not_invited_yet'],
      ['attended', 'after_viewing'],
      ['no_show', 'missed_viewing'],
      ['applied', 'applied'],
      ['preferred', 'checks'],
      ['backup', 'checks'],
      ['withdrawn', 'withdrawn'],
    ];
    for (const [status, expected] of steps) expect(view({ status })).toBe(expected);
    expect(view({ status: 'offered', offer: 'open' })).toBe('offer');
    expect(view({ status: 'offered', offer: 'expired' })).toBe('offer_closed');
    expect(view({ status: 'accepted', offer: 'accepted', lettingStatus: 'let' })).toBe('tenancy');
  });

  it('an offer that ran out says it has closed; one they declined says so', () => {
    expect(view({ status: 'declined', offer: 'expired' })).toBe('offer_closed');
    expect(view({ status: 'declined', offer: 'declined' })).toBe('offer_declined');
    expect(view({ status: 'declined', offer: 'declined', lettingStatus: 'let' })).toBe(
      'offer_declined',
    );
  });

  it('once the home is let or withdrawn, everyone else sees that, whatever stage they reached', () => {
    for (const status of [
      'enquired',
      'invited',
      'booked',
      'waitlisted',
      'applied',
      'backup',
    ] as const) {
      expect(view({ status, lettingStatus: 'let' })).toBe('let_to_someone_else');
      expect(view({ status, lettingStatus: 'withdrawn' })).toBe('home_closed');
    }
    expect(view({ status: 'not_chosen', lettingStatus: 'let' })).toBe('let_to_someone_else');
  });
});

describe('UX-RN-1 (rule 2): data is collected only at its stage', () => {
  it('no page before the checks collects a document, an ID or a reference', () => {
    const early: RenterView[] = [
      'questions',
      'answers_sent',
      'invited',
      'cancelled',
      'booked',
      'waiting_list',
      'place_offered',
      'not_invited_yet',
      'after_viewing',
      'applied',
    ];
    for (const page of early) {
      expect(collectedAt[page].join(' ')).not.toMatch(/identity|document|payslip|refere|pps/i);
    }
  });

  it('employment and income are asked only when applying; the PPS number only in the tenancy', () => {
    const asking = (what: RegExp) =>
      (Object.keys(collectedAt) as RenterView[]).filter((page) =>
        collectedAt[page].some((item) => what.test(item)),
      );
    expect(asking(/income|earn/)).toEqual(['after_viewing', 'checks']);
    expect(asking(/pps/i)).toEqual(['tenancy']);
  });
});

describe('UX-RN-14, UX-SI-12: a one-time code before check results or bank details', () => {
  const application = 'aoife.byrne@example.ie';
  it('asks anyone who isn’t signed in', () => {
    expect(needsCode({ hasPass: false, signedInEmail: null, applicationEmail: application })).toBe(
      true,
    );
  });

  it('doesn’t ask again in the browser that entered the code', () => {
    expect(needsCode({ hasPass: true, signedInEmail: null, applicationEmail: application })).toBe(
      false,
    );
  });

  it('opens for a renter signed in with the same email, and for nobody else who is signed in', () => {
    expect(
      needsCode({
        hasPass: false,
        signedInEmail: 'Aoife.Byrne@example.ie ',
        applicationEmail: application,
      }),
    ).toBe(false);
    expect(
      needsCode({
        hasPass: false,
        signedInEmail: 'someone.else@example.ie',
        applicationEmail: application,
      }),
    ).toBe(true);
  });
});

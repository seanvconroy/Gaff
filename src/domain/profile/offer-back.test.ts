import { describe, expect, it } from 'vitest';
import type { RenterView } from '@/domain/renter/path';
import { NOTHING_KEPT, type KeptDetails } from './kept';
import {
  answersToOffer,
  coversEveryQuestion,
  incomeAsTyped,
  incomeToOffer,
  keepingFor,
} from './offer-back';
import { enquiryIsTheirs } from './ownership';

const kept: KeptDetails = {
  mobile: '087 123 4567',
  answers: { occupants: 2, hasPets: false, moveInDate: '2026-12-13', stayMonths: 12 },
  answersAt: new Date('2026-11-01T10:00:00Z'),
  earning: 'employed',
  monthlyIncomeCents: 520_000,
  incomeAt: new Date('2026-10-03T10:00:00Z'),
};

describe('UX-PF-3: kept answers are offered back for the questions a home asks', () => {
  it('UX-PF-3: only the questions that home asks are offered', () => {
    expect(answersToOffer(kept.answers, ['occupants', 'hasPets'], '2026-11-17')).toEqual({
      occupants: 2,
      hasPets: false,
    });
    expect(answersToOffer(kept.answers, [], '2026-11-17')).toEqual({});
  });

  it('UX-PF-3: a move-in date that has passed is asked again, not offered', () => {
    expect(answersToOffer(kept.answers, ['moveInDate', 'stayMonths'], '2027-01-05')).toEqual({
      stayMonths: 12,
    });
    expect(answersToOffer(kept.answers, ['moveInDate'], '2026-12-13')).toEqual({
      moveInDate: '2026-12-13',
    });
  });

  it('UX-PF-3: they confirm on one screen only when every question has a kept answer', () => {
    const offered = answersToOffer(kept.answers, ['occupants', 'hasPets'], '2026-11-17');
    expect(coversEveryQuestion(offered, ['occupants', 'hasPets'])).toBe(true);
    expect(coversEveryQuestion({ occupants: 2 }, ['occupants', 'hasPets'])).toBe(false);
    // A home that asks nothing has nothing to confirm.
    expect(coversEveryQuestion({}, [])).toBe(false);
  });
});

describe('UX-PF-5: income is offered back with its date, and only when applying', () => {
  it('UX-PF-5: someone who came to view is offered what they said, and when', () => {
    expect(incomeToOffer(kept, 'after_viewing')).toEqual({
      earning: 'employed',
      monthlyIncomeCents: 520_000,
      saidOn: new Date('2026-10-03T10:00:00Z'),
    });
  });

  it('rule 2: no page before the application is offered an income', () => {
    const before: RenterView[] = [
      'questions',
      'answers_sent',
      'invited',
      'booked',
      'waiting_list',
      'place_offered',
      'not_invited_yet',
      'missed_viewing',
    ];
    for (const view of before) expect(incomeToOffer(kept, view)).toBeNull();
  });

  it('UX-PF-5: someone who has applied sees their application, not their profile', () => {
    expect(incomeToOffer(kept, 'applied')).toBeNull();
  });

  it('UX-PF-5: with nothing kept, or no date, nothing is offered', () => {
    expect(incomeToOffer(NOTHING_KEPT, 'after_viewing')).toBeNull();
    expect(incomeToOffer({ ...kept, incomeAt: null }, 'after_viewing')).toBeNull();
  });

  it('the figure is offered as they would type it', () => {
    expect(incomeAsTyped(520_000)).toBe('5,200');
    expect(incomeAsTyped(320_050)).toBe('3,200.50');
  });
});

describe('UX-PF-2, UX-RN-13: what the check screen says about keeping', () => {
  it('UX-RN-13: someone with no profile here sees the one tick', () => {
    expect(keepingFor(null)).toBe('tick');
    expect(keepingFor({ theirs: false, keepsDetails: true })).toBe('tick');
  });

  it('UX-PF-2: someone with a profile keeps what they enter, unless they switched it off', () => {
    expect(keepingFor({ theirs: true, keepsDetails: true })).toBe('on');
    expect(keepingFor({ theirs: true, keepsDetails: false })).toBe('off');
  });
});

describe('UX-RH-4: whose enquiry it is', () => {
  const application = {
    applicationEmail: 'aoife.byrne@example.ie',
    hasPass: false,
    attached: false,
  };
  const aoife = { email: 'Aoife.Byrne@example.ie', emailVerified: true };

  it('UX-RH-4: signed in with the address the enquiry came from, it is theirs', () => {
    expect(enquiryIsTheirs({ ...application, person: aoife })).toBe(true);
  });

  it('UX-RH-4: nobody signed in, nothing is theirs', () => {
    expect(enquiryIsTheirs({ ...application, person: null, hasPass: true })).toBe(false);
  });

  it('UX-AC-5: a forwarded link doesn’t make someone else’s enquiry yours', () => {
    const partner = { email: 'conor@example.ie', emailVerified: true };
    expect(enquiryIsTheirs({ ...application, person: partner })).toBe(false);
    // An address nobody verified proves nothing about who holds it.
    expect(enquiryIsTheirs({ ...application, person: { ...aoife, emailVerified: false } })).toBe(
      false,
    );
  });

  it('UX-RH-4: entering the code sent to the enquiry’s address shows it is theirs', () => {
    const other = { email: 'aoife@gmail.test', emailVerified: true };
    expect(enquiryIsTheirs({ ...application, person: other, hasPass: true })).toBe(true);
  });

  it('UX-RH-4: once it is in their Enquiries it stays theirs', () => {
    const other = { email: 'aoife@gmail.test', emailVerified: true };
    expect(enquiryIsTheirs({ ...application, person: other, attached: true })).toBe(true);
  });
});

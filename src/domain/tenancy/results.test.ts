import { describe, expect, it } from 'vitest';
import {
  nextAfterLet,
  resultLines,
  timeInWords,
  usualAnswer,
  usualStillToAsk,
} from './results';

describe('UX-TN-5: the results screen', () => {
  it('UX-TN-5: states the days to let against the usual, and the time saved', () => {
    expect(resultLines({ daysToLet: 9, usualDays: 30, minutesSaved: 300 })).toEqual({
      days: '9 days from first enquiry. You usually take 30.',
      time: 'About 5 hours of your time saved.',
    });
    expect(resultLines({ daysToLet: 1, usualDays: null, minutesSaved: null })).toEqual({
      days: '1 day from first enquiry.',
      time: null,
    });
    // Nothing saved is not said as a saving.
    expect(resultLines({ daysToLet: 0, usualDays: 14, minutesSaved: 0 }).time).toBeNull();
  });

  it('UX-TN-5: time saved is rounded as a person would say it', () => {
    expect(timeInWords(3)).toBe('About 5 minutes');
    expect(timeInWords(44)).toBe('About 45 minutes');
    expect(timeInWords(61)).toBe('About an hour');
    expect(timeInWords(590)).toBe('About 10 hours');
    expect(timeInWords(100)).toBe('About 1.5 hours');
  });
});

describe('UX-TN-6: exactly one next action, in order', () => {
  it('UX-TN-6: the owner’s summary first, for an agency whose owner hasn’t seen it', () => {
    expect(nextAfterLet({ kind: 'agency', ownerHasSeenSummary: false, members: 1 })).toBe(
      'send_owner_summary',
    );
  });
  it('UX-TN-6: then inviting a colleague, for an agency of one', () => {
    expect(nextAfterLet({ kind: 'agency', ownerHasSeenSummary: true, members: 1 })).toBe(
      'invite_colleague',
    );
  });
  it('UX-TN-6: otherwise the next letting', () => {
    expect(nextAfterLet({ kind: 'agency', ownerHasSeenSummary: true, members: 3 })).toBe(
      'add_letting',
    );
    expect(nextAfterLet({ kind: 'private_landlord', ownerHasSeenSummary: false, members: 1 })).toBe(
      'add_letting',
    );
  });
});

describe('UX-TN-7: your usual, asked at the first close', () => {
  it('UX-TN-7: asks days, then hours, then nothing', () => {
    expect(usualStillToAsk({ daysToLet: null, minutesPerLetting: null })).toBe('days');
    expect(usualStillToAsk({ daysToLet: 30, minutesPerLetting: null })).toBe('hours');
    expect(usualStillToAsk({ daysToLet: 30, minutesPerLetting: 600 })).toBeNull();
  });
  it('UX-TN-7: takes only the offered answers', () => {
    expect(usualAnswer('days', '30')).toBe(30);
    expect(usualAnswer('hours', '15')).toBe(15);
    expect(usualAnswer('days', '31')).toBeNull();
    expect(usualAnswer('hours', 'lots')).toBeNull();
  });
});

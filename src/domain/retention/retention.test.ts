import { describe, expect, it } from 'vitest';
import { BACKSTOP_DAYS, deletionDateAfterClosing, isDue, unplacedEmailIsDue } from './retention';

const now = new Date('2026-12-05T03:00:00Z');

describe('R26 (basic, ADR-0005, Q3): personal data is deleted on schedule', () => {
  it('sets the deletion date 30 days after the letting closes, as an Irish date', () => {
    expect(deletionDateAfterClosing('2026-11-05', 30)).toBe('2026-12-05');
    expect(deletionDateAfterClosing('2026-12-20', 30)).toBe('2027-01-19');
  });

  it('is due on its deletion date, not before', () => {
    expect(isDue({ deleteAfter: '2026-12-05', lastEnquiredAt: now }, '2026-12-05', now)).toBe(true);
    expect(isDue({ deleteAfter: '2026-12-06', lastEnquiredAt: now }, '2026-12-05', now)).toBe(
      false,
    );
  });

  it('has a backstop for lettings nobody closed: 180 days after the last enquiry', () => {
    expect(BACKSTOP_DAYS).toBe(180);
    const old = new Date(now.getTime() - 181 * 86_400_000);
    const recent = new Date(now.getTime() - 179 * 86_400_000);
    expect(isDue({ deleteAfter: null, lastEnquiredAt: old }, '2026-12-05', now)).toBe(true);
    expect(isDue({ deleteAfter: null, lastEnquiredAt: recent }, '2026-12-05', now)).toBe(false);
  });

  it('clears emails Gaff couldn’t place 30 days after they arrived', () => {
    expect(unplacedEmailIsDue(new Date(now.getTime() - 31 * 86_400_000), 30, now)).toBe(true);
    expect(unplacedEmailIsDue(new Date(now.getTime() - 29 * 86_400_000), 30, now)).toBe(false);
  });
});

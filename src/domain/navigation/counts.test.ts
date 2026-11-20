import { describe, expect, it } from 'vitest';
import type { TodayItem } from '@/domain/dashboard/today';
import { badgeText, navCounts, needsYouWords } from './counts';

const home = { lettingId: 'l1', address: '12 Ranelagh Road', since: null, leadUserId: null };
const nowhere = { since: null, leadUserId: null };

describe('UX-NV-5: the count badges on Today and Inbox', () => {
  it('show nothing when nothing needs the user', () => {
    expect(navCounts([])).toEqual({ today: 0, inbox: 0 });
  });

  it('Inbox counts what is waiting on a reply: approvals, questions and needs attention', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', ...home, count: 3 },
      { kind: 'attention', ...nowhere, count: 1 },
      { kind: 'questions', ...home, count: 2, firstName: null },
    ];
    expect(navCounts(items).inbox).toBe(6);
  });

  it('Today is the total: everything in Inbox, and each other thing once', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', ...home, count: 3 },
      { kind: 'questions', ...home, count: 2, firstName: null },
      { kind: 'attendance', ...home, count: 4, from: null, until: null },
      { kind: 'shortlist', ...home, count: 23, placesFree: null },
      { kind: 'setup', ...home, lettingId: 'l2', address: '9 Canal View', stepsLeft: null },
    ];
    // Marking four people is one thing to do, and so is deciding on 23: neither is 4 or 23.
    expect(navCounts(items)).toEqual({ today: 8, inbox: 5 });
  });

  it('never counts one item twice inside a badge', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', ...home, count: 1 },
      { kind: 'offer', ...home },
    ];
    const counts = navCounts(items);
    expect(counts.inbox).toBe(1);
    expect(counts.today).toBe(2);
    expect(counts.today).toBeGreaterThanOrEqual(counts.inbox);
  });
});

describe('a badge in words and figures', () => {
  it('shows the figure, and "99+" past 99, so the bar never grows', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });

  it('is read out in words, never as a bare number', () => {
    expect(needsYouWords(1)).toBe('1 thing needs you');
    expect(needsYouWords(12)).toBe('12 things need you');
  });
});

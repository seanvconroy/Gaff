import { describe, expect, it } from 'vitest';
import type { TodayItem } from '@/domain/dashboard/today';
import { navCounts } from './counts';
import { inboxRows } from './inbox';

describe('UX-NV-2: approvals, questions and needs attention are handled in Inbox', () => {
  it('always lists the three, in one order, so nothing becomes unreachable', () => {
    expect(inboxRows([]).map((row) => [row.title, row.href])).toEqual([
      ['Answers to approve', '/approvals'],
      ['Questions only you can answer', '/questions'],
      ['Emails Gaff couldn’t place', '/attention'],
    ]);
  });

  it('each says how many are waiting, or that nothing is', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', count: 3 },
      { kind: 'attention', count: 1 },
      { kind: 'shortlist', lettingId: 'l1', address: '12 Ranelagh Road', count: 23 },
    ];
    expect(inboxRows(items).map((row) => [row.count, row.waiting])).toEqual([
      [3, '3 waiting'],
      [0, 'Nothing waiting'],
      [1, '1 waiting'],
    ]);
  });

  it('UX-NV-5: the three add up to the badge on Inbox', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', count: 3 },
      { kind: 'questions', count: 2 },
      { kind: 'attention', count: 1 },
      { kind: 'setup', lettingId: 'l2', address: '9 Canal View' },
    ];
    const total = inboxRows(items).reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(navCounts(items).inbox);
  });
});

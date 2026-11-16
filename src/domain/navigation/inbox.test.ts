import { describe, expect, it } from 'vitest';
import type { TodayItem } from '@/domain/dashboard/today';
import { navCounts } from './counts';
import { inboxRows } from './inbox';

const home = { lettingId: 'l1', address: '12 Ranelagh Road', since: null, leadUserId: null };
const other = { ...home, lettingId: 'l2', address: '9 Canal View' };

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
      // UX-HM-5: one item per home on Today; Inbox adds the homes up.
      { kind: 'approvals', ...home, count: 2 },
      { kind: 'approvals', ...other, count: 1 },
      { kind: 'attention', count: 1, since: null, leadUserId: null },
      { kind: 'shortlist', ...home, count: 23, placesFree: 14 },
    ];
    expect(inboxRows(items).map((row) => [row.count, row.waiting])).toEqual([
      [3, '3 waiting'],
      [0, 'Nothing waiting'],
      [1, '1 waiting'],
    ]);
  });

  it('UX-NV-5: the three add up to the badge on Inbox', () => {
    const items: TodayItem[] = [
      { kind: 'approvals', ...home, count: 3 },
      { kind: 'questions', ...home, count: 1, firstName: 'Aoife' },
      { kind: 'questions', ...other, count: 1, firstName: null },
      { kind: 'attention', count: 1, since: null, leadUserId: null },
      { kind: 'setup', ...other, stepsLeft: 2 },
    ];
    const total = inboxRows(items).reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(navCounts(items).inbox);
  });
});

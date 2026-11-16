import type { TodayItem } from '@/domain/dashboard/today';

export interface InboxRow {
  kind: 'approvals' | 'questions' | 'attention';
  title: string;
  href: string;
  count: number;
  /** "3 waiting", or "Nothing waiting". */
  waiting: string;
}

const rows = [
  { kind: 'approvals', title: 'Answers to approve', href: '/approvals' },
  { kind: 'questions', title: 'Questions only you can answer', href: '/questions' },
  { kind: 'attention', title: 'Emails Gaff couldn’t place', href: '/attention' },
] as const;

/**
 * UX-NV-2: Approvals, Questions and Needs attention stop being destinations and are handled in
 * Inbox. Until work package WP-8 builds Inbox as one list of conversations, it is these three
 * rows, each leading to the page that exists today, with how many are waiting there. Together
 * they are the figure in Inbox's badge (UX-NV-5).
 */
export function inboxRows(items: readonly TodayItem[]): InboxRow[] {
  return rows.map((row) => {
    // UX-HM-5: Today has one item per home for answers and questions; Inbox adds them up.
    const count = items.reduce((sum, item) => (item.kind === row.kind ? sum + item.count : sum), 0);
    return { ...row, count, waiting: count > 0 ? `${count} waiting` : 'Nothing waiting' };
  });
}

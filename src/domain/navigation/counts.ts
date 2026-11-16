import type { TodayItem } from '@/domain/dashboard/today';

/** What the navigation's badges show for someone running lettings. */
export interface LettingCounts {
  today: number;
  inbox: number;
}

const inboxKinds: ReadonlySet<TodayItem['kind']> = new Set(['approvals', 'questions', 'attention']);

/**
 * UX-NV-5: Today and Inbox show a count when something needs the user. Inbox counts
 * conversations that need a reply: one with an answer to approve, one with a question only a
 * person can answer, and each email Gaff couldn't place. A conversation with a draft and a
 * question is counted once (UX-NV-15; `needsYouToday` sees to it). Today is the total: all of
 * those, and each other thing that needs a person (marking who came, choosing, a deadline)
 * once. So nothing is counted twice inside a badge, and Today is never less than Inbox.
 */
export function navCounts(items: readonly TodayItem[]): LettingCounts {
  let inbox = 0;
  let others = 0;
  for (const item of items) {
    if (inboxKinds.has(item.kind) && 'count' in item) inbox += item.count;
    else others += 1;
  }
  return { today: inbox + others, inbox };
}

/** The figure in a badge. Past 99 it stops growing, so the bar keeps its shape. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** What a screen reader hears for a badge: "3 things need you". */
export function needsYouWords(count: number): string {
  return count === 1 ? '1 thing needs you' : `${count} things need you`;
}

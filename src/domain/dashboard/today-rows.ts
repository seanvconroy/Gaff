import { conversationHref, conversationKey, inboxHref } from '@/domain/inbox/conversations';
import { forwardingHref } from '@/domain/enquiries/forwarding';
import { portals } from '@/domain/lettings/setup';
import { operatorStepHref, tenancyTaskHref } from '@/domain/tenancy/operator-steps';
import type { TenancyStep } from '@/domain/tenancy/steps';
import { formatDate, formatTime, irishToday } from '@/lib/format';
import { decisionHref, stillAvailableHref } from '@/domain/lettings/links';
import { freshnessCopy } from '@/copy/freshness';
import type { TodayItem, TodayKind } from './today';

/**
 * UX-HM-3: one row of "Needs you". The first line says what the task is and which home, by its
 * address. The second says why now: a deadline, or how long someone has waited. The whole row is
 * one link to where the task is done.
 *
 * UX-HM-10: a row is built from an item, and an item holds no contact details and no message
 * text, so a row can't show any. A renter is named by first name only, and only where one person
 * asked one question.
 */
export interface TodayRow {
  /** One per kind per home, so a list can key on it. */
  key: string;
  kind: TodayKind;
  title: string;
  why: string | null;
  href: string;
  lettingId: string | null;
  /** UX-HM-11: who leads the row's home. Null for something that belongs to no home. */
  leadUserId: string | null;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const people = (n: number) => count(n, 'person', 'people');

const tenancySteps: Record<TenancyStep, string> = {
  send_agreement: 'Send the tenancy agreement',
  sign_agreement: 'Sign the tenancy agreement',
  request_payment: 'Ask for the deposit and first month’s rent',
  confirm_payment: 'Check the payment has arrived',
  finish: 'Finish and close the letting',
};

/**
 * Where each thing is done. A decision opens its focused flow (WP-17): who views, an applicant,
 * the checks that are back, and the offer. Asking the owner is reached from the offer, which
 * names it while it's missing (UX-DC-19).
 *
 * UX-NV-2: an answer to approve, a question and an email Gaff couldn't place are handled in
 * Inbox. A row about one conversation opens it, so a draft is approved in two taps: the row,
 * then Send. A row that counts several opens Inbox on "Needs you".
 */
export function todayHref(item: TodayItem): string {
  switch (item.kind) {
    case 'approvals':
    case 'questions':
      return item.only
        ? conversationHref(conversationKey({ kind: 'renter', id: item.only }))
        : inboxHref('needs-you');
    case 'attention':
      return item.only
        ? conversationHref(conversationKey({ kind: 'email', id: item.only }))
        : inboxHref('needs-you');
    case 'attendance':
      return `/lettings/${item.lettingId}/attendance`;
    case 'shortlist':
      return decisionHref(item.lettingId, 'who-views');
    case 'choose':
    case 'rechoose':
      return decisionHref(item.lettingId, 'choose');
    case 'checks':
      return decisionHref(item.lettingId, 'checks');
    case 'offer':
      return decisionHref(item.lettingId, 'offer');
    case 'tenancy':
      return tenancyTaskHref(item.lettingId, item.step);
    case 'rtb':
      return operatorStepHref(item.lettingId, 'register_rtb');
    case 'setup':
      return `/lettings/${item.lettingId}`;
    case 'forwarding':
      return forwardingHref({ lettingId: item.lettingId });
    case 'freshness':
      return stillAvailableHref(item.lettingId);
  }
}

/** "Waiting 20 minutes", "Waiting 2 hours", "Waiting 3 days". Null where Gaff doesn't know. */
export function waitingWords(since: Date | null, now: Date): string | null {
  if (!since) return null;
  const minutes = Math.floor((now.getTime() - since.getTime()) / 60_000);
  if (minutes < 1) return 'Waiting since just now';
  if (minutes < 60) return `Waiting ${count(minutes, 'minute', 'minutes')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${count(hours, 'hour', 'hours')}`;
  return `Waiting ${count(Math.floor(hours / 24), 'day', 'days')}`;
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** What the task is, without the home. */
function task(item: TodayItem, now: Date): string {
  switch (item.kind) {
    case 'attendance':
      return 'Mark who came';
    case 'shortlist':
      return 'Choose who views';
    case 'choose':
      return 'Choose an applicant';
    case 'checks':
      return item.firstName ? `The checks are back for ${item.firstName}` : 'The checks are back';
    case 'offer':
      return 'Make the offer';
    case 'rechoose':
      return 'Choose again';
    case 'tenancy':
      return tenancySteps[item.step];
    case 'rtb':
      return `Register with the RTB by ${formatDate(item.dueBy, now)}`;
    case 'approvals':
      return `Approve ${count(item.count, 'answer', 'answers')}`;
    case 'questions':
      return item.count === 1 && item.firstName
        ? `${item.firstName} asked a question`
        : `Answer ${count(item.count, 'question', 'questions')}`;
    case 'attention':
      return `${count(item.count, 'email', 'emails')} Gaff couldn’t place`;
    case 'setup':
      return 'Finish setting up';
    case 'forwarding':
      return 'Set up forwarding';
    case 'freshness':
      return freshnessCopy.today.task;
  }
}

/** Why now: a deadline, or how long someone has been waiting. */
function why(item: TodayItem, now: Date): string | null {
  switch (item.kind) {
    case 'attendance': {
      const marking = `${people(item.count)} to mark`;
      if (item.until && item.until.getTime() <= now.getTime()) {
        return `Viewings finished at ${formatTime(item.until)}. ${marking}`;
      }
      return item.from ? `Viewings started at ${formatTime(item.from)}. ${marking}` : marking;
    }
    case 'shortlist': {
      const waiting = `${people(item.count)} ${item.count === 1 ? 'is' : 'are'} waiting to hear`;
      if (item.placesFree === null) return waiting;
      return `${waiting}. ${count(item.placesFree, 'place', 'places')}`;
    }
    case 'choose':
      return `${people(item.count)} ${item.count === 1 ? 'has' : 'have'} applied`;
    case 'checks':
      return waitingWords(item.since, now);
    case 'offer':
      return 'The person you chose is waiting to hear';
    case 'rechoose':
      return item.reason === 'owner_declined'
        ? 'The owner said no'
        : item.reason === 'offer_not_accepted'
          ? 'The offer wasn’t accepted'
          : waitingWords(item.since, now);
    case 'tenancy':
      return item.startDate
        ? `The tenancy starts on ${formatDate(item.startDate, now)}`
        : waitingWords(item.since, now);
    case 'rtb': {
      const days = dayNumber(item.dueBy) - dayNumber(irishToday(now));
      if (days === 0) return 'Due today';
      if (days < 0) return `This was due ${count(-days, 'day', 'days')} ago`;
      return `${count(days, 'day', 'days')} left`;
    }
    case 'approvals':
    case 'questions':
    case 'attention':
      return waitingWords(item.since, now);
    case 'forwarding': {
      const where = item.portals.map((portal) => portals[portal]).join(' and ');
      return `Enquiries from ${where || 'Daft and MyHome'} aren’t reaching Gaff yet`;
    }
    case 'freshness':
      return item.stale || !item.stepsBackAt
        ? freshnessCopy.today.stale
        : freshnessCopy.today.asked(formatDate(item.stepsBackAt, now));
    case 'setup':
      if (item.stepsLeft === null) return null;
      return item.stepsLeft === 0
        ? 'Ready to take enquiries'
        : `${count(item.stepsLeft, 'step', 'steps')} left`;
  }
}

/**
 * The words and the link for one thing that needs a person. On Today each row names its home;
 * on the home's own page it doesn't need to (`withAddress: false`).
 */
export function todayRow(
  item: TodayItem,
  now: Date,
  options: { withAddress?: boolean } = {},
): TodayRow {
  const withAddress = options.withAddress ?? true;
  const home = 'lettingId' in item ? item : null;
  const what = task(item, now);
  return {
    key: `${item.kind}-${home?.lettingId ?? 'all'}`,
    kind: item.kind,
    title: home && withAddress ? `${what} · ${home.address}` : what,
    why: why(item, now),
    href: todayHref(item),
    lettingId: home?.lettingId ?? null,
    leadUserId: item.leadUserId,
  };
}

export function todayRows(
  items: readonly TodayItem[],
  now: Date,
  options: { withAddress?: boolean } = {},
): TodayRow[] {
  return items.map((item) => todayRow(item, now, options));
}

import type { TenancyStep } from '@/domain/tenancy/steps';

/**
 * R28, UX-HM-2: everything waiting on a person, across their homes, most urgent first. Gaff only
 * lists these; a person does each one (rule 1).
 *
 * The order is one rule, the same for everyone (UX-HM-4): `todayRank`. Things of the same kind
 * for the same home are one item with a count, never several (UX-HM-5): `needsYouToday` does the
 * grouping. An item holds IDs, counts, dates and, for one question, a first name. Never contact
 * details or the words of a message (UX-HM-10).
 */
export interface LettingSnapshot {
  id: string;
  addressLine1: string;
  status: string;
  /** UX-AG-9: the member responsible for it. See `leadOf` in `@/domain/lettings/lead`. */
  leadUserId?: string | null;
  /** UX-AG-4: a person decided to go live, and it waits for the agency to be confirmed. */
  goLiveHeld?: boolean;
  /** Stage 1: how many steps are left before it can take enquiries. */
  setupStepsLeft?: number;
  /** People who enquired and are waiting for a person to decide who views. */
  undecided: number;
  /** Places still free at the viewings to come. */
  placesFree?: number | null;
  /** People booked at a viewing that has started and who aren't marked yet. */
  toMark: number;
  /** When the first of those viewings started, and when the last of them ends. */
  toMarkFrom?: Date | null;
  toMarkUntil?: Date | null;
  /** People who applied, while nobody has been chosen yet (R17). */
  toChoose: number;
  /** R20: chosen and approved, so the offer can go. */
  readyToOffer?: boolean;
  /** R19, R20: the landlord declined, or the offer wasn't accepted and nothing else is out. */
  needsNewChoice?: boolean;
  newChoiceReason?: NewChoiceReason | null;
  /** R24: the tenancy has started and isn't registered with the RTB: the deadline. */
  rtbDueBy?: string | null;
  /** Stage 8: the operator's next step on the tenancy, if it's theirs. */
  tenancyStep?: TenancyStep | null;
  tenancyStartDate?: string | null;
  firstViewingAt: Date | null;
  /** When each thing started waiting on a person, where Gaff knows. */
  waitingSince?: Partial<Record<TodayKind, Date | null>>;
}

export type NewChoiceReason = 'owner_declined' | 'offer_not_accepted';

/** What every item carries: how long it has waited, and who leads its home. */
interface Waiting {
  /** When it started waiting on a person. Null where Gaff doesn't know. */
  since: Date | null;
  /** UX-AG-9, UX-HM-11: the home's lead. Null for something that belongs to no home. */
  leadUserId: string | null;
}

interface Home {
  lettingId: string;
  address: string;
}

export type TodayItem = Waiting &
  (
    | { kind: 'attention'; count: number }
    | (Home & { kind: 'approvals'; count: number })
    /** `firstName` is given only when one person asked one question (UX-HM-10). */
    | (Home & { kind: 'questions'; count: number; firstName: string | null })
    | (Home & { kind: 'offer' })
    | (Home & { kind: 'rechoose'; reason: NewChoiceReason | null })
    | (Home & { kind: 'rtb'; dueBy: string })
    | (Home & { kind: 'tenancy'; step: TenancyStep; startDate: string | null })
    | (Home & { kind: 'attendance'; count: number; from: Date | null; until: Date | null })
    | (Home & { kind: 'choose'; count: number })
    | (Home & { kind: 'shortlist'; count: number; placesFree: number | null })
    | (Home & { kind: 'setup'; stepsLeft: number | null })
  );

export type TodayKind = TodayItem['kind'];

/**
 * UX-HM-4: the seven ranks, in order. One rule for everyone: an agent, an admin and a private
 * landlord see their rows in the same order.
 */
export const todayRanks = {
  /** Something with a deadline today: marking who came, a registration due. */
  deadline: 1,
  /** A decision or a step only a person can make: who views, who is offered, what is signed. */
  decision: 2,
  /** A renter waiting on a reply: answers to approve. */
  reply: 3,
  /** A question only a person can answer. */
  question: 4,
  /** Email Gaff couldn't place. */
  unplaced: 5,
  /** Setup to finish on a home. */
  setup: 6,
  /** A date coming up. */
  date: 7,
} as const;

/** `today` is the date in Ireland, as "2026-11-16". */
export function todayRank(item: TodayItem, today: string): number {
  switch (item.kind) {
    case 'attendance':
      return todayRanks.deadline;
    case 'rtb':
      // On the day it's due, and after it, it is a deadline; before that, a date coming up.
      return item.dueBy <= today ? todayRanks.deadline : todayRanks.date;
    case 'choose':
    case 'offer':
    case 'rechoose':
    case 'shortlist':
    case 'tenancy':
      return todayRanks.decision;
    case 'approvals':
      return todayRanks.reply;
    case 'questions':
      return todayRanks.question;
    case 'attention':
      return todayRanks.unplaced;
    case 'setup':
      return todayRanks.setup;
  }
}

/** Inside a rank, where two things have waited equally long: this order, then by address. */
const kindOrder: readonly TodayKind[] = [
  'attendance',
  'rtb',
  'rechoose',
  'offer',
  'choose',
  'tenancy',
  'shortlist',
  'approvals',
  'questions',
  'attention',
  'setup',
];

const NEVER = Number.MAX_SAFE_INTEGER;

/**
 * Inside a rank, what comes first. Among today's deadlines, people who came to a viewing come
 * before paperwork. Among dates coming up, the nearest date. Everywhere else, whatever has
 * waited longest; something Gaff has no time for goes last.
 */
function urgency(item: TodayItem, rank: number): number {
  if (rank === todayRanks.deadline) return kindOrder.indexOf(item.kind);
  if (item.kind === 'rtb') return Date.parse(`${item.dueBy}T00:00:00Z`);
  return item.since?.getTime() ?? NEVER;
}

/** UX-HM-4: puts items in the one order. It never drops or merges anything. */
export function inTodayOrder<T extends TodayItem>(items: readonly T[], today: string): T[] {
  const address = (item: TodayItem) => ('address' in item ? item.address : '');
  const home = (item: TodayItem) => ('lettingId' in item ? item.lettingId : '');
  return [...items].sort((a, b) => {
    const rank = todayRank(a, today);
    return (
      rank - todayRank(b, today) ||
      urgency(a, rank) - urgency(b, rank) ||
      kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      address(a).localeCompare(address(b)) ||
      home(a).localeCompare(home(b))
    );
  });
}

/** One thing waiting, as the server counts it: which home, and since when. */
export interface WaitingReply {
  lettingId: string;
  since: Date;
}

export interface WaitingQuestion extends WaitingReply {
  /** Who asked, by first name only (UX-HM-10). */
  firstName?: string | null;
}

const earliest = (dates: ReadonlyArray<Date | null | undefined>): Date | null => {
  const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
  return times.length > 0 ? new Date(Math.min(...times)) : null;
};

/** UX-HM-5: things of one kind, by home. Each home gets its count and how long the oldest waited. */
function byHome<T extends WaitingReply>(waiting: readonly T[]): Map<string, T[]> {
  const homes = new Map<string, T[]>();
  for (const one of waiting) homes.set(one.lettingId, [...(homes.get(one.lettingId) ?? []), one]);
  return homes;
}

export function needsYouToday(input: {
  /** Answers Gaff drafted that wait for a person's approval (R29). */
  approvals: readonly WaitingReply[];
  /** Questions only a person can answer (R8). */
  questions: readonly WaitingQuestion[];
  /** Emails Gaff couldn't place (R5, R6). They belong to no home. */
  attention: ReadonlyArray<{ since: Date }>;
  lettings: readonly LettingSnapshot[];
  /** The date in Ireland, as "2026-11-16". It decides whether a date is today's deadline. */
  today: string;
}): TodayItem[] {
  const items: TodayItem[] = [];
  const approvals = byHome(input.approvals);
  const questions = byHome(input.questions);

  if (input.attention.length > 0) {
    items.push({
      kind: 'attention',
      count: input.attention.length,
      since: earliest(input.attention.map((a) => a.since)),
      leadUserId: null,
    });
  }

  for (const l of input.lettings) {
    const home = { lettingId: l.id, address: l.addressLine1, leadUserId: l.leadUserId ?? null };
    const since = (kind: TodayKind) => l.waitingSince?.[kind] ?? null;

    const drafts = approvals.get(l.id) ?? [];
    if (drafts.length > 0) {
      items.push({
        kind: 'approvals',
        ...home,
        count: drafts.length,
        since: earliest(drafts.map((d) => d.since)),
      });
    }
    const asked = questions.get(l.id) ?? [];
    if (asked.length > 0) {
      items.push({
        kind: 'questions',
        ...home,
        count: asked.length,
        firstName: asked.length === 1 ? (asked[0]!.firstName ?? null) : null,
        since: earliest(asked.map((q) => q.since)),
      });
    }
    if (l.toMark > 0) {
      items.push({
        kind: 'attendance',
        ...home,
        count: l.toMark,
        from: l.toMarkFrom ?? null,
        until: l.toMarkUntil ?? null,
        since: since('attendance') ?? l.toMarkFrom ?? null,
      });
    }
    if (l.tenancyStep) {
      items.push({
        kind: 'tenancy',
        ...home,
        step: l.tenancyStep,
        startDate: l.tenancyStartDate ?? null,
        since: since('tenancy'),
      });
    }
    // R24: a legal deadline.
    if (l.rtbDueBy) items.push({ kind: 'rtb', ...home, dueBy: l.rtbDueBy, since: since('rtb') });
    if (l.status === 'live') {
      if (l.toChoose > 0) {
        items.push({ kind: 'choose', ...home, count: l.toChoose, since: since('choose') });
      }
      if (l.readyToOffer) items.push({ kind: 'offer', ...home, since: since('offer') });
      if (l.needsNewChoice) {
        items.push({
          kind: 'rechoose',
          ...home,
          reason: l.newChoiceReason ?? null,
          since: since('rechoose'),
        });
      }
      if (l.undecided > 0) {
        items.push({
          kind: 'shortlist',
          ...home,
          count: l.undecided,
          placesFree: l.placesFree ?? null,
          since: since('shortlist'),
        });
      }
    }
    // A home held until its agency is confirmed waits on Gaff's team, not on this person.
    if (l.status === 'draft' && !l.goLiveHeld) {
      items.push({
        kind: 'setup',
        ...home,
        stepsLeft: l.setupStepsLeft ?? null,
        since: since('setup'),
      });
    }
  }
  return inTodayOrder(items, input.today);
}

import { lettingPageCopy } from '@/copy/letting-page';
import { hiddenCopy } from '@/copy/trust';
import type { ReportReason } from '@/domain/homes/report';
import type { HiddenStage } from '@/domain/trust/cases';
import type { TodayItem } from '@/domain/dashboard/today';
import { type TodayRow, todayRows } from '@/domain/dashboard/today-rows';
import { formatDate, formatDateTime, formatMinutes } from '@/lib/format';
import { lettingParts, partOf, partReached } from './parts';
import { stageLabels, type Stage } from './stages';

/**
 * A letting's Overview (section 4, "A letting's page"): three blocks and no more (UX-LP-1).
 *
 * - **Needs you**: one task, with the page's one primary button, or "Nothing needs you" with what
 *   Gaff is doing. The task is the item Today shows for this home, in Today's words, leading to
 *   the same flow (section 3). A blocking problem comes first (UX-LP-7): it is never a banner.
 * - **What's happening**: up to three figures for the stage, and the last three things.
 * - **What's next**: one sentence.
 *
 * The nine stages stay in the data; people see four parts (UX-LP-3). Rules only: the server
 * gathers the facts, and nothing here reads or writes anything about a person.
 */

const copy = lettingPageCopy;

export interface OverviewFacts {
  lettingId: string;
  /** The stored stage. */
  stage: Stage;
  status: string;
  /** UX-AG-4: going live waits for the agency to be confirmed, and the words that say so. */
  goLiveHeld: boolean;
  goLiveHeldWords?: string;
  setupStepsLeft: number;
  /**
   * UX-AG-2, UX-AG-6: why a home being set up can't go live, where nothing waits for it: the
   * words, and what to do about it if there is something.
   */
  goLiveBlocked: { words: string; fix: { href: string; label: string } | null } | null;
  /** Where "Continue" picks up adding the home. */
  resumeHref: string;
  /**
   * UX-TS-4, BA-9: the home is off gaff.ie after a report, and why; where it stands (held by
   * the rules for a person to check, decided, asked to look again, or final); and where the
   * lister asks Gaff to look again. Null: it isn't hidden.
   */
  hidden: {
    reason: ReportReason;
    stage: HiddenStage;
    href: string;
    /** BA-10: what took it off: a report (as before), or the checks as it went public. */
    after?: 'report' | 'check';
    /** BA-10: for a home the checks held, when a person will have looked by. */
    lookBy?: string | null;
  } | null;
  /** R3: the asking rent is above what the rent rules allow. */
  rentOverCap: boolean;
  rentCheckHref: string;
  /** Messages to renters that failed to send, and where to see them. */
  failedSends: { count: number; href: string };
  /** What Today lists for this home, in Today's order. */
  today: readonly TodayItem[];

  enquiries: number;
  answered: number;
  meetEverything: number;
  /** Viewings still to come. */
  places: number;
  booked: number;
  waitlisted: number;
  nextViewing: Date | null;
  came: number;
  applied: number;
  /** The preferred applicant, then the backup: first name, checks back and checks in all. */
  checks: ReadonlyArray<{ firstName: string; back: number; total: number }>;
  /**
   * What Gaff is waiting on someone else for (UX-DC-10, UX-DC-16), in words: one line for each
   * thing, on a line of its own.
   */
  waitingOn: string | null;
  /** The owner's answer, for a home let for an owner. Null where nobody is asked. */
  owner: 'not_asked' | 'waiting' | 'approved' | 'declined' | null;
  offer: {
    state: 'not_sent' | 'open' | 'accepted' | 'not_accepted';
    firstName: string | null;
    until: Date | null;
  };
  /** Stage 8: the operator's steps. */
  tenancy: {
    done: number;
    total: number;
    startDate: string | null;
    /** The one to do now and the one after it, by name, with where the first is done. */
    next: { name: string; href: string } | null;
    after: string | null;
    /** The tenant's turn: their first name. */
    waitingOn: string | null;
    /** Every step is done and it can be finished. */
    canFinish: boolean;
    finishHref: string;
    finished: boolean;
  } | null;
  results: { daysToLet: number | null; minutesSaved: number | null };
  /** The earliest date renters' details are deleted, for a closed letting. */
  deleteOn: string | null;
  /** That date is for applicants other than the tenant. */
  deletesOthers: boolean;
}

/**
 * The stage the page is written for. The stored stage moves on at each decision; "Shortlist" is
 * never stored, so it is the stage while people wait to hear who views and nobody is invited
 * yet. The offer can be ready, or out, while the stored stage still says Checks: it is at Offer
 * then. A tenancy whose every step is done is at Close, where "Finish" is the task.
 */
export function pageStage(
  facts: Pick<OverviewFacts, 'stage' | 'status' | 'today' | 'tenancy' | 'offer'>,
): Stage {
  if (facts.status === 'withdrawn') return 'close';
  if (
    facts.stage === 'checks' &&
    (facts.offer.state !== 'not_sent' || facts.today.some((row) => row.kind === 'offer'))
  ) {
    return 'offer';
  }
  if (facts.stage === 'enquiries' && facts.today.some((row) => row.kind === 'shortlist')) {
    return 'shortlist';
  }
  if (
    facts.stage === 'tenancy' &&
    facts.tenancy &&
    !facts.tenancy.next &&
    facts.tenancy.canFinish
  ) {
    return 'close';
  }
  return facts.stage;
}

/**
 * UX-LP-3: the four parts, and the current one's label: "Find · Viewings". Once the letting is
 * closed (`finished`), every part is done.
 */
export function progressOf(
  stage: Stage,
  finished = false,
): {
  segments: readonly string[];
  current: number;
  /** The stage inside the current part, said after its name, where it isn't the same word. */
  detail: string | undefined;
  label: string;
} {
  const part: string = lettingParts[partOf(stage)]!;
  const detail = stageLabels[stage] === part ? undefined : stageLabels[stage];
  return {
    segments: lettingParts,
    current: finished ? partReached('close') : partOf(stage),
    detail,
    label: detail ? `${part} · ${detail}` : part,
  };
}

export type NeedsYou =
  | {
      kind: 'task';
      /** Today's words for it: what, and why now. */
      lead: string;
      action: string;
      href: string;
      /** Anything else waiting on this home, as Today lists it. */
      also: readonly TodayRow[];
    }
  | { kind: 'nothing'; doing: string; also?: undefined };

function actionFor(item: TodayItem, row: TodayRow): string {
  const a = copy.actions;
  switch (item.kind) {
    case 'approvals':
      return a.approvals(item.count);
    case 'questions':
      return a.questions(item.count);
    case 'tenancy':
    case 'setup':
      return row.title;
    default:
      return a[item.kind];
  }
}

/** Today's two lines as one: the title only where the button doesn't already say it. */
function leadOf(row: TodayRow, action: string): string {
  if (row.kind === 'setup') return row.title;
  const why = row.why ? `${row.why}.` : '';
  if (row.title === action) return why || `${row.title}.`;
  return [`${row.title}.`, why].filter(Boolean).join(' ');
}

/** UX-LP-1, UX-LP-7: what needs a person on this home now. */
export function needsYouOn(facts: OverviewFacts, now: Date = new Date()): NeedsYou {
  const stage = pageStage(facts);
  const n = copy.needsYou;
  const closed = facts.status === 'withdrawn' || facts.stage === 'close';

  if (facts.status === 'draft') {
    if (facts.goLiveHeld) return { kind: 'nothing', doing: facts.goLiveHeldWords ?? n.held };
    if (facts.goLiveBlocked) {
      return facts.goLiveBlocked.fix
        ? {
            kind: 'task',
            lead: facts.goLiveBlocked.words,
            action: facts.goLiveBlocked.fix.label,
            href: facts.goLiveBlocked.fix.href,
            also: [],
          }
        : { kind: 'nothing', doing: facts.goLiveBlocked.words };
    }
    return {
      kind: 'task',
      lead: n.setup(facts.setupStepsLeft),
      action: n.continue,
      href: facts.resumeHref,
      also: [],
    };
  }
  if (closed) return { kind: 'nothing', doing: n.doing.closed };

  // UX-LP-7: a blocking problem is the task, ahead of anything else.
  const rows = todayRows(facts.today, now, { withAddress: false });
  // UX-TS-4: taken off gaff.ie after a report, the first of them: its enquiries wait for it.
  // BA-9: only a person's decision can be appealed, and only once.
  if (facts.hidden) {
    const checked = facts.hidden.after === 'check';
    if (facts.hidden.stage === 'held' && checked && facts.hidden.lookBy) {
      return { kind: 'nothing', doing: hiddenCopy.task.checking(facts.hidden.lookBy) };
    }
    if (facts.hidden.stage === 'held') return { kind: 'nothing', doing: hiddenCopy.task.held };
    if (facts.hidden.stage === 'appealed') {
      return { kind: 'nothing', doing: hiddenCopy.task.looking };
    }
    if (facts.hidden.stage === 'final') return { kind: 'nothing', doing: hiddenCopy.task.final };
    return {
      kind: 'task',
      lead: checked
        ? hiddenCopy.task.leadChecked(facts.hidden.reason)
        : hiddenCopy.task.lead(facts.hidden.reason),
      action: hiddenCopy.task.action,
      href: facts.hidden.href,
      also: rows,
    };
  }
  if (facts.rentOverCap) {
    return {
      kind: 'task',
      lead: n.rent.lead,
      action: n.rent.action,
      href: facts.rentCheckHref,
      also: rows,
    };
  }
  if (facts.failedSends.count > 0) {
    return {
      kind: 'task',
      lead: n.failed.lead(facts.failedSends.count),
      action: n.failed.action(facts.failedSends.count),
      href: facts.failedSends.href,
      also: rows,
    };
  }

  const [first, ...rest] = rows;
  if (first) {
    const action = actionFor(facts.today[0]!, first);
    return { kind: 'task', lead: leadOf(first, action), action, href: first.href, also: rest };
  }
  // Stage 8: a step Today doesn't list yet (the keys, the RTB before the start date) is still
  // the operator's to do now.
  if (facts.tenancy?.next) {
    return {
      kind: 'task',
      lead: `${facts.tenancy.next.name}.`,
      action: facts.tenancy.next.name,
      href: facts.tenancy.next.href,
      also: [],
    };
  }
  if (stage === 'close' && facts.tenancy?.canFinish && !facts.tenancy.finished) {
    return {
      kind: 'task',
      lead: 'Every step is done.',
      action: 'Finish this letting',
      href: facts.tenancy.finishHref,
      also: [],
    };
  }
  if (facts.waitingOn) return { kind: 'nothing', doing: facts.waitingOn };
  if (facts.tenancy?.waitingOn)
    return { kind: 'nothing', doing: n.waitingOn(facts.tenancy.waitingOn) };
  const doing: Record<Stage, string> = {
    setup: n.doing.setup,
    enquiries: n.doing.enquiries,
    shortlist: n.doing.enquiries,
    viewings: n.doing.viewings,
    applications: n.doing.applications,
    checks: n.doing.checks,
    offer: n.doing.offer,
    tenancy: n.doing.tenancy,
    close: n.doing.closed,
  };
  return { kind: 'nothing', doing: doing[stage] };
}

export interface Figure {
  label: string;
  value: string;
}

/** UX-LP-1: up to three figures for the stage (section 4, "The page at each stage"). */
export function figuresFor(facts: OverviewFacts, now: Date = new Date()): Figure[] {
  const f = copy.happening.figures;
  const stage = pageStage(facts);
  const number = (n: number) => String(n);
  if (facts.status === 'draft') return [];
  switch (stage) {
    case 'setup':
      return [];
    case 'enquiries':
    case 'shortlist':
      return [
        { label: f.enquiries, value: number(facts.enquiries) },
        { label: f.answered, value: number(facts.answered) },
        { label: f.meetEverything, value: number(facts.meetEverything) },
      ];
    case 'viewings':
      return [
        { label: f.booked, value: f.of(facts.booked, facts.places) },
        { label: f.waitlist, value: number(facts.waitlisted) },
        {
          label: f.nextViewing,
          value: facts.nextViewing ? formatDateTime(facts.nextViewing, now) : f.noViewing,
        },
      ];
    case 'applications':
      return [
        { label: f.came, value: number(facts.came) },
        { label: f.applied, value: number(facts.applied) },
      ];
    case 'checks':
      return facts.checks.slice(0, 3).map((person) => ({
        label: f.checks(person.firstName),
        value: f.checksDone(person.back, person.total),
      }));
    case 'offer':
      return [
        ...(facts.owner ? [{ label: f.owner, value: f.ownerState[facts.owner]! }] : []),
        {
          label: f.offer,
          // The deadline is said once, in Needs you (UX-LP-4).
          value: f.offerState(facts.offer.state),
        },
      ];
    case 'tenancy':
      return facts.tenancy
        ? [
            { label: f.steps, value: f.of(facts.tenancy.done, facts.tenancy.total) },
            // Where Today's task already says when it starts, it isn't said twice (UX-LP-4).
            ...(facts.tenancy.startDate &&
            !facts.today.some((item) => item.kind === 'tenancy' && item.startDate)
              ? [{ label: f.startDate, value: formatDate(facts.tenancy.startDate, now) }]
              : []),
          ]
        : [];
    case 'close':
      if (facts.status === 'withdrawn') return [];
      return [
        {
          label: f.daysToLet,
          value: facts.results.daysToLet === null ? f.notCounted : number(facts.results.daysToLet),
        },
        {
          label: f.timeSaved,
          value:
            facts.results.minutesSaved && facts.results.minutesSaved > 0
              ? formatMinutes(facts.results.minutesSaved)
              : f.notCounted,
        },
      ];
  }
}

/** UX-LP-1: what's next, in one sentence. */
export function whatsNext(facts: OverviewFacts): string {
  const x = copy.next;
  const stage = pageStage(facts);
  if (facts.status === 'draft') return x.setup;
  switch (stage) {
    case 'setup':
      return x.setup;
    case 'enquiries':
      return x.enquiries;
    case 'shortlist':
      return x.shortlist;
    case 'viewings':
      return x.viewings;
    case 'applications':
      return x.applications;
    case 'checks':
      return x.checks;
    case 'offer':
      return x.offer(facts.offer.firstName);
    case 'tenancy':
      return x.tenancy(facts.tenancy?.after ?? null);
    case 'close':
      if (facts.tenancy && !facts.tenancy.finished && facts.status !== 'withdrawn') return x.finish;
      return facts.deleteOn ? x.deletes(facts.deleteOn, facts.deletesOthers) : x.deleted;
  }
}

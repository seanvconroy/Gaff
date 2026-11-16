import { formatDate, formatMinutes } from '@/lib/format';
import type { Stage } from './stages';

/**
 * Lettings: a list of homes, to find one and see how it's doing at a glance (section 3).
 *
 * UX-NV-9: each home shows its cover photo, its address and one status line in words.
 * UX-NV-10: homes group under Live, Setting up and Let, each shown only when it has homes.
 * UX-NV-11: no "Step 2 of 9", no stage meter, no time in Gaff, no usual time.
 * UX-HM-9: what a letting saved is shown under each closed home, not on the home screen.
 */
export interface ListedLetting {
  id: string;
  addressLine1: string;
  status: string;
  stage: Stage;
  /** When a person closed it, as let or withdrawn. */
  closedAt: Date | null;
  /** UX-AG-4: a person decided to go live, and it waits for the agency to be confirmed. */
  goLiveHeld: boolean;
  /** Stage 1: steps left before it can take enquiries. */
  setupStepsLeft: number;
  /** Everyone who has enquired. */
  enquiries: number;
  /** Places taken, and places in all, at the viewings still to come. */
  booked: number;
  places: number;
  /** Everyone who has applied. */
  applied: number;
  readyToOffer: boolean;
  needsNewChoice: boolean;
  /** An offer is out, waiting for the renter's answer. */
  offerOut: boolean;
  tenancyStartDate: string | null;
  /** R28: days from the first enquiry to a signed tenancy, once there is one. */
  daysToLet: number | null;
  /** R28, Q15: the organisation's usual days to let, and the time this letting saved them. */
  usualDaysToLet: number | null;
  minutesSaved: number | null;
}

const some = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** UX-HM-9: "Let in 21 days · saved 9 days and 4 hours". Only what Gaff can count is said. */
function results(l: ListedLetting): string {
  const let_ = l.daysToLet === null ? 'Let' : `Let in ${some(l.daysToLet, 'day', 'days')}`;
  const daysSaved =
    l.daysToLet !== null && l.usualDaysToLet !== null ? l.usualDaysToLet - l.daysToLet : 0;
  const saved = [
    daysSaved > 0 ? some(daysSaved, 'day', 'days') : null,
    l.minutesSaved !== null && l.minutesSaved > 0 ? formatMinutes(l.minutesSaved) : null,
  ].filter((part): part is string => part !== null);
  return saved.length > 0 ? `${let_} · saved ${saved.join(' and ')}` : let_;
}

/**
 * UX-NV-9: where a home stands, in one line of words ("Viewings · 8 of 14 booked"). It never
 * says "Step 2 of 9" (UX-NV-11). `now` is only for writing a date with or without its year.
 */
export function lettingStatusLine(l: ListedLetting, now: Date): string {
  if (l.status === 'withdrawn') return 'Withdrawn';
  if (l.status === 'draft') {
    if (l.goLiveHeld) return 'Goes live when your agency is confirmed';
    return l.setupStepsLeft > 0
      ? `${some(l.setupStepsLeft, 'step', 'steps')} left`
      : 'Ready to take enquiries';
  }
  switch (l.stage) {
    case 'setup':
    case 'enquiries':
    case 'shortlist':
      return l.enquiries > 0 ? `Enquiries · ${l.enquiries} so far` : 'Enquiries · none yet';
    case 'viewings':
      return l.places > 0
        ? `Viewings · ${l.booked} of ${l.places} booked`
        : 'Viewings · no times to come';
    case 'applications':
      return l.applied > 0 ? `Applications · ${l.applied} applied` : 'Applications · none yet';
    case 'checks':
    case 'offer':
      // The offer can be ready while the stage still says checks: say what is true now.
      if (l.needsNewChoice) return 'Offer · choose again';
      if (l.offerOut) return 'Offer · waiting for an answer';
      if (l.readyToOffer) return 'Offer · ready to send';
      return l.stage === 'checks' ? 'Checks · under way' : 'Offer · under way';
    case 'tenancy':
      return l.tenancyStartDate
        ? `Tenancy · starts ${formatDate(l.tenancyStartDate, now)}`
        : 'Tenancy · getting it signed';
    case 'close':
      return results(l);
  }
}

export type LettingGroupKey = 'live' | 'setting_up' | 'let';

export const lettingGroupHeadings: Record<LettingGroupKey, string> = {
  live: 'Live',
  setting_up: 'Setting up',
  let: 'Let',
};

/** UX-NV-10: a closed home is listed for this long. Its record goes at the same age (rule 9). */
export const LISTED_MONTHS_AFTER_CLOSING = 12;

function closedLongAgo(closedAt: Date | null, now: Date): boolean {
  if (!closedAt) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - LISTED_MONTHS_AFTER_CLOSING);
  return closedAt.getTime() < cutoff.getTime();
}

/**
 * UX-NV-10: the homes under their three headings, in the order Live, Setting up, Let, leaving
 * out a heading with no homes. Inside a group the homes keep the order they came in.
 *
 * `older` is what sits under none of the three: homes taken off the market, and homes let more
 * than 12 months ago whose record hasn't been deleted yet. They wait behind a link.
 */
export function groupLettings<T extends Pick<ListedLetting, 'status' | 'closedAt'>>(
  lettings: readonly T[],
  now: Date,
): { groups: Array<{ key: LettingGroupKey; heading: string; lettings: T[] }>; older: T[] } {
  const byKey: Record<LettingGroupKey, T[]> = { live: [], setting_up: [], let: [] };
  const older: T[] = [];
  for (const letting of lettings) {
    if (letting.status === 'live') byKey.live.push(letting);
    else if (letting.status === 'draft') byKey.setting_up.push(letting);
    else if (letting.status === 'let' && !closedLongAgo(letting.closedAt, now)) {
      byKey.let.push(letting);
    } else older.push(letting);
  }
  const groups = (['live', 'setting_up', 'let'] as const)
    .filter((key) => byKey[key].length > 0)
    .map((key) => ({ key, heading: lettingGroupHeadings[key], lettings: byKey[key] }));
  return { groups, older };
}

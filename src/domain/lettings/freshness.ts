/**
 * M49 (BA-13): a live home stays fresh. A home that has had no change and no "Still available"
 * from its lister for 14 days asks them, once, on Today and in one email; if three days pass
 * after that with no answer, it steps back from Gaff's public pages and search until they
 * confirm. Its enquiries wait meanwhile, as a hidden home's do. A home with a viewing booked
 * ahead, or an offer out, is being let: it counts as fresh.
 *
 * Pure rules: the server reads the dates (src/server/lettings/freshness.ts).
 */

export interface FreshnessPolicy {
  /** Days with no change and no confirmation before the lister is asked. */
  askAfterDays: number;
  /** Days after asking, unanswered, before the home steps back. */
  graceDays: number;
}

export const defaultFreshness: FreshnessPolicy = { askAfterDays: 14, graceDays: 3 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the clock last started: going live, the lister's last change, or their last "Still available". */
export function freshSince(input: {
  liveAt: Date | null;
  confirmedAt: Date | null;
  changedAt: Date | null;
}): Date | null {
  const times = [input.liveAt, input.confirmedAt, input.changedAt]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

/** When the lister is asked: 14 days after the clock started. */
export function askDue(since: Date, policy = defaultFreshness): Date {
  return new Date(since.getTime() + policy.askAfterDays * DAY_MS);
}

/** When an unanswered home steps back: 3 days after it was asked. */
export function stepsBackAt(askedAt: Date, policy = defaultFreshness): Date {
  return new Date(askedAt.getTime() + policy.graceDays * DAY_MS);
}

/** What one live home's clock says to do now. */
export interface FreshnessFacts {
  /** `freshSince`: null for a home that never went live (it has no clock). */
  since: Date | null;
  /** When the lister was last asked. An ask from before `since` has been answered. */
  askedAt: Date | null;
  /** When it stepped back from the public pages. Null while it's on them. */
  staleAt: Date | null;
  /** A viewing booked ahead, or an offer out: the home is being let. */
  beingLet: boolean;
}

export type FreshnessStep = 'none' | 'ask' | 'step_back';

/** Whether this ask is still the open one: made after the clock last started. */
export function stillAsking(facts: Pick<FreshnessFacts, 'since' | 'askedAt'>): boolean {
  return (
    facts.askedAt !== null &&
    (facts.since === null || facts.askedAt.getTime() >= facts.since.getTime())
  );
}

/**
 * M49: the daily sweep's rule for one live home. A home that has stepped back waits for its
 * lister; one being let, or changed or confirmed in the last 14 days, needs nothing. Otherwise
 * it is asked once, and steps back 3 days after an ask nobody answered.
 */
export function freshnessStep(
  facts: FreshnessFacts,
  now: Date,
  policy = defaultFreshness,
): FreshnessStep {
  if (facts.staleAt !== null || facts.since === null || facts.beingLet) return 'none';
  if (now.getTime() < askDue(facts.since, policy).getTime()) return 'none';
  if (!stillAsking(facts)) return 'ask';
  return now.getTime() >= stepsBackAt(facts.askedAt!, policy).getTime() ? 'step_back' : 'none';
}

/** What the lister sees about it, on Today and on the letting. Null: nothing to say. */
export type FreshnessShown =
  { kind: 'asked'; stepsBackAt: Date } | { kind: 'stepped_back'; since: Date };

export function freshnessShown(
  facts: FreshnessFacts,
  policy = defaultFreshness,
): FreshnessShown | null {
  if (facts.staleAt !== null) return { kind: 'stepped_back', since: facts.staleAt };
  if (facts.beingLet || !stillAsking(facts)) return null;
  return { kind: 'asked', stepsBackAt: stepsBackAt(facts.askedAt!, policy) };
}

/**
 * The lister's own changes that restart the clock, by their event types: a change to the home
 * or its page, its rent, its viewing times or its letting details, made by a person.
 */
export const freshnessChangeEvents = [
  'letting.details_changed',
  'letting.rent_changed',
  'letting.photos_changed',
  'letting.house_rules_set',
  'letting.on_gaff_set',
  'letting.point_set',
  'viewings.session_added',
  'viewings.session_changed',
  'criteria.set',
] as const;

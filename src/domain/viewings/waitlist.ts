/**
 * R14 (open question Q2): a freed place is offered only to the waiting list a person approved
 * (R11), in ranked order, one at a time with a 2-hour hold. Within 4 hours of the viewing
 * there's no time for holds, so it goes to everyone left on the list and the first to book
 * gets it.
 */
export const HOLD_HOURS = 2;
export const OPEN_TO_ALL_HOURS = 4;

export type OfferPlan =
  { mode: 'one_at_a_time'; expiresAt: Date } | { mode: 'everyone' } | { mode: 'too_late' };

export function planOffer(slotStartsAt: Date, now: Date): OfferPlan {
  const untilStart = slotStartsAt.getTime() - now.getTime();
  if (untilStart <= 15 * 60_000) return { mode: 'too_late' };
  const openToAllAt = slotStartsAt.getTime() - OPEN_TO_ALL_HOURS * 3_600_000;
  const holdEnds = Math.min(now.getTime() + HOLD_HOURS * 3_600_000, openToAllAt);
  if (holdEnds <= now.getTime() + 15 * 60_000) return { mode: 'everyone' };
  return { mode: 'one_at_a_time', expiresAt: new Date(holdEnds) };
}

export interface OpenOffer {
  applicationId: string;
  mode: 'one_at_a_time' | 'everyone';
}

/**
 * Who to offer a slot's free places to now, best ranked first. `free` is capacity minus
 * bookings. While holds run, each open hold keeps one place, so only places nobody holds are
 * offered, one person each, skipping anyone offered this slot before or holding a place on
 * another slot. Once it's open to everyone, everyone left on the list hears, except people who
 * already hold an offer for it.
 */
export function chooseOffers<T extends { id: string; waitlistPosition: number | null }>(input: {
  plan: OfferPlan;
  free: number;
  /** Open offers for this slot. */
  open: readonly OpenOffer[];
  /** Everyone offered this slot before. */
  offered: ReadonlySet<string>;
  /** People holding an open offer for another slot of the same letting. */
  holding: ReadonlySet<string>;
  waitlisted: readonly T[];
}): T[] {
  if (input.plan.mode === 'too_late' || input.free <= 0) return [];
  const ranked = [...input.waitlisted].sort(
    (a, b) => (a.waitlistPosition ?? 999) - (b.waitlistPosition ?? 999),
  );
  if (input.plan.mode === 'everyone') {
    const holdingThis = new Set(input.open.map((o) => o.applicationId));
    return ranked.filter((p) => !holdingThis.has(p.id));
  }
  const unheld = input.free - input.open.filter((o) => o.mode === 'one_at_a_time').length;
  if (unheld <= 0) return [];
  return ranked
    .filter((p) => !input.offered.has(p.id) && !input.holding.has(p.id))
    .slice(0, unheld);
}

/**
 * Places held for someone else count as taken (R14): an offer that says "it's yours" must be
 * true. Holds only exist while offers go one at a time; once open to everyone, first to book.
 */
export function heldForOthers(open: readonly OpenOffer[], applicationId: string): number {
  return open.filter((o) => o.mode === 'one_at_a_time' && o.applicationId !== applicationId).length;
}

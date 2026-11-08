/**
 * M122: the rents in a search, in euro buckets, for the Rent filter's histogram. At most 30
 * bars; the step grows in €50s when the rents spread wide.
 */
export interface RentHistogram {
  /** The first bucket's lowest rent, in euro. */
  from: number;
  /** Each bucket's width, in euro. */
  step: number;
  counts: number[];
  /** The lowest and highest rents, in euro. */
  min: number;
  max: number;
}

const MAX_BARS = 30;

export function rentHistogram(rentsCents: readonly number[]): RentHistogram | null {
  if (rentsCents.length === 0) return null;
  const rents = rentsCents.map((c) => c / 100);
  // A loop, not Math.min(...rents): a search across Ireland can have more rents than a call
  // can take as arguments.
  let [min, max] = [Infinity, -Infinity];
  for (const rent of rents) {
    if (rent < min) min = rent;
    if (rent > max) max = rent;
  }
  const from = Math.floor(min / 100) * 100;
  const to = Math.max(from + 100, Math.ceil((max + 1) / 100) * 100);
  const step = Math.max(100, Math.ceil((to - from) / MAX_BARS / 50) * 50);
  const counts = new Array<number>(Math.ceil((to - from) / step)).fill(0);
  for (const rent of rents) {
    const i = Math.min(counts.length - 1, Math.floor((rent - from) / step));
    counts[i]!++;
  }
  return { from, step, counts, min, max };
}

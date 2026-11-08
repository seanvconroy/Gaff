import { describe, expect, it } from 'vitest';
import { rentHistogram } from './histogram';

describe('M122: rents in a search, for the Rent filter', () => {
  it('buckets rents by €100 from the lowest', () => {
    const h = rentHistogram([145_000, 175_000, 180_000, 225_000])!;
    expect(h).toMatchObject({ from: 1400, step: 100, min: 1450, max: 2250 });
    expect(h.counts).toEqual([1, 0, 0, 1, 1, 0, 0, 0, 1]);
  });

  it('widens the step to keep 30 bars or fewer', () => {
    const h = rentHistogram([50_000, 900_000])!;
    expect(h.counts.length).toBeLessThanOrEqual(30);
    expect(h.step % 50).toBe(0);
    expect(h.counts.reduce((a, b) => a + b)).toBe(2);
  });

  it('takes a search across Ireland, however many homes it has', () => {
    const rents = Array.from({ length: 200_000 }, (_, i) => 100_000 + (i % 400) * 1_000);
    const h = rentHistogram(rents)!;
    expect(h.min).toBe(1000);
    expect(h.max).toBe(4990);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(200_000);
  });

  it('has nothing to show for no homes', () => {
    expect(rentHistogram([])).toBeNull();
  });
});

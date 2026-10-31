import { describe, expect, it } from 'vitest';
import { IDLE_MINUTES, countsAsActive, daysSince, timeAgainstUsual } from './time';

const now = new Date('2026-11-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('R28 and Q15: measuring active time in Gaff', () => {
  it('counts a minute only while someone is using Gaff, stopping after 2 idle minutes', () => {
    expect(IDLE_MINUTES).toBe(2);
    expect(countsAsActive({ lastInputAt: minutesAgo(1), now, visible: true })).toBe(true);
    expect(countsAsActive({ lastInputAt: minutesAgo(2), now, visible: true })).toBe(true);
    expect(countsAsActive({ lastInputAt: minutesAgo(2.5), now, visible: true })).toBe(false);
    expect(countsAsActive({ lastInputAt: minutesAgo(0), now, visible: false })).toBe(false);
  });

  it('compares time on a letting with the operator’s usual time, when they’ve given it', () => {
    expect(timeAgainstUsual(45, 360)).toEqual({ minutes: 45, usual: 360, saved: 315 });
    expect(timeAgainstUsual(400, 360)).toEqual({ minutes: 400, usual: 360, saved: 0 });
    expect(timeAgainstUsual(45, null)).toEqual({ minutes: 45, usual: null, saved: null });
  });

  it('counts whole days since the first enquiry', () => {
    expect(daysSince(new Date('2026-11-01T09:00:00Z'), new Date('2026-11-01T20:00:00Z'))).toBe(0);
    expect(daysSince(new Date('2026-11-01T09:00:00Z'), new Date('2026-11-04T09:00:00Z'))).toBe(3);
    expect(daysSince(new Date('2026-11-04T09:00:00Z'), new Date('2026-11-01T09:00:00Z'))).toBe(0);
  });
});

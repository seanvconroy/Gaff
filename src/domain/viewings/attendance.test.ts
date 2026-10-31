import { describe, expect, it } from 'vitest';
import { attendanceOpensAt, canMarkAttendance, summariseAttendance } from './attendance';

const startsAt = new Date('2026-11-07T18:00:00Z');
const minutes = (m: number) => new Date(startsAt.getTime() + m * 60_000);

describe('R15: marking who came to a viewing', () => {
  it('opens 15 minutes before the viewing, so people arriving early can be marked', () => {
    expect(attendanceOpensAt(startsAt)).toEqual(minutes(-15));
    expect(canMarkAttendance(startsAt, minutes(-16))).toBe(false);
    expect(canMarkAttendance(startsAt, minutes(-15))).toBe(true);
    expect(canMarkAttendance(startsAt, minutes(90))).toBe(true);
  });

  it('counts who came, who didn’t, and who’s left to mark', () => {
    expect(summariseAttendance(['booked', 'attended', 'no_show', 'attended', 'booked'])).toEqual({
      attended: 2,
      noShow: 1,
      toMark: 2,
    });
    expect(summariseAttendance([])).toEqual({ attended: 0, noShow: 0, toMark: 0 });
  });
});

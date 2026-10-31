/**
 * R15: the operator marks who came, on their phone, one tap per person. Attendance decides who
 * is asked to apply (R16), so each mark is a person's decision (ADR-0007), never Gaff's.
 */

/** Marking opens a little before the viewing, for people who arrive early. */
export const ATTENDANCE_OPENS_MINUTES = 15;

export type BookingStatus = 'booked' | 'cancelled' | 'attended' | 'no_show';

export function attendanceOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - ATTENDANCE_OPENS_MINUTES * 60_000);
}

export function canMarkAttendance(startsAt: Date, now: Date): boolean {
  return now.getTime() >= attendanceOpensAt(startsAt).getTime();
}

export function summariseAttendance(statuses: readonly BookingStatus[]): {
  attended: number;
  noShow: number;
  toMark: number;
} {
  return {
    attended: statuses.filter((s) => s === 'attended').length,
    noShow: statuses.filter((s) => s === 'no_show').length,
    toMark: statuses.filter((s) => s === 'booked').length,
  };
}

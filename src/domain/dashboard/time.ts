/**
 * R28, Q15: Gaff counts active minutes while an operator is using it, stopping after 2 idle
 * minutes, and compares them with the usual time a letting takes them (their baseline from
 * the pilot interview). Operators are told their time in Gaff is measured.
 */
export const IDLE_MINUTES = 2;

export function countsAsActive(input: { lastInputAt: Date; now: Date; visible: boolean }): boolean {
  return (
    input.visible && input.now.getTime() - input.lastInputAt.getTime() <= IDLE_MINUTES * 60_000
  );
}

export function timeAgainstUsual(
  minutes: number,
  usualMinutes: number | null,
): { minutes: number; usual: number | null; saved: number | null } {
  return {
    minutes,
    usual: usualMinutes,
    saved: usualMinutes === null ? null : Math.max(0, usualMinutes - minutes),
  };
}

/** Whole days from one moment to another, for "day 3 since the first enquiry". */
export function daysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

/**
 * R12: renters book, move or cancel their own viewing. R13: confirmation, then reminders the
 * day before and two hours before (the two-hour one also by SMS, if they gave a mobile).
 */

/** A slot can't be booked once it's about to start. */
export const BOOKING_CUTOFF_MINUTES = 15;

export interface SlotAvailability {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  booked: number;
}

export function placesLeft(slot: Pick<SlotAvailability, 'capacity' | 'booked'>): number {
  return Math.max(0, slot.capacity - slot.booked);
}

/** Future slots with a place free, soonest first. */
export function bookableSlots<T extends SlotAvailability>(slots: readonly T[], now: Date): T[] {
  const cutoff = now.getTime() + BOOKING_CUTOFF_MINUTES * 60_000;
  return slots
    .filter((slot) => slot.startsAt.getTime() > cutoff && placesLeft(slot) > 0)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type ReminderKind = 'day_before' | 'two_hours';

/** R13: when reminders go, skipping any that would already be in the past. */
export function reminderTimes(
  startsAt: Date,
  now: Date,
): Array<{ kind: ReminderKind; sendAt: Date }> {
  return [
    { kind: 'day_before' as const, sendAt: new Date(startsAt.getTime() - 24 * 60 * 60_000) },
    { kind: 'two_hours' as const, sendAt: new Date(startsAt.getTime() - 2 * 60 * 60_000) },
  ].filter((reminder) => reminder.sendAt > now);
}

import { z } from 'zod';
import { irishInstant, irishToday } from '@/lib/format';

/**
 * R1 viewing times, and R12's "booked slots or capped group viewings". A session is either a
 * run of individual slots (one booking each) or one group viewing with a cap.
 */

export const slotLengths = [10, 15, 20, 30] as const;
export const MAX_GROUP_CAPACITY = 40;
const MAX_SESSION_HOURS = 6;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 18:00');

export function viewingSessionSchema(now: Date = new Date()) {
  const today = irishToday(now);
  return z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of the viewing')
        .refine((date) => date >= today, 'The viewing can’t be in the past'),
      start: time,
      end: time,
      kind: z.enum(['slots', 'group'], {
        error: 'Choose individual slots or a group viewing',
      }),
      slotMinutes: z.coerce.number().optional(),
      capacity: z.coerce.number().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.end <= value.start) {
        ctx.addIssue({
          code: 'custom',
          path: ['end'],
          message: 'The end time must be after the start time',
        });
        return;
      }
      const startsAt = irishInstant(value.date, value.start);
      const endsAt = irishInstant(value.date, value.end);
      if (startsAt <= now) {
        ctx.addIssue({
          code: 'custom',
          path: ['start'],
          message: 'The start time has already passed',
        });
      }
      if (endsAt.getTime() - startsAt.getTime() > MAX_SESSION_HOURS * 60 * 60 * 1000) {
        ctx.addIssue({
          code: 'custom',
          path: ['end'],
          message: `Keep a viewing session to ${MAX_SESSION_HOURS} hours or less`,
        });
      }
      if (value.kind === 'slots') {
        if (!slotLengths.includes(value.slotMinutes as (typeof slotLengths)[number])) {
          ctx.addIssue({
            code: 'custom',
            path: ['slotMinutes'],
            message: 'Choose how long each slot is',
          });
          return;
        }
        const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
        if (minutes < value.slotMinutes!) {
          ctx.addIssue({
            code: 'custom',
            path: ['end'],
            message: 'Leave time for at least one slot',
          });
        }
      } else if (
        !Number.isInteger(value.capacity) ||
        value.capacity! < 2 ||
        value.capacity! > MAX_GROUP_CAPACITY
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['capacity'],
          message: `Enter how many can come, from 2 to ${MAX_GROUP_CAPACITY}`,
        });
      }
    })
    .transform((value) => ({
      kind: value.kind,
      startsAt: irishInstant(value.date, value.start),
      endsAt: irishInstant(value.date, value.end),
      slotMinutes: value.kind === 'slots' ? (value.slotMinutes as number) : null,
      capacity: value.kind === 'group' ? (value.capacity as number) : null,
    }));
}

export type ViewingSession = z.output<ReturnType<typeof viewingSessionSchema>>;

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

/** The bookable slots in a session: back-to-back slots for one booking each, or one group. */
export function slotsFor(session: ViewingSession): Slot[] {
  if (session.kind === 'group') {
    return [{ startsAt: session.startsAt, endsAt: session.endsAt, capacity: session.capacity! }];
  }
  const step = session.slotMinutes! * 60_000;
  const slots: Slot[] = [];
  for (let t = session.startsAt.getTime(); t + step <= session.endsAt.getTime(); t += step) {
    slots.push({ startsAt: new Date(t), endsAt: new Date(t + step), capacity: 1 });
  }
  return slots;
}

/** Sessions on the same letting must not overlap. */
export function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

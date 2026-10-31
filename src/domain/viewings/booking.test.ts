import { describe, expect, it } from 'vitest';
import { bookableSlots, placesLeft, reminderTimes } from './booking';

const now = new Date('2026-11-05T12:00:00Z');
const slot = (id: string, startsAt: string, capacity: number, booked: number) => ({
  id,
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + 15 * 60_000),
  capacity,
  booked,
});

describe('R12: booking a viewing', () => {
  it('counts places left, never below zero', () => {
    expect(placesLeft({ capacity: 10, booked: 3 })).toBe(7);
    expect(placesLeft({ capacity: 1, booked: 2 })).toBe(0);
  });

  it('offers only future slots with a place free, soonest first', () => {
    const slots = [
      slot('full', '2026-11-07T18:00:00Z', 1, 1),
      slot('later', '2026-11-07T18:30:00Z', 1, 0),
      slot('sooner', '2026-11-07T18:15:00Z', 1, 0),
      slot('past', '2026-11-04T18:00:00Z', 1, 0),
      slot('about-to-start', '2026-11-05T12:10:00Z', 10, 0),
    ];
    expect(bookableSlots(slots, now).map((s) => s.id)).toEqual(['sooner', 'later']);
  });
});

describe('R13: reminders', () => {
  it('reminds the day before and two hours before', () => {
    expect(reminderTimes(new Date('2026-11-07T18:00:00Z'), now)).toEqual([
      { kind: 'day_before', sendAt: new Date('2026-11-06T18:00:00Z') },
      { kind: 'two_hours', sendAt: new Date('2026-11-07T16:00:00Z') },
    ]);
  });

  it('skips reminders that would already be in the past', () => {
    expect(reminderTimes(new Date('2026-11-05T20:00:00Z'), now).map((r) => r.kind)).toEqual([
      'two_hours',
    ]);
    expect(reminderTimes(new Date('2026-11-05T13:00:00Z'), now)).toEqual([]);
  });
});

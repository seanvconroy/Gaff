import { describe, expect, it } from 'vitest';
import { formatTime } from '@/lib/format';
import { overlaps, slotsFor, viewingSessionSchema } from './viewing-session';

const now = new Date('2026-10-31T12:00:00Z');
const schema = viewingSessionSchema(now);

describe('R1: viewing times', () => {
  it('turns an evening of 15-minute slots into bookable slots for one each', () => {
    const session = schema.parse({
      date: '2026-11-05',
      start: '18:00',
      end: '19:00',
      kind: 'slots',
      slotMinutes: '15',
    });
    const slots = slotsFor(session);
    expect(slots.map((s) => formatTime(s.startsAt))).toEqual(['6pm', '6:15pm', '6:30pm', '6:45pm']);
    expect(slots.every((s) => s.capacity === 1)).toBe(true);
  });

  it('makes a group viewing one slot with a cap (R12)', () => {
    const session = schema.parse({
      date: '2026-11-07',
      start: '11:00',
      end: '11:30',
      kind: 'group',
      capacity: '12',
    });
    expect(slotsFor(session)).toEqual([
      {
        startsAt: new Date('2026-11-07T11:00:00Z'),
        endsAt: new Date('2026-11-07T11:30:00Z'),
        capacity: 12,
      },
    ]);
  });

  it('leaves out a slot that would run past the end time', () => {
    const session = schema.parse({
      date: '2026-11-05',
      start: '18:00',
      end: '18:50',
      kind: 'slots',
      slotMinutes: '20',
    });
    expect(slotsFor(session)).toHaveLength(2);
  });

  it('uses Irish time, including after the clocks change', () => {
    const summer = viewingSessionSchema(new Date('2026-09-01T12:00:00Z')).parse({
      date: '2026-09-10',
      start: '18:00',
      end: '18:30',
      kind: 'group',
      capacity: '5',
    });
    expect(summer.startsAt.toISOString()).toBe('2026-09-10T17:00:00.000Z');
  });

  it.each([
    [{ date: '2026-10-30', start: '18:00', end: '19:00', kind: 'group', capacity: '5' }, 'past'],
    [
      { date: '2026-10-31', start: '09:00', end: '10:00', kind: 'group', capacity: '5' },
      'already passed',
    ],
    [
      { date: '2026-11-05', start: '19:00', end: '18:00', kind: 'group', capacity: '5' },
      'after the start',
    ],
    [{ date: '2026-11-05', start: '18:00', end: '19:00', kind: 'slots' }, 'how long each slot'],
    [
      { date: '2026-11-05', start: '18:00', end: '19:00', kind: 'slots', slotMinutes: '25' },
      'how long each slot',
    ],
    [
      { date: '2026-11-05', start: '18:00', end: '18:05', kind: 'slots', slotMinutes: '10' },
      'at least one slot',
    ],
    [
      { date: '2026-11-05', start: '18:00', end: '19:00', kind: 'group', capacity: '1' },
      'from 2 to 40',
    ],
    [
      { date: '2026-11-05', start: '18:00', end: '19:00', kind: 'group', capacity: '41' },
      'from 2 to 40',
    ],
    [{ date: '2026-11-05', start: '09:00', end: '16:00', kind: 'group', capacity: '5' }, '6 hours'],
  ])('refuses %o with a plain reason', (input, reason) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(' ')).toContain(reason);
  });

  it('spots overlapping sessions', () => {
    const a = {
      startsAt: new Date('2026-11-05T18:00:00Z'),
      endsAt: new Date('2026-11-05T19:00:00Z'),
    };
    const b = {
      startsAt: new Date('2026-11-05T18:30:00Z'),
      endsAt: new Date('2026-11-05T19:30:00Z'),
    };
    const c = {
      startsAt: new Date('2026-11-05T19:00:00Z'),
      endsAt: new Date('2026-11-05T20:00:00Z'),
    };
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(a, c)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { irishInstant } from '@/lib/format';
import {
  addTimeDefaults,
  bookedLine,
  clashes,
  FIRST_TIME_SETTINGS,
  leftToMarkLine,
  movedTo,
  needsMarking,
  newTimeLine,
  placesFor,
  placesLeftLine,
  settingsOf,
} from './calendar';

const now = new Date('2026-11-17T12:00:00Z');

describe('UX-VW-3: adding a time starts from sensible defaults', () => {
  it('UX-VW-3: a home’s first time is the next day, 6pm to 7pm, one at a time for 15 minutes', () => {
    expect(addTimeDefaults({ today: '2026-11-17', last: null, viewingDays: new Set() })).toEqual({
      date: '2026-11-18',
      start: '18:00',
      end: '19:00',
      kind: 'slots',
      slotMinutes: 15,
      capacity: 10,
    });
  });

  it('UX-VW-3: the next time opens with the last settings used, on the next day without a viewing', () => {
    const last = settingsOf({
      kind: 'group',
      startsAt: irishInstant('2026-11-18', '11:00'),
      endsAt: irishInstant('2026-11-18', '12:30'),
      slotMinutes: null,
      capacity: 12,
    });
    expect(
      addTimeDefaults({
        today: '2026-11-17',
        last,
        viewingDays: new Set(['2026-11-18', '2026-11-19']),
      }),
    ).toEqual({
      date: '2026-11-20',
      start: '11:00',
      end: '12:30',
      kind: 'group',
      slotMinutes: 15,
      capacity: 12,
    });
  });

  it('UX-VW-3: the line under the fields says how many places, and when', () => {
    expect(newTimeLine({ ...FIRST_TIME_SETTINGS, date: '2026-11-19' }, now)).toBe(
      '4 places, Thursday 19 November, 6pm to 7pm',
    );
    expect(
      newTimeLine({ ...FIRST_TIME_SETTINGS, kind: 'group', capacity: 1, date: '2026-11-19' }, now),
    ).toBe('1 place, Thursday 19 November, 6pm to 7pm');
    expect(placesFor({ ...FIRST_TIME_SETTINGS, end: '18:00' })).toBe(0);
    expect(placesFor({ ...FIRST_TIME_SETTINGS, slotMinutes: 20, end: '19:30' })).toBe(4);
  });
});

describe('UX-VW-6: a viewing time in words', () => {
  it('UX-VW-6: says how many are booked, and who’s waiting once it’s full', () => {
    expect(bookedLine({ booked: 6, places: 8, waiting: 3 })).toBe('6 of 8 booked');
    expect(bookedLine({ booked: 8, places: 8, waiting: 3 })).toBe('8 of 8 booked · 3 waiting');
    expect(bookedLine({ booked: 8, places: 8, waiting: 0 })).toBe('8 of 8 booked');
    expect(placesLeftLine(2)).toBe('2 places left');
    expect(placesLeftLine(1)).toBe('1 place left');
    expect(placesLeftLine(0)).toBe('No places left');
  });
});

describe('UX-VW-7: a new time that overlaps another the same person leads', () => {
  const other = {
    id: 'other',
    startsAt: irishInstant('2026-11-19', '18:30'),
    endsAt: irishInstant('2026-11-19', '19:30'),
  };
  it('UX-VW-7: finds the overlap, and nothing that only touches it', () => {
    const at = (start: string, end: string) => ({
      startsAt: irishInstant('2026-11-19', start),
      endsAt: irishInstant('2026-11-19', end),
    });
    expect(clashes(at('18:00', '19:00'), [other])).toEqual([other]);
    expect(clashes(at('17:30', '18:30'), [other])).toEqual([]);
    expect(clashes(at('19:30', '20:00'), [other])).toEqual([]);
  });
});

describe('UX-VW-6: moving a time people have booked', () => {
  const current = {
    startsAt: irishInstant('2026-11-19', '18:00'),
    endsAt: irishInstant('2026-11-19', '19:15'),
  };
  it('UX-VW-6: keeps its length, so each booking keeps its place', () => {
    expect(movedTo(current, '11:00')).toEqual({ start: '11:00', end: '12:15' });
  });
  it('UX-VW-6: can’t run past midnight', () => {
    expect(movedTo(current, '23:00')).toBeNull();
  });
});

describe('UX-VW-10, UX-VW-11: marking who came', () => {
  const startsAt = new Date('2026-11-17T18:00:00Z');
  it('UX-VW-10: offers "Mark who came" from 15 minutes before, while anyone is left to mark', () => {
    expect(needsMarking({ startsAt, toMark: 2 }, new Date('2026-11-17T17:44:00Z'))).toBe(false);
    expect(needsMarking({ startsAt, toMark: 2 }, new Date('2026-11-17T17:45:00Z'))).toBe(true);
    expect(needsMarking({ startsAt, toMark: 0 }, new Date('2026-11-17T19:00:00Z'))).toBe(false);
  });
  it('UX-VW-11: one line says how many are left', () => {
    expect(leftToMarkLine(3)).toBe('3 left to mark.');
    expect(leftToMarkLine(1)).toBe('1 left to mark.');
    expect(leftToMarkLine(0)).toBe('Everyone is marked.');
  });
});

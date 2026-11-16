import { describe, expect, it } from 'vitest';
import {
  chosenDay,
  chosenTime,
  directionsHref,
  holdEndsInWords,
  mapsPlatform,
  reminderNumber,
  viewingCalendarFile,
  viewingDays,
} from './choosing';

// Monday 16 November 2026, 10am in Ireland (winter time: the same as UTC).
const now = new Date('2026-11-16T10:00:00Z');
const slot = (id: string, startsAt: string, capacity = 1, booked = 0) => ({
  id,
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + 15 * 60_000),
  capacity,
  booked,
});

describe('UX-RN-5: booking is a day, then a time, then confirm', () => {
  const slots = [
    slot('b', '2026-11-20T18:15:00Z'),
    slot('a', '2026-11-20T18:00:00Z'),
    slot('full', '2026-11-20T18:30:00Z', 1, 1),
    slot('c', '2026-11-21T11:00:00Z', 8, 5),
    slot('gone', '2026-11-16T10:10:00Z'),
  ];

  it('groups the free times by day, soonest first, and leaves out full and past ones', () => {
    const days = viewingDays(slots, now);
    expect(days.map((day) => [day.date, day.label, day.short])).toEqual([
      ['2026-11-20', 'Friday 20 November', 'Fri 20 Nov'],
      ['2026-11-21', 'Saturday 21 November', 'Sat 21 Nov'],
    ]);
    expect(days[0]!.times.map((time) => [time.slotId, time.label])).toEqual([
      ['a', '6pm'],
      ['b', '6:15pm'],
    ]);
  });

  it('says how many places a group viewing has left', () => {
    expect(viewingDays(slots, now)[1]!.times[0]!.note).toBe('Group viewing, 3 places left');
    expect(viewingDays([slot('one', '2026-11-21T11:00:00Z', 4, 3)], now)[0]!.times[0]!.note).toBe(
      'Group viewing, 1 place left',
    );
  });

  it('groups by the Irish day, not the UTC one', () => {
    // 11:30pm UTC on 30 June is half past midnight on 1 July in Ireland.
    const summer = viewingDays([slot('late', '2027-06-30T23:30:00Z')], now);
    expect(summer[0]!.date).toBe('2027-07-01');
  });

  it('shows the first day’s times until a day is chosen, and ignores a day with nothing free', () => {
    const days = viewingDays(slots, now);
    expect(chosenDay(days)?.date).toBe('2026-11-20');
    expect(chosenDay(days, '2026-11-21')?.date).toBe('2026-11-21');
    expect(chosenDay(days, '2026-12-25')?.date).toBe('2026-11-20');
    expect(chosenDay([], '2026-11-21')).toBeNull();
  });

  it('States: a time that was just taken can’t be confirmed', () => {
    const days = viewingDays(slots, now);
    expect(chosenTime(days, 'b')?.time.label).toBe('6:15pm');
    expect(chosenTime(days, 'full')).toBeNull();
    expect(chosenTime(days, null)).toBeNull();
  });
});

describe('UX-RN-10: a held place says when the hold ends, in words', () => {
  it('today, tomorrow, then the day by name', () => {
    expect(holdEndsInWords(new Date('2026-11-16T20:40:00Z'), now)).toBe('until 8:40pm today');
    expect(holdEndsInWords(new Date('2026-11-17T09:00:00Z'), now)).toBe('until 9am tomorrow');
    expect(holdEndsInWords(new Date('2026-11-20T09:00:00Z'), now)).toBe(
      'until Friday 20 November, 9am',
    );
  });

  it('reads the clock in Ireland', () => {
    // 11:30pm UTC in summer is 12:30am the next day in Ireland.
    const summerNow = new Date('2027-06-30T12:00:00Z');
    expect(holdEndsInWords(new Date('2027-06-30T23:30:00Z'), summerNow)).toBe(
      'until 12:30am tomorrow',
    );
  });
});

describe('UX-RN-7 (Q12): the mobile number is never filled in from the enquiry', () => {
  it('shows back only a number the renter gave for reminders', () => {
    expect(reminderNumber({ phone: '087 123 4567', smsReminders: false })).toBeNull();
    expect(reminderNumber({ phone: '087 123 4567', smsReminders: true })).toBe('087 123 4567');
    expect(reminderNumber({ phone: null, smsReminders: true })).toBeNull();
  });
});

describe('UX-RN-8: the booked page’s two actions', () => {
  it('“Add to my calendar” is one event: when, where and who lets the home, and nothing about the renter', () => {
    const file = viewingCalendarFile({
      bookingId: '0f1e2d3c',
      startsAt: new Date('2026-11-20T18:15:00Z'),
      endsAt: new Date('2026-11-20T18:30:00Z'),
      address: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      listerName: 'Halcyon Lettings',
      now,
    });
    expect(file.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gaff//Viewing//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:viewing-0f1e2d3c@gaff.ie',
      'DTSTAMP:20261116T100000Z',
      'DTSTART:20261120T181500Z',
      'DTEND:20261120T183000Z',
      'SUMMARY:Viewing: 12 Ranelagh Road',
      'LOCATION:12 Ranelagh Road\\, Ranelagh\\, Dublin 6',
      'DESCRIPTION:Viewing with Halcyon Lettings.',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
    expect(file).not.toMatch(/@example|\/r\//);
  });

  it('“Get directions” opens the phone’s own maps app, and OpenStreetMap anywhere else', () => {
    const address = '12 Ranelagh Road, Ranelagh, Dublin 6';
    const place = '12%20Ranelagh%20Road%2C%20Ranelagh%2C%20Dublin%206';
    expect(directionsHref(address, 'ios')).toBe(`maps://?daddr=${place}`);
    expect(directionsHref(address, 'android')).toBe(`geo:0,0?q=${place}`);
    expect(directionsHref(address, 'other')).toBe(
      `https://www.openstreetmap.org/search?query=${place}`,
    );
    expect(mapsPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(mapsPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(mapsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)')).toBe('other');
  });
});

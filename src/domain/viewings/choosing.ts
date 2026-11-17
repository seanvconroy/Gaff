import { formatDate, formatShortDay, formatTime, irishToday } from '@/lib/format';
import { bookableSlots, placesLeft, type SlotAvailability } from './booking';

/**
 * UX-RN-5 to UX-RN-10: how a renter chooses a viewing. The pattern people know from Calendly:
 * pick a day, pick a time, confirm. These rules turn the free viewing times into days and the
 * times on each, and say in words when a held place stops being theirs.
 */

export interface ViewingTime {
  slotId: string;
  startsAt: Date;
  /** "6:15pm" */
  label: string;
  /** For a group viewing: "Group viewing, 3 places left". */
  note: string | null;
}

export interface ViewingDay {
  /** The Irish calendar day, "2026-11-20": what the page's address holds. */
  date: string;
  /** "Friday 20 November" */
  label: string;
  /** "Fri 20 Nov", for the short row of days. */
  short: string;
  times: ViewingTime[];
}

/** The days that still have a place, soonest first, each with its free times in order. */
export function viewingDays(
  slots: readonly SlotAvailability[],
  now: Date = new Date(),
): ViewingDay[] {
  const days = new Map<string, ViewingDay>();
  for (const slot of bookableSlots(slots, now)) {
    const date = irishToday(slot.startsAt);
    const day = days.get(date) ?? {
      date,
      label: formatDate(slot.startsAt, now),
      short: formatShortDay(slot.startsAt),
      times: [],
    };
    day.times.push({
      slotId: slot.id,
      startsAt: slot.startsAt,
      label: formatTime(slot.startsAt),
      note:
        slot.capacity > 1
          ? `Group viewing, ${placesLeft(slot)} ${placesLeft(slot) === 1 ? 'place' : 'places'} left`
          : null,
    });
    days.set(date, day);
  }
  return [...days.values()];
}

/**
 * Which day's times to show: the one asked for, if it still has a place; otherwise the first.
 * Null when no time is free at all.
 */
export function chosenDay(days: readonly ViewingDay[], asked?: string | null): ViewingDay | null {
  return days.find((day) => day.date === asked) ?? days[0] ?? null;
}

/** The time asked for, if it's still free: the confirm step is for this one. */
export function chosenTime(
  days: readonly ViewingDay[],
  slotId?: string | null,
): { day: ViewingDay; time: ViewingTime } | null {
  for (const day of days) {
    const time = day.times.find((each) => each.slotId === slotId);
    if (time) return { day, time };
  }
  return null;
}

/**
 * UX-RN-10: when a hold ends, in words: "until 8:40pm today", "until 9am tomorrow", and beyond
 * that the day by name, "until Friday 20 November, 9am".
 */
export function holdEndsInWords(expiresAt: Date, now: Date = new Date()): string {
  const day = irishToday(expiresAt);
  if (day === irishToday(now)) return `until ${formatTime(expiresAt)} today`;
  if (day === irishToday(new Date(now.getTime() + 24 * 60 * 60 * 1000))) {
    return `until ${formatTime(expiresAt)} tomorrow`;
  }
  return `until ${formatDate(expiresAt, now)}, ${formatTime(expiresAt)}`;
}

/**
 * UX-RN-7 (Q12): the mobile number for a text reminder is asked once, and only a number the
 * renter gave for reminders is ever shown back. A number that came with their enquiry is never
 * filled in.
 */
export function reminderNumber(application: {
  phone: string | null;
  smsReminders: boolean;
}): string | null {
  return application.smsReminders && application.phone ? application.phone : null;
}

/**
 * UX-RN-8: "Add to my calendar". One calendar file for the viewing: when, where, and who lets
 * the home. It holds nothing about the renter and no link to their page.
 */
export function viewingCalendarFile(viewing: {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  address: string;
  area: string;
  listerName: string;
  now?: Date;
}): string {
  return calendarFile({
    uid: `viewing-${viewing.bookingId}@gaff.ie`,
    startsAt: viewing.startsAt,
    endsAt: viewing.endsAt,
    summary: `Viewing: ${viewing.address}`,
    location: `${viewing.address}, ${viewing.area}`,
    description: `Viewing with ${viewing.listerName}.`,
    now: viewing.now,
  });
}

/**
 * UX-VW-8: "Add to my calendar" on a viewing time, for the person running it. When and where,
 * and how many had booked when it was saved. Nobody's name or details: a calendar app keeps it
 * outside Gaff. The same viewing time keeps the same UID, so saving it again updates it.
 */
export function viewingTimeCalendarFile(viewing: {
  sessionId: string;
  startsAt: Date;
  endsAt: Date;
  address: string;
  area: string;
  booked: number;
  places: number;
  now?: Date;
}): string {
  return calendarFile({
    uid: `viewing-time-${viewing.sessionId}@gaff.ie`,
    startsAt: viewing.startsAt,
    endsAt: viewing.endsAt,
    summary: `Viewing: ${viewing.address}`,
    location: `${viewing.address}, ${viewing.area}`,
    description: `${viewing.booked} of ${viewing.places} booked. See who in Gaff.`,
    now: viewing.now,
  });
}

/** One event as a standard calendar file (RFC 5545), which any phone's calendar opens. */
function calendarFile(event: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location: string;
  description: string;
  now?: Date;
}): string {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  const text = (value: string) =>
    value
      .replace(/\\/g, '\\\\')
      .replace(/([,;])/g, '\\$1')
      .replace(/\r?\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gaff//Viewing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${text(event.summary)}`,
    `LOCATION:${text(event.location)}`,
    `DESCRIPTION:${text(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export type MapsPlatform = 'ios' | 'android' | 'other';

/** Which maps app a device has of its own, from what its browser says it is. */
export function mapsPlatform(userAgent: string): MapsPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

/**
 * UX-RN-8: "Get directions" opens the phone's own maps app at the home's address. Anywhere
 * else it opens OpenStreetMap. Only the home's address goes in the link: nothing about anyone.
 */
export function directionsHref(address: string, platform: MapsPlatform): string {
  const place = encodeURIComponent(address);
  if (platform === 'ios') return `maps://?daddr=${place}`;
  if (platform === 'android') return `geo:0,0?q=${place}`;
  return `https://www.openstreetmap.org/search?query=${place}`;
}

import { formatDateTime, formatTime } from '@/lib/format';

/** R12, R13: fixed wording about a booked viewing. Gaff fills in names, times and links. */
export const BOOKING_CONFIRMATION_TEMPLATE = 'booking_confirmation@1';
export const REMINDER_TEMPLATE = 'reminder@1';
export const REMINDER_SMS_TEMPLATE = 'reminder_sms@1';

function hello(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

interface Viewing {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  startsAt: Date;
  manageUrl: string;
}

export function bookingConfirmationEmail(input: Viewing & { rescheduled: boolean }) {
  return {
    subject: `Viewing booked: ${input.address}, ${formatDateTime(input.startsAt)}`,
    body: [
      hello(input.renterName),
      '',
      `${input.rescheduled ? 'Your viewing has moved. It’s now' : 'You’re booked to view'} ${input.address}, ${input.area}, on ${formatDateTime(input.startsAt)}.`,
      '',
      'We’ll remind you the day before. If you can’t make it, please change or cancel your time here, so someone else can have the place:',
      input.manageUrl,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

export function reminderEmail(input: Viewing & { when: 'day_before' | 'two_hours' }) {
  const lead =
    input.when === 'day_before'
      ? `A reminder that you’re viewing ${input.address}, ${input.area}, tomorrow at ${formatTime(input.startsAt)}.`
      : `A reminder that you’re viewing ${input.address}, ${input.area}, today at ${formatTime(input.startsAt)}.`;
  return {
    subject: `Reminder: viewing ${input.address}, ${formatDateTime(input.startsAt)}`,
    body: [
      hello(input.renterName),
      '',
      lead,
      '',
      'If you can’t make it, please change or cancel your time here, so someone else can have the place:',
      input.manageUrl,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

/** SMS: short, and says who it's from. */
export function reminderSms(
  input: Pick<Viewing, 'operatorName' | 'address' | 'startsAt' | 'manageUrl'>,
) {
  return `${input.operatorName}: reminder, you're viewing ${input.address} today at ${formatTime(input.startsAt)}. Can't make it? Change or cancel: ${input.manageUrl}`;
}

export const PLACE_OFFERED_TEMPLATE = 'place_offered@1';

/** R14: a freed place for someone on the waiting list. */
export function placeOfferedEmail(input: Viewing & { everyone: boolean; holdUntil: Date | null }) {
  return {
    subject: `A viewing place has opened up: ${input.address}`,
    body: [
      hello(input.renterName),
      '',
      `A place has opened up to view ${input.address}, ${input.area}, on ${formatDateTime(input.startsAt)}.`,
      '',
      input.everyone
        ? 'It’s been offered to everyone on the waiting list, and the first person to book it gets it:'
        : `It’s yours if you’d like it. Please book by ${formatDateTime(input.holdUntil!)} here:`,
      input.manageUrl,
      '',
      'If you can’t make it, there’s nothing to do. Either way, you’ll hear back from us.',
      '',
      input.operatorName,
    ].join('\n'),
  };
}

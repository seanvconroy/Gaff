import { formatDate, formatTimeRange } from '@/lib/format';

/**
 * R11: fixed wording sent when the operator decides who views (a person's decision). Gaff only
 * fills in names, dates and links. Everyone hears back (open question Q6).
 */
export const INVITATION_TEMPLATE = 'invitation@1';
export const WAITLISTED_TEMPLATE = 'waitlisted@1';
export const HOLDING_TEMPLATE = 'holding@1';

function hello(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

interface Base {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
}

export function invitationEmail(
  input: Base & { bookingUrl: string; sessions: Array<{ startsAt: Date; endsAt: Date }> },
) {
  return {
    subject: `Book a viewing: ${input.address}`,
    body: [
      hello(input.renterName),
      '',
      `${input.operatorName} would like to invite you to view ${input.address}, ${input.area}.`,
      '',
      'Book a time that suits you here. You don’t need an account:',
      input.bookingUrl,
      '',
      'Viewing times:',
      ...input.sessions.map(
        (s) => `- ${formatDate(s.startsAt)}, ${formatTimeRange(s.startsAt, s.endsAt)}`,
      ),
      '',
      'If none of these times work, reply to this email and let us know. We’ll send you a reminder the day before your viewing.',
      '',
      input.operatorName,
    ].join('\n'),
  };
}

export function waitlistedEmail(input: Base) {
  return {
    subject: `${input.address}: you’re on the waiting list`,
    body: [
      hello(input.renterName),
      '',
      `Thanks for your interest in ${input.address}. The viewings are full for now, so you’re on the waiting list. If a place opens up, we’ll email you straight away with a link to book it.`,
      '',
      'Either way, you’ll hear back from us.',
      '',
      input.operatorName,
    ].join('\n'),
  };
}

export function holdingEmail(input: Base & { viewingDays: Date[] }) {
  const days = [...new Set(input.viewingDays.map((d) => formatDate(d)))];
  const when =
    days.length === 0
      ? ''
      : ` Viewings take place on ${days.length === 1 ? days[0] : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`}.`;
  return {
    subject: `Your enquiry about ${input.address}`,
    body: [
      hello(input.renterName),
      '',
      `Thanks for your interest in ${input.address}. We’ve had a lot of interest, so we can’t invite everyone to view this time.${when}`,
      '',
      'You’ll hear from us either way once a tenant has been chosen.',
      '',
      input.operatorName,
    ].join('\n'),
  };
}

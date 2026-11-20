import { z } from 'zod';
import { irishInstant, irishToday } from '@/lib/format';

/**
 * UX-LP-5, M52 (BA-14): "Stop taking enquiries", in a live letting's menu: now, or at a date
 * and time the lister sets, the same for everyone. From then:
 * - the home's page says enquiries have closed, and "Ask to view" is gone;
 * - the home leaves search (and so place pages, the map, alerts and similar homes);
 * - an enquiry that still arrives by email from a portal gets the fixed reply
 *   (`src/copy/messages.ts`, `enquiriesClosedReply`), and waits for no first reply;
 * - people already in the letting carry on as before: nothing is sent to them.
 * The lister can open it again. Nothing here is about a person.
 */

/** A letting as far as closing goes. */
export interface EnquiryWindow {
  status: 'draft' | 'live' | 'let' | 'withdrawn';
  enquiriesCloseAt: Date | null;
}

/** Whether enquiries have closed by `now`. A close set for later hasn't happened yet. */
export function enquiriesClosed(closeAt: Date | null, now: Date = new Date()): boolean {
  return closeAt !== null && closeAt.getTime() <= now.getTime();
}

/** What the letting's menu and page say: open, closing at a time, or closed. */
export type EnquiryState =
  { state: 'open' } | { state: 'closing'; at: Date } | { state: 'closed'; since: Date };

export function enquiryState(closeAt: Date | null, now: Date = new Date()): EnquiryState {
  if (!closeAt) return { state: 'open' };
  return enquiriesClosed(closeAt, now)
    ? { state: 'closed', since: closeAt }
    : { state: 'closing', at: closeAt };
}

/** Only a live letting takes enquiries, so only a live one can stop or start again. */
export function mayCloseEnquiries(letting: EnquiryWindow): boolean {
  return letting.status === 'live';
}

/** A close set in advance is at most this far ahead. */
export const MAX_CLOSE_AHEAD_DAYS = 366;

export const closeWhen = ['now', 'later'] as const;
export type CloseWhen = (typeof closeWhen)[number];

/**
 * The one question: "When should enquiries stop?". "Now", or a date and a time (Irish time),
 * which must be ahead and within a year. Returns the moment enquiries close.
 */
export function closeEnquiriesSchema(now: Date = new Date()) {
  const today = irishToday(now);
  const last = irishToday(new Date(now.getTime() + MAX_CLOSE_AHEAD_DAYS * 86_400_000));
  return z
    .object({
      when: z.enum(closeWhen, { error: 'Choose when enquiries should stop' }),
      date: z.string().optional(),
      time: z.string().optional(),
    })
    .transform((value, ctx) => {
      if (value.when === 'now') return now;
      const date = value.date?.trim() ?? '';
      const time = value.time?.trim() ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > last) {
        ctx.addIssue({
          code: 'custom',
          path: ['date'],
          message: date && date < today ? 'Choose a date from today on' : 'Choose a date',
        });
        return z.NEVER;
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        ctx.addIssue({ code: 'custom', path: ['time'], message: 'Choose a time' });
        return z.NEVER;
      }
      const at = irishInstant(date, time);
      if (at.getTime() <= now.getTime()) {
        ctx.addIssue({ code: 'custom', path: ['time'], message: 'Choose a time later than now' });
        return z.NEVER;
      }
      return at;
    });
}

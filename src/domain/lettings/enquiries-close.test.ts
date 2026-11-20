import { describe, expect, it } from 'vitest';
import {
  closeEnquiriesSchema,
  enquiriesClosed,
  enquiryState,
  mayCloseEnquiries,
} from './enquiries-close';

const now = new Date('2026-11-20T10:00:00Z');
const later = new Date('2026-11-27T18:00:00Z');

describe('UX-LP-5, M52: stopping enquiries', () => {
  it('UX-LP-5: open until a close is set; closed from the moment it is set for', () => {
    expect(enquiriesClosed(null, now)).toBe(false);
    expect(enquiriesClosed(now, now)).toBe(true);
    expect(enquiriesClosed(later, now)).toBe(false);
    expect(enquiriesClosed(later, new Date('2026-11-27T18:00:00Z'))).toBe(true);
  });

  it('M52: a close set for later is "closing", then "closed"', () => {
    expect(enquiryState(null, now)).toEqual({ state: 'open' });
    expect(enquiryState(later, now)).toEqual({ state: 'closing', at: later });
    expect(enquiryState(later, new Date('2026-11-28T00:00:00Z'))).toEqual({
      state: 'closed',
      since: later,
    });
  });

  it('UX-LP-5: only a live letting can stop taking enquiries', () => {
    expect(mayCloseEnquiries({ status: 'live', enquiriesCloseAt: null })).toBe(true);
    for (const status of ['draft', 'let', 'withdrawn'] as const) {
      expect(mayCloseEnquiries({ status, enquiriesCloseAt: null })).toBe(false);
    }
  });

  it('UX-LP-5: "Now" closes them at once', () => {
    expect(closeEnquiriesSchema(now).parse({ when: 'now' })).toEqual(now);
  });

  it('M52: a date and time is read as Irish time, and must be ahead', () => {
    // 6pm in Dublin on 27 November is 18:00 UTC (winter time).
    expect(
      closeEnquiriesSchema(now).parse({ when: 'later', date: '2026-11-27', time: '18:00' }),
    ).toEqual(later);
    const summer = closeEnquiriesSchema(new Date('2027-06-01T09:00:00Z')).parse({
      when: 'later',
      date: '2027-06-02',
      time: '18:00',
    });
    expect(summer.toISOString()).toBe('2027-06-02T17:00:00.000Z');
  });

  it('M52: the error is at the field: no date, a past date, no time, a time already gone', () => {
    const problem = (input: Record<string, string>) => {
      const parsed = closeEnquiriesSchema(now).safeParse(input);
      return parsed.success ? null : parsed.error.issues[0]!.path.join('.');
    };
    expect(problem({})).toBe('when');
    expect(problem({ when: 'later', time: '18:00' })).toBe('date');
    expect(problem({ when: 'later', date: '2026-11-19', time: '18:00' })).toBe('date');
    expect(problem({ when: 'later', date: '2027-12-31', time: '18:00' })).toBe('date');
    expect(problem({ when: 'later', date: '2026-11-27' })).toBe('time');
    expect(problem({ when: 'later', date: '2026-11-20', time: '09:00' })).toBe('time');
  });
});

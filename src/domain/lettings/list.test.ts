import { describe, expect, it } from 'vitest';
import { groupLettings, lettingStatusLine, type ListedLetting } from './list';
import { stages } from './stages';

const now = new Date('2026-11-16T12:00:00Z');

const letting = (over: Partial<ListedLetting>): ListedLetting => ({
  id: 'l1',
  addressLine1: '12 Ranelagh Road',
  status: 'live',
  stage: 'enquiries',
  closedAt: null,
  goLiveHeld: false,
  setupStepsLeft: 0,
  enquiries: 0,
  booked: 0,
  places: 0,
  applied: 0,
  readyToOffer: false,
  needsNewChoice: false,
  offerOut: false,
  tenancyStartDate: null,
  daysToLet: null,
  usualDaysToLet: null,
  minutesSaved: null,
  ...over,
});
const line = (over: Partial<ListedLetting>) => lettingStatusLine(letting(over), now);

describe('UX-NV-9: one status line in words for each home', () => {
  it('says how far set-up has to go', () => {
    expect(line({ status: 'draft', stage: 'setup', setupStepsLeft: 2 })).toBe('2 steps left');
    expect(line({ status: 'draft', stage: 'setup', setupStepsLeft: 1 })).toBe('1 step left');
    expect(line({ status: 'draft', stage: 'setup', setupStepsLeft: 0 })).toBe(
      'Ready to take enquiries',
    );
  });

  it('says a home is waiting for its agency to be confirmed (UX-AG-4)', () => {
    expect(line({ status: 'draft', stage: 'setup', goLiveHeld: true })).toBe(
      'Goes live when your agency is confirmed',
    );
  });

  it('gives a live home its stage and one figure', () => {
    expect(line({ stage: 'enquiries' })).toBe('Enquiries · none yet');
    expect(line({ stage: 'enquiries', enquiries: 23 })).toBe('Enquiries · 23 so far');
    expect(line({ stage: 'viewings', booked: 8, places: 14 })).toBe('Viewings · 8 of 14 booked');
    expect(line({ stage: 'viewings' })).toBe('Viewings · no times to come');
    expect(line({ stage: 'applications', applied: 6 })).toBe('Applications · 6 applied');
    expect(line({ stage: 'applications' })).toBe('Applications · none yet');
    expect(line({ stage: 'checks' })).toBe('Checks · under way');
  });

  it('says where the offer stands', () => {
    expect(line({ stage: 'checks', readyToOffer: true })).toBe('Offer · ready to send');
    expect(line({ stage: 'offer', offerOut: true })).toBe('Offer · waiting for an answer');
    expect(line({ stage: 'offer', needsNewChoice: true })).toBe('Offer · choose again');
    expect(line({ stage: 'offer' })).toBe('Offer · under way');
  });

  it('says when the tenancy starts once the home is let', () => {
    expect(line({ status: 'let', stage: 'tenancy', tenancyStartDate: '2026-12-01' })).toBe(
      'Tenancy · starts Tuesday 1 December',
    );
    expect(line({ status: 'let', stage: 'tenancy' })).toBe('Tenancy · getting it signed');
  });

  it('says a home was taken off the market', () => {
    expect(line({ status: 'withdrawn', stage: 'close' })).toBe('Withdrawn');
  });
});

describe('UX-HM-9: what a letting saved is shown under each closed home', () => {
  const closed = { status: 'let', stage: 'close' } as const;

  it('says how long it took to let, and the days and time it saved', () => {
    expect(line({ ...closed, daysToLet: 21, usualDaysToLet: 30, minutesSaved: 260 })).toBe(
      'Let in 21 days · saved 9 days and 4 hours 20 minutes',
    );
  });

  it('says only what Gaff can count', () => {
    expect(line({ ...closed, daysToLet: 21 })).toBe('Let in 21 days');
    expect(line({ ...closed, daysToLet: 1, minutesSaved: 60 })).toBe('Let in 1 day · saved 1 hour');
    expect(line({ ...closed, daysToLet: 40, usualDaysToLet: 30, minutesSaved: 0 })).toBe(
      'Let in 40 days',
    );
    expect(line(closed)).toBe('Let');
  });
});

describe('UX-NV-11: the row no longer shows the step number, the meter or time in Gaff', () => {
  it('never says "Step n of 9", whatever the stage and status', () => {
    for (const status of ['draft', 'live', 'let', 'withdrawn']) {
      for (const stage of stages) {
        const words = line({ status, stage, enquiries: 3, booked: 2, places: 14, applied: 1 });
        expect(words).not.toMatch(/step \d+ of|of 9\b|time in Gaff|usual/i);
        expect(words.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('UX-NV-10: homes group under Live, Setting up and Let', () => {
  const home = (id: string, status: string, closedAt: Date | null = null) => ({
    id,
    status,
    closedAt,
  });
  const months = (n: number) => {
    const then = new Date(now);
    then.setUTCMonth(then.getUTCMonth() - n);
    return then;
  };

  it('puts each home under its heading, in that order, keeping the order inside each', () => {
    const { groups, older } = groupLettings(
      [
        home('let-1', 'let', months(1)),
        home('draft-1', 'draft'),
        home('live-1', 'live'),
        home('live-2', 'live'),
        home('let-2', 'let'),
      ],
      now,
    );
    expect(groups.map((g) => [g.heading, g.lettings.map((l) => l.id)])).toEqual([
      ['Live', ['live-1', 'live-2']],
      ['Setting up', ['draft-1']],
      ['Let', ['let-1', 'let-2']],
    ]);
    expect(older).toEqual([]);
  });

  it('shows a heading only when it has homes', () => {
    const { groups } = groupLettings([home('draft-1', 'draft')], now);
    expect(groups.map((g) => g.heading)).toEqual(['Setting up']);
    expect(groupLettings([], now)).toEqual({ groups: [], older: [] });
  });

  it('takes a home let more than 12 months ago out of the list, and keeps one let just inside', () => {
    const justInside = new Date(months(12).getTime() + 60_000);
    const justOutside = new Date(months(12).getTime() - 60_000);
    const { groups, older } = groupLettings(
      [home('recent', 'let', justInside), home('old', 'let', justOutside)],
      now,
    );
    expect(groups).toEqual([
      { key: 'let', heading: 'Let', lettings: [home('recent', 'let', justInside)] },
    ]);
    expect(older.map((l) => l.id)).toEqual(['old']);
  });

  it('keeps a withdrawn home out of the three headings: it was never let', () => {
    const { groups, older } = groupLettings([home('gone', 'withdrawn', months(1))], now);
    expect(groups).toEqual([]);
    expect(older.map((l) => l.id)).toEqual(['gone']);
  });
});

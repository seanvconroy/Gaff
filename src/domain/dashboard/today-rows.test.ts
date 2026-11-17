import { describe, expect, it } from 'vitest';
import type { TodayItem } from './today';
import { todayRow, todayRows, waitingWords } from './today-rows';

// Monday 16 November 2026, 7:20pm in Ireland.
const now = new Date('2026-11-16T19:20:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const home = { lettingId: 'l1', address: '12 Ranelagh Road', since: null, leadUserId: 'ann' };
const APPLICATION = '00000000-0000-4000-8000-000000000011';
const EMAIL = '00000000-0000-4000-8000-000000000005';
const words = (item: TodayItem) => {
  const row = todayRow(item, now);
  return [row.title, row.why];
};

describe('UX-HM-3: a row says what the task is and which home, then why now', () => {
  it('names the task and the home by its address, in the examples the redesign gives', () => {
    expect(
      words({
        kind: 'attendance',
        ...home,
        address: '4 Harbour View',
        count: 6,
        from: new Date('2026-11-16T18:00:00Z'),
        until: new Date('2026-11-16T19:00:00Z'),
      }),
    ).toEqual(['Mark who came · 4 Harbour View', 'Viewings finished at 7pm. 6 people to mark']);
    expect(words({ kind: 'shortlist', ...home, count: 23, placesFree: 14 })).toEqual([
      'Choose who views · 12 Ranelagh Road',
      '23 people are waiting to hear. 14 places',
    ]);
    expect(words({ kind: 'approvals', ...home, count: 3, since: ago(20) })).toEqual([
      'Approve 3 answers · 12 Ranelagh Road',
      'Waiting 20 minutes',
    ]);
    expect(
      words({ kind: 'questions', ...home, count: 1, firstName: 'Aoife', since: ago(125) }),
    ).toEqual(['Aoife asked a question · 12 Ranelagh Road', 'Waiting 2 hours']);
    expect(
      words({ kind: 'attention', count: 1, since: ago(3 * 24 * 60), leadUserId: null }),
    ).toEqual(['1 email Gaff couldn’t place', 'Waiting 3 days']);
    expect(words({ kind: 'setup', ...home, address: '9 Canal View', stepsLeft: 2 })).toEqual([
      'Finish setting up · 9 Canal View',
      '2 steps left',
    ]);
    expect(words({ kind: 'rtb', ...home, dueBy: '2027-01-13' })).toEqual([
      'Register with the RTB by Wednesday 13 January 2027 · 12 Ranelagh Road',
      '58 days left',
    ]);
  });

  it('says a viewing has started when it hasn’t finished yet', () => {
    expect(
      words({
        kind: 'attendance',
        ...home,
        count: 1,
        from: new Date('2026-11-16T19:00:00Z'),
        until: new Date('2026-11-16T20:00:00Z'),
      }),
    ).toEqual(['Mark who came · 12 Ranelagh Road', 'Viewings started at 7pm. 1 person to mark']);
  });

  it('gives each decision and each tenancy step its own words', () => {
    expect(words({ kind: 'choose', ...home, count: 6 })).toEqual([
      'Choose an applicant · 12 Ranelagh Road',
      '6 people have applied',
    ]);
    expect(words({ kind: 'choose', ...home, count: 1 })[1]).toBe('1 person has applied');
    expect(words({ kind: 'shortlist', ...home, count: 1, placesFree: null })[1]).toBe(
      '1 person is waiting to hear',
    );
    // UX-DC-11: one task when every check for the preferred applicant is back.
    expect(words({ kind: 'checks', ...home, firstName: 'Aoife', since: ago(125) })).toEqual([
      'The checks are back for Aoife · 12 Ranelagh Road',
      'Waiting 2 hours',
    ]);
    expect(words({ kind: 'offer', ...home })).toEqual([
      'Make the offer · 12 Ranelagh Road',
      'The person you chose is waiting to hear',
    ]);
    expect(words({ kind: 'rechoose', ...home, reason: 'owner_declined' })).toEqual([
      'Choose again · 12 Ranelagh Road',
      'The owner said no',
    ]);
    expect(words({ kind: 'rechoose', ...home, reason: 'offer_not_accepted' })[1]).toBe(
      'The offer wasn’t accepted',
    );
    expect(
      words({ kind: 'tenancy', ...home, step: 'sign_agreement', startDate: '2026-12-01' }),
    ).toEqual([
      'Sign the tenancy agreement · 12 Ranelagh Road',
      'The tenancy starts on Tuesday 1 December',
    ]);
    expect(words({ kind: 'tenancy', ...home, step: 'request_payment', startDate: null })[0]).toBe(
      'Ask for the deposit and first month’s rent · 12 Ranelagh Road',
    );
  });

  it('says when a date is today, and when it has passed', () => {
    expect(words({ kind: 'rtb', ...home, dueBy: '2026-11-16' })[1]).toBe('Due today');
    expect(words({ kind: 'rtb', ...home, dueBy: '2026-11-17' })[1]).toBe('1 day left');
    expect(words({ kind: 'rtb', ...home, dueBy: '2026-11-13' })[1]).toBe('This was due 3 days ago');
  });

  it('says a home is ready when no setup steps are left', () => {
    expect(words({ kind: 'setup', ...home, stepsLeft: 0 })[1]).toBe('Ready to take enquiries');
    expect(words({ kind: 'setup', ...home, stepsLeft: 1 })[1]).toBe('1 step left');
  });

  it('counts in words that agree with the number', () => {
    expect(words({ kind: 'approvals', ...home, count: 1 })[0]).toBe(
      'Approve 1 answer · 12 Ranelagh Road',
    );
    expect(words({ kind: 'questions', ...home, count: 3, firstName: null })[0]).toBe(
      'Answer 3 questions · 12 Ranelagh Road',
    );
    expect(words({ kind: 'attention', count: 2, since: null, leadUserId: null })[0]).toBe(
      '2 emails Gaff couldn’t place',
    );
  });

  it('leaves the address out on the home’s own page', () => {
    const row = todayRow({ kind: 'shortlist', ...home, count: 2, placesFree: 8 }, now, {
      withAddress: false,
    });
    expect(row.title).toBe('Choose who views');
  });
});

describe('UX-HM-3: the whole row is one link to where the task is done', () => {
  it('links each kind to the page that does it; each decision opens its flow (WP-17)', () => {
    const rows = todayRows(
      [
        { kind: 'attendance', ...home, count: 1, from: null, until: null },
        { kind: 'shortlist', ...home, count: 1, placesFree: null },
        { kind: 'choose', ...home, count: 1 },
        { kind: 'checks', ...home, firstName: 'Aoife' },
        { kind: 'offer', ...home },
        { kind: 'rechoose', ...home, reason: null },
        { kind: 'tenancy', ...home, step: 'finish', startDate: null },
        { kind: 'rtb', ...home, dueBy: '2027-01-13' },
        { kind: 'setup', ...home, stepsLeft: null },
        { kind: 'approvals', ...home, count: 1, only: APPLICATION },
        { kind: 'questions', ...home, count: 1, firstName: null, only: APPLICATION },
        { kind: 'attention', count: 1, only: EMAIL, since: null, leadUserId: null },
      ],
      now,
    );
    expect(rows.map((row) => row.href)).toEqual([
      '/lettings/l1/attendance',
      '/lettings/l1/who-views',
      '/lettings/l1/choose',
      '/lettings/l1/checks',
      '/lettings/l1/offer',
      '/lettings/l1/choose',
      '/lettings/l1/tenancy',
      '/lettings/l1/tenancy',
      '/lettings/l1',
      // UX-NV-2: handled in Inbox. One conversation waiting: the row opens it.
      `/inbox/renter-${APPLICATION}`,
      `/inbox/renter-${APPLICATION}`,
      `/inbox/email-${EMAIL}`,
    ]);
    // One row per kind per home, so nothing is listed twice.
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(rows.at(-1)).toMatchObject({ key: 'attention-all', lettingId: null, leadUserId: null });
    expect(rows[0]).toMatchObject({ lettingId: 'l1', leadUserId: 'ann' });
  });
});

describe('UX-NV-2: answers, questions and unplaced email are handled in Inbox', () => {
  it('opens the conversation when a row is about one, so a draft is approved in two taps', () => {
    const [row] = todayRows([{ kind: 'approvals', ...home, count: 1, only: APPLICATION }], now);
    expect(row).toMatchObject({
      title: 'Approve 1 answer · 12 Ranelagh Road',
      href: `/inbox/renter-${APPLICATION}`,
    });
  });

  it('opens Inbox on "Needs you" when a row counts several conversations', () => {
    const rows = todayRows(
      [
        { kind: 'approvals', ...home, count: 3, only: null },
        { kind: 'questions', ...home, count: 2, firstName: null },
        { kind: 'attention', count: 2, since: null, leadUserId: null },
      ],
      now,
    );
    expect(rows.map((row) => row.href)).toEqual([
      '/inbox?show=needs-you',
      '/inbox?show=needs-you',
      '/inbox?show=needs-you',
    ]);
  });

  it('never points at the pages Inbox replaced', () => {
    const rows = todayRows(
      [
        { kind: 'approvals', ...home, count: 1 },
        { kind: 'questions', ...home, count: 1, firstName: 'Aoife' },
        { kind: 'attention', count: 1, since: null, leadUserId: null },
      ],
      now,
    );
    for (const row of rows) expect(row.href).toMatch(/^\/inbox(\?|\/|$)/);
  });
});

describe('how long something has waited, in words', () => {
  it('counts minutes, then hours, then days', () => {
    expect(waitingWords(null, now)).toBeNull();
    expect(waitingWords(ago(0), now)).toBe('Waiting since just now');
    expect(waitingWords(ago(1), now)).toBe('Waiting 1 minute');
    expect(waitingWords(ago(59), now)).toBe('Waiting 59 minutes');
    expect(waitingWords(ago(60), now)).toBe('Waiting 1 hour');
    expect(waitingWords(ago(23 * 60 + 59), now)).toBe('Waiting 23 hours');
    expect(waitingWords(ago(24 * 60), now)).toBe('Waiting 1 day');
    expect(waitingWords(ago(9 * 24 * 60), now)).toBe('Waiting 9 days');
  });
});

describe('UX-HM-10: a row never shows contact details or message text', () => {
  it('has nowhere to carry them: a row is built from counts, dates, an address and a first name', () => {
    const row = todayRow(
      { kind: 'questions', ...home, count: 1, firstName: 'Aoife', since: ago(5) },
      now,
    );
    expect(Object.keys(row).sort()).toEqual(
      ['href', 'key', 'kind', 'leadUserId', 'lettingId', 'title', 'why'].sort(),
    );
    expect(`${row.title} ${row.why}`).not.toMatch(/@|\d{6,}|\?/);
  });
});

describe('UX-LT-20: a home advertised elsewhere with no forwarding says so as its task', () => {
  const lettingId = '0b5f3c1e-8a2d-4e6f-9b7a-1c2d3e4f5a6b';

  it('UX-LT-20: "Set up forwarding", naming the portals whose enquiries aren’t arriving', () => {
    expect(words({ kind: 'forwarding', ...home, portals: ['daft'] })).toEqual([
      'Set up forwarding · 12 Ranelagh Road',
      'Enquiries from Daft aren’t reaching Gaff yet',
    ]);
    expect(words({ kind: 'forwarding', ...home, portals: ['daft', 'myhome'] })[1]).toBe(
      'Enquiries from Daft and MyHome aren’t reaching Gaff yet',
    );
  });

  it('UX-LT-20: the row opens the forwarding flow, which comes back to the home', () => {
    const row = todayRow({ kind: 'forwarding', ...home, lettingId, portals: ['myhome'] }, now, {
      withAddress: false,
    });
    expect(row.title).toBe('Set up forwarding');
    expect(row.href).toBe(`/forwarding?letting=${lettingId}`);
  });
});

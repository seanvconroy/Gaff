import { describe, expect, it } from 'vitest';
import {
  inTodayOrder,
  needsYouToday,
  todayRank,
  todayRanks,
  type LettingSnapshot,
  type TodayItem,
} from './today';

const TODAY = '2026-11-16';
const at = (time: string) => new Date(`2026-11-16T${time}:00Z`);

const letting = (over: Partial<LettingSnapshot>): LettingSnapshot => ({
  id: 'l1',
  addressLine1: '12 Ranelagh Road',
  status: 'live',
  undecided: 0,
  toMark: 0,
  toChoose: 0,
  ...over,
});

const nothing = { approvals: [], questions: [], attention: [], today: TODAY };
const names = (items: readonly TodayItem[]) =>
  items.map((i) => ('lettingId' in i ? `${i.kind}:${i.lettingId}` : i.kind));

describe('R28: what needs a person today', () => {
  it('is empty when nothing needs a person', () => {
    expect(needsYouToday({ ...nothing, lettings: [letting({})] })).toEqual([]);
  });

  it('only asks who views, who to choose and who to offer for lettings taking enquiries', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [
        letting({
          status: 'paused',
          undecided: 3,
          toChoose: 2,
          readyToOffer: true,
          checksBackFor: 'Aoife',
          needsNewChoice: true,
        }),
      ],
    });
    expect(items).toEqual([]);
  });

  it('UX-DC-11: one task when the preferred applicant’s checks are back, named by first name', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [letting({ checksBackFor: 'Aoife', waitingSince: { checks: at('09:00') } })],
    });
    expect(items).toEqual([
      expect.objectContaining({ kind: 'checks', firstName: 'Aoife', since: at('09:00') }),
    ]);
    expect(todayRank(items[0]!, TODAY)).toBe(todayRanks.decision);
  });

  it('lists a home still being set up, with the steps left', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [letting({ id: 'draft', status: 'draft', setupStepsLeft: 2, leadUserId: 'ann' })],
    });
    expect(items).toEqual([
      {
        kind: 'setup',
        lettingId: 'draft',
        address: '12 Ranelagh Road',
        stepsLeft: 2,
        since: null,
        leadUserId: 'ann',
      },
    ]);
  });

  it('UX-HM-2: leaves out a home held until its agency is confirmed: it waits on Gaff, not on the person', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [letting({ status: 'draft', goLiveHeld: true })],
    });
    expect(items).toEqual([]);
  });
});

describe('UX-HM-4: the order of "Needs you", the same for everyone', () => {
  it('ranks each kind of thing', () => {
    const home = { lettingId: 'l1', address: '12 Ranelagh Road', since: null, leadUserId: null };
    const rank = (item: TodayItem) => todayRank(item, TODAY);
    // 1: something with a deadline today.
    expect(rank({ kind: 'attendance', ...home, count: 3, from: null, until: null })).toBe(1);
    expect(rank({ kind: 'rtb', ...home, dueBy: TODAY })).toBe(1);
    expect(rank({ kind: 'rtb', ...home, dueBy: '2026-11-10' })).toBe(1);
    // 2: a decision only a person can make: who views, who is offered, what is signed.
    expect(rank({ kind: 'shortlist', ...home, count: 23, placesFree: 14 })).toBe(2);
    expect(rank({ kind: 'choose', ...home, count: 6 })).toBe(2);
    expect(rank({ kind: 'offer', ...home })).toBe(2);
    expect(rank({ kind: 'rechoose', ...home, reason: null })).toBe(2);
    expect(rank({ kind: 'tenancy', ...home, step: 'sign_agreement', startDate: null })).toBe(2);
    // 3: a renter waiting on a reply.
    expect(rank({ kind: 'approvals', ...home, count: 3 })).toBe(3);
    // 4: a question only you can answer.
    expect(rank({ kind: 'questions', ...home, count: 1, firstName: 'Aoife' })).toBe(4);
    // 5: email Gaff couldn't place.
    expect(rank({ kind: 'attention', count: 1, since: null, leadUserId: null })).toBe(5);
    // 6: setup to finish on a home.
    expect(rank({ kind: 'setup', ...home, stepsLeft: 2 })).toBe(6);
    // 7: a date coming up.
    expect(rank({ kind: 'rtb', ...home, dueBy: '2027-01-13' })).toBe(7);
    expect(Object.values(todayRanks)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('puts deadlines first, then decisions, replies, questions, unplaced email, setup, and dates coming up', () => {
    const items = needsYouToday({
      approvals: [{ lettingId: 'answers', since: at('09:00') }],
      questions: [{ lettingId: 'asked', since: at('09:00'), firstName: 'Aoife' }],
      attention: [{ since: at('09:00') }],
      today: TODAY,
      lettings: [
        letting({ id: 'later', status: 'let', rtbDueBy: '2027-01-13' }),
        letting({ id: 'draft', status: 'draft' }),
        letting({ id: 'asked' }),
        letting({ id: 'answers' }),
        letting({ id: 'views', undecided: 23 }),
        letting({ id: 'due', status: 'let', rtbDueBy: TODAY }),
        letting({ id: 'came', toMark: 3 }),
      ],
    });
    expect(names(items)).toEqual([
      'attendance:came',
      'rtb:due',
      'shortlist:views',
      'approvals:answers',
      'questions:asked',
      'attention',
      'setup:draft',
      'rtb:later',
    ]);
  });

  it('inside a rank, puts what has waited longest first', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [
        letting({ id: 'new', toChoose: 2, waitingSince: { choose: at('11:00') } }),
        letting({ id: 'old', undecided: 4, waitingSince: { shortlist: at('08:00') } }),
        letting({ id: 'middle', readyToOffer: true, waitingSince: { offer: at('09:30') } }),
        letting({ id: 'unknown', needsNewChoice: true }),
      ],
    });
    expect(names(items)).toEqual([
      'shortlist:old',
      'offer:middle',
      'choose:new',
      'rechoose:unknown',
    ]);
  });

  it('inside the dates coming up, puts the nearest date first', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [
        letting({ id: 'january', status: 'let', rtbDueBy: '2027-01-13' }),
        letting({ id: 'december', status: 'let', rtbDueBy: '2026-12-02' }),
      ],
    });
    expect(names(items)).toEqual(['rtb:december', 'rtb:january']);
  });

  it('breaks a tie the same way every time: by kind, then by address', () => {
    const items = needsYouToday({
      ...nothing,
      lettings: [
        letting({ id: 'b', addressLine1: '9 Canal View', toChoose: 1, undecided: 2 }),
        letting({ id: 'a', addressLine1: '4 Harbour View', toChoose: 1 }),
      ],
    });
    expect(names(items)).toEqual(['choose:a', 'choose:b', 'shortlist:b']);
    expect(names(inTodayOrder([...items].reverse(), TODAY))).toEqual(names(items));
  });

  it('is the same order whoever is looking: it reads nothing about the person', () => {
    const lettings = [
      letting({ id: 'theirs', leadUserId: 'niamh', undecided: 2 }),
      letting({ id: 'mine', leadUserId: 'ann', toMark: 1 }),
    ];
    const items = needsYouToday({ ...nothing, lettings });
    expect(names(items)).toEqual(['attendance:mine', 'shortlist:theirs']);
    expect(items.map((i) => i.leadUserId)).toEqual(['ann', 'niamh']);
  });
});

describe('UX-HM-5: the same kind of thing for the same home is one row with a count', () => {
  it('counts three answers to approve for one home as one item', () => {
    const items = needsYouToday({
      ...nothing,
      approvals: [
        { lettingId: 'l1', since: at('10:20') },
        { lettingId: 'l1', since: at('10:00') },
        { lettingId: 'l1', since: at('10:40') },
      ],
      lettings: [letting({ leadUserId: 'ann' })],
    });
    expect(items).toEqual([
      {
        kind: 'approvals',
        lettingId: 'l1',
        address: '12 Ranelagh Road',
        count: 3,
        // Three conversations, so the row opens the list, not one of them.
        only: null,
        // How long the one who has waited longest has waited.
        since: at('10:00'),
        leadUserId: 'ann',
      },
    ]);
  });

  it('keeps different homes, and different kinds, apart', () => {
    const items = needsYouToday({
      ...nothing,
      approvals: [
        { lettingId: 'l1', since: at('10:00') },
        { lettingId: 'l2', since: at('10:05') },
        { lettingId: 'l1', since: at('10:10') },
      ],
      questions: [{ lettingId: 'l1', since: at('10:15') }],
      lettings: [letting({}), letting({ id: 'l2', addressLine1: '9 Canal View' })],
    });
    expect(items.map((i) => [names([i])[0], 'count' in i ? i.count : null])).toEqual([
      ['approvals:l1', 2],
      ['approvals:l2', 1],
      ['questions:l1', 1],
    ]);
  });

  it('counts every email Gaff couldn’t place as one item, belonging to no home', () => {
    const items = needsYouToday({
      ...nothing,
      attention: [{ since: at('10:30') }, { since: at('09:15') }],
      lettings: [],
    });
    expect(items).toEqual([
      { kind: 'attention', count: 2, only: null, since: at('09:15'), leadUserId: null },
    ]);
  });

  it('UX-HM-10: names who asked, by first name, only when one person asked one question', () => {
    const one = needsYouToday({
      ...nothing,
      questions: [{ lettingId: 'l1', since: at('10:00'), firstName: 'Aoife' }],
      lettings: [letting({})],
    });
    expect(one[0]).toMatchObject({ kind: 'questions', count: 1, firstName: 'Aoife' });
    const several = needsYouToday({
      ...nothing,
      questions: [
        { lettingId: 'l1', since: at('10:00'), firstName: 'Aoife' },
        { lettingId: 'l1', since: at('10:05'), firstName: 'Ciarán' },
      ],
      lettings: [letting({})],
    });
    expect(several[0]).toMatchObject({ kind: 'questions', count: 2, firstName: null });
  });

  it('UX-NV-15: counts conversations, so a renter’s draft and their questions are one thing to do', () => {
    const items = needsYouToday({
      ...nothing,
      approvals: [
        // Aoife wrote twice before anyone looked: two drafts, one conversation.
        { lettingId: 'l1', applicationId: 'aoife', since: at('10:20') },
        { lettingId: 'l1', applicationId: 'aoife', since: at('10:00') },
      ],
      questions: [
        // The part of Aoife's email Gaff couldn't answer is marked in her draft.
        { lettingId: 'l1', applicationId: 'aoife', since: at('10:00'), firstName: 'Aoife' },
        // Ciarán asked two things Gaff doesn't know, and has no draft.
        { lettingId: 'l1', applicationId: 'ciaran', since: at('10:30'), firstName: 'Ciarán' },
        { lettingId: 'l1', applicationId: 'ciaran', since: at('10:25'), firstName: 'Ciarán' },
      ],
      lettings: [letting({})],
    });
    expect(items).toMatchObject([
      { kind: 'approvals', count: 1, only: 'aoife', since: at('10:00') },
      { kind: 'questions', count: 1, only: 'ciaran', firstName: 'Ciarán', since: at('10:25') },
    ]);
  });

  it('UX-NV-14: knows the one conversation a row is about, and none when it counts several', () => {
    const one = needsYouToday({
      ...nothing,
      approvals: [{ lettingId: 'l1', applicationId: 'aoife', since: at('10:00') }],
      attention: [{ id: 'email-1', since: at('10:30') }],
      lettings: [letting({})],
    });
    expect(one.map((item) => ('only' in item ? item.only : undefined))).toEqual([
      'aoife',
      'email-1',
    ]);
    const several = needsYouToday({
      ...nothing,
      approvals: [
        { lettingId: 'l1', applicationId: 'aoife', since: at('10:00') },
        { lettingId: 'l1', applicationId: 'ciaran', since: at('10:05') },
      ],
      attention: [
        { id: 'email-1', since: at('10:30') },
        { id: 'email-2', since: at('10:31') },
      ],
      lettings: [letting({})],
    });
    expect(several).toMatchObject([
      { kind: 'approvals', count: 2, only: null },
      { kind: 'attention', count: 2, only: null },
    ]);
  });

  it('never lists something for a home that isn’t this organisation’s', () => {
    const items = needsYouToday({
      ...nothing,
      approvals: [{ lettingId: 'elsewhere', since: at('10:00') }],
      lettings: [letting({})],
    });
    expect(items).toEqual([]);
  });
});

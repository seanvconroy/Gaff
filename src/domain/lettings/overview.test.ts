import { describe, expect, it } from 'vitest';
import type { TodayItem } from '@/domain/dashboard/today';
import { todayRow } from '@/domain/dashboard/today-rows';
import {
  figuresFor,
  needsYouOn,
  type OverviewFacts,
  pageStage,
  progressOf,
  whatsNext,
} from './overview';
import { stages } from './stages';

// Monday 16 November 2026, 7:20pm in Ireland.
const now = new Date('2026-11-16T19:20:00Z');
const home = { lettingId: 'l1', address: '12 Ranelagh Road', since: null, leadUserId: 'ann' };

const base: OverviewFacts = {
  lettingId: 'l1',
  stage: 'enquiries',
  status: 'live',
  goLiveHeld: false,
  setupStepsLeft: 0,
  goLiveBlocked: null,
  resumeHref: '/lettings/l1/setup',
  hidden: null,
  rentOverCap: false,
  rentCheckHref: '/lettings/l1/setup/rent-check?alone=1',
  failedSends: { count: 0, href: '/inbox' },
  today: [],
  enquiries: 31,
  answered: 23,
  meetEverything: 14,
  places: 14,
  booked: 8,
  waitlisted: 3,
  nextViewing: new Date('2026-11-20T18:00:00Z'),
  came: 9,
  applied: 6,
  checks: [],
  waitingOn: null,
  owner: null,
  offer: { state: 'not_sent', firstName: null, until: null },
  tenancy: null,
  results: { daysToLet: null, minutesSaved: null },
  deleteOn: null,
  deletesOthers: false,
};

const at = (facts: Partial<OverviewFacts>): OverviewFacts => ({ ...base, ...facts });
const tenancy = (over: Partial<NonNullable<OverviewFacts['tenancy']>> = {}) => ({
  done: 1,
  total: 6,
  startDate: '2026-12-01',
  next: { name: 'Sign the agreement', href: '/lettings/l1/tenancy/sign' },
  after: 'Ask for the deposit and first month’s rent',
  waitingOn: null,
  canFinish: false,
  finishHref: '/lettings/l1/finish',
  finished: false,
  ...over,
});

describe('UX-LP-1: Overview has three blocks, right at each of the nine stages', () => {
  it('UX-LP-1: stage 1, set up: finish setting up, with Continue', () => {
    const facts = at({ stage: 'setup', status: 'draft', setupStepsLeft: 2 });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'task',
      lead: 'Finish setting up. 2 steps left.',
      action: 'Continue',
      href: '/lettings/l1/setup',
      also: [],
    });
    expect(figuresFor(facts, now)).toEqual([]);
    expect(whatsNext(facts)).toBe('When it’s live, Gaff answers every enquiry within minutes.');
  });

  it('UX-LP-1: stage 2, enquiries: usually nothing, with the three figures', () => {
    const facts = at({ stage: 'enquiries' });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing: 'Gaff is answering enquiries.',
    });
    expect(figuresFor(facts, now)).toEqual([
      { label: 'Enquiries', value: '31' },
      { label: 'Answered the questions', value: '23' },
      { label: 'Meet everything you asked', value: '14' },
    ]);
    expect(whatsNext(facts)).toBe('Next, you choose who views. Do it whenever you’re ready.');
  });

  it('UX-LP-1: stage 2, an answer to approve is the task, in Today’s words', () => {
    const facts = at({
      today: [
        { kind: 'approvals', ...home, count: 3, since: new Date(now.getTime() - 20 * 60_000) },
      ],
    });
    expect(needsYouOn(facts, now)).toMatchObject({
      kind: 'task',
      lead: 'Approve 3 answers. Waiting 20 minutes.',
      action: 'Approve the answers',
    });
  });

  it('UX-LP-1: stage 3, shortlist: choose who views, the same three figures', () => {
    const item: TodayItem = { kind: 'shortlist', ...home, count: 23, placesFree: 14 };
    const facts = at({ today: [item] });
    expect(pageStage(facts)).toBe('shortlist');
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'task',
      lead: '23 people are waiting to hear. 14 places.',
      action: 'Choose who views',
      href: '/lettings/l1/who-views',
      also: [],
    });
    expect(figuresFor(facts, now).map((f) => f.label)).toEqual([
      'Enquiries',
      'Answered the questions',
      'Meet everything you asked',
    ]);
    expect(whatsNext(facts)).toBe(
      'Gaff invites the people you choose and tells everyone else where they stand.',
    );
  });

  it('UX-LP-1: stage 4, viewings: nothing before the day; Mark who came on the day', () => {
    const before = at({ stage: 'viewings' });
    expect(needsYouOn(before, now)).toEqual({
      kind: 'nothing',
      doing: 'Gaff is booking viewings and sending the reminders.',
    });
    expect(figuresFor(before, now)).toEqual([
      { label: 'Places booked', value: '8 of 14' },
      { label: 'On the waiting list', value: '3' },
      { label: 'Next viewing', value: 'Friday 20 November, 6pm' },
    ]);
    const onTheDay = at({
      stage: 'viewings',
      today: [
        {
          kind: 'attendance',
          ...home,
          count: 4,
          from: new Date('2026-11-16T18:00:00Z'),
          until: new Date('2026-11-16T19:00:00Z'),
        },
      ],
    });
    expect(needsYouOn(onTheDay, now)).toMatchObject({
      kind: 'task',
      lead: 'Viewings finished at 7pm. 4 people to mark.',
      action: 'Mark who came',
      href: '/lettings/l1/attendance',
    });
    expect(whatsNext(onTheDay)).toBe(
      'After each viewing, Gaff invites the people who came to apply.',
    );
  });

  it('UX-LP-1: stage 5, applications: choose an applicant', () => {
    const facts = at({ stage: 'applications', today: [{ kind: 'choose', ...home, count: 6 }] });
    expect(needsYouOn(facts, now)).toMatchObject({
      lead: '6 people have applied.',
      action: 'Choose an applicant',
      href: '/lettings/l1/choose',
    });
    expect(figuresFor(facts, now)).toEqual([
      { label: 'Came to view', value: '9' },
      { label: 'Applied', value: '6' },
    ]);
    expect(whatsNext(facts)).toBe('Gaff checks only the person you choose and one backup.');
  });

  it('UX-LP-1: stage 6, checks: usually nothing; Review the checks when they’re back', () => {
    const running = at({
      stage: 'checks',
      waitingOn: 'Checks under way for Aoife and Ciarán.',
      checks: [
        { firstName: 'Aoife', back: 1, total: 3 },
        { firstName: 'Ciarán', back: 0, total: 3 },
      ],
    });
    expect(needsYouOn(running, now)).toEqual({
      kind: 'nothing',
      doing: 'Checks under way for Aoife and Ciarán.',
    });
    expect(figuresFor(running, now)).toEqual([
      { label: 'Aoife’s checks', value: '1 of 3 back' },
      { label: 'Ciarán’s checks', value: '0 of 3 back' },
    ]);
    const back = at({ stage: 'checks', today: [{ kind: 'checks', ...home, firstName: 'Aoife' }] });
    expect(needsYouOn(back, now)).toMatchObject({
      lead: 'The checks are back for Aoife.',
      action: 'Review the checks',
      href: '/lettings/l1/checks',
    });
    expect(whatsNext(back)).toBe('When the checks are back, you make the offer.');
  });

  it('UX-LP-1: stage 7, offer: make the offer, or wait for the answer', () => {
    const ready = at({ stage: 'offer', owner: 'approved', today: [{ kind: 'offer', ...home }] });
    expect(needsYouOn(ready, now)).toMatchObject({ action: 'Make the offer' });
    // The stored stage can still say Checks when the offer is ready: the page is at the offer.
    expect(pageStage(at({ stage: 'checks', today: [{ kind: 'offer', ...home }] }))).toBe('offer');
    const out = at({
      stage: 'offer',
      owner: 'approved',
      offer: { state: 'open', firstName: 'Aoife', until: new Date('2026-11-22T18:00:00Z') },
      waitingOn: 'The offer is with Aoife until Sunday 22 November, 6pm.',
    });
    expect(needsYouOn(out, now)).toEqual({
      kind: 'nothing',
      doing: 'The offer is with Aoife until Sunday 22 November, 6pm.',
    });
    expect(figuresFor(out, now)).toEqual([
      { label: 'Owner’s answer', value: 'Approved' },
      { label: 'Offer', value: 'Sent' },
    ]);
    expect(whatsNext(out)).toBe(
      'When Aoife accepts, Gaff tells everyone else and prepares the tenancy.',
    );
    // A private landlord's own home has no owner to ask: no figure for it.
    expect(figuresFor(at({ stage: 'offer' }), now).map((f) => f.label)).toEqual(['Offer']);
  });

  it('UX-LP-1: stage 8, tenancy: the next step, one at a time, and the one after', () => {
    const facts = at({
      stage: 'tenancy',
      status: 'let',
      tenancy: tenancy(),
      today: [{ kind: 'tenancy', ...home, step: 'sign_agreement', startDate: '2026-12-01' }],
    });
    expect(needsYouOn(facts, now)).toMatchObject({
      kind: 'task',
      action: 'Sign the tenancy agreement',
      href: '/lettings/l1/tenancy/sign',
    });
    // UX-LP-4: Today's task says when it starts, so the figure doesn't say it again.
    expect(figuresFor(facts, now)).toEqual([{ label: 'Steps done', value: '1 of 6' }]);
    expect(figuresFor(at({ ...facts, today: [] }), now)).toEqual([
      { label: 'Steps done', value: '1 of 6' },
      { label: 'Starts', value: 'Tuesday 1 December' },
    ]);
    expect(whatsNext(facts)).toBe('After that: Ask for the deposit and first month’s rent.');
    // Handing over the keys isn't on Today, and is still the operator's to do now.
    const keys = at({
      stage: 'tenancy',
      status: 'let',
      tenancy: tenancy({
        next: { name: 'Hand over the keys', href: '/lettings/l1/tenancy/move-in' },
      }),
    });
    expect(needsYouOn(keys, now)).toMatchObject({ action: 'Hand over the keys' });
    // The tenant's turn: nothing needs you.
    const theirs = at({
      stage: 'tenancy',
      status: 'let',
      tenancy: tenancy({ next: null, waitingOn: 'Aoife' }),
    });
    expect(needsYouOn(theirs, now)).toEqual({
      kind: 'nothing',
      doing: 'Aoife is reading the agreement. Gaff tells you when it’s signed.',
    });
  });

  it('UX-LP-1: stage 9, close: finish this letting, then days to let and time saved', () => {
    const ready = at({
      stage: 'tenancy',
      status: 'let',
      tenancy: tenancy({ next: null, after: null, done: 6, canFinish: true }),
      today: [{ kind: 'tenancy', ...home, step: 'finish', startDate: '2026-12-01' }],
    });
    expect(pageStage(ready)).toBe('close');
    expect(needsYouOn(ready, now)).toMatchObject({
      action: 'Finish and close the letting',
      href: '/lettings/l1/finish',
    });
    const finished = at({
      stage: 'close',
      status: 'let',
      tenancy: tenancy({ next: null, done: 6, finished: true }),
      results: { daysToLet: 21, minutesSaved: 540 },
      deleteOn: '2026-12-13',
      deletesOthers: true,
    });
    expect(needsYouOn(finished, now)).toEqual({
      kind: 'nothing',
      doing: 'This letting is closed. There’s nothing more to do.',
    });
    expect(figuresFor(finished, now)).toEqual([
      { label: 'Days to let', value: '21' },
      { label: 'Time saved', value: '9 hours' },
    ]);
    expect(whatsNext(finished)).toBe(
      'Gaff deletes other applicants’ details on Sunday 13 December.',
    );
  });
});

describe('UX-LP-7: a blocking problem is the Needs you task, never a banner', () => {
  it('UX-LP-7: a rent above the rules comes before anything on Today', () => {
    const facts = at({
      rentOverCap: true,
      today: [{ kind: 'shortlist', ...home, count: 2, placesFree: 4 }],
    });
    const needs = needsYouOn(facts, now);
    expect(needs).toMatchObject({ kind: 'task', action: 'Check the rent again' });
    expect(needs.also?.map((row) => row.kind)).toEqual(['shortlist']);
  });

  it('UX-TS-4: a home Gaff’s team took off gaff.ie is the task, with why, before the rent', () => {
    const facts = at({
      rentOverCap: true,
      hidden: { reason: 'wrong_details', stage: 'decided', href: '/lettings/l1/hidden' },
      today: [{ kind: 'shortlist', ...home, count: 2, placesFree: 4 }],
    });
    const needs = needsYouOn(facts, now);
    expect(needs).toMatchObject({
      kind: 'task',
      lead: 'Gaff’s team took this home off gaff.ie after a report: some of its details look wrong. Its enquiries wait until it’s back.',
      action: 'Ask Gaff to look again',
      href: '/lettings/l1/hidden',
    });
    expect(needs.also?.map((row) => row.kind)).toEqual(['shortlist']);
  });

  it('UX-TS-4: once the lister has asked Gaff to look again, nothing needs them', () => {
    const facts = at({
      hidden: { reason: 'scam', stage: 'appealed', href: '/lettings/l1/hidden' },
    });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing:
        'Gaff’s team is looking at this home again, and will email you within one working day.',
    });
  });

  it('M97: a home the rules took off for a person to check asks nothing of the lister yet', () => {
    const facts = at({ hidden: { reason: 'scam', stage: 'held', href: '/lettings/l1/hidden' } });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing:
        'Gaff’s rules took this home off gaff.ie automatically after reports that it may be a scam. A person on Gaff’s team will check it within four working hours, and email you.',
    });
  });

  it('M48: a home the checks held asks nothing of the lister, and says when a person will have looked', () => {
    const facts = at({
      hidden: {
        reason: 'something_else',
        stage: 'held',
        href: '/lettings/l1/hidden',
        after: 'check',
        lookBy: 'Thursday 19 November, 2pm',
      },
    });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing:
        'Gaff checks every home before it goes on gaff.ie, and a person on Gaff’s team is looking at this one. They’ll email you by Thursday 19 November, 2pm. Its enquiries wait until then.',
    });
  });

  it('M98: a home a person kept off after checking it is the task, with why', () => {
    const facts = at({
      hidden: { reason: 'scam', stage: 'decided', href: '/lettings/l1/hidden', after: 'check' },
    });
    expect(needsYouOn(facts, now)).toMatchObject({
      kind: 'task',
      lead: 'Gaff’s team checked this home and kept it off gaff.ie: it may not be a genuine listing. Its enquiries wait until it’s on.',
      action: 'Ask Gaff to look again',
    });
  });

  it('M98: once an appeal is decided and it stays off, it can’t be asked again', () => {
    const facts = at({ hidden: { reason: 'scam', stage: 'final', href: '/lettings/l1/hidden' } });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing:
        'Gaff’s team looked again and this home stays off gaff.ie. Their email says why, and what you can do next.',
    });
  });

  it('UX-LP-7: a message that didn’t send is the task, and opens it', () => {
    const facts = at({ failedSends: { count: 1, href: '/inbox/r-abc' } });
    expect(needsYouOn(facts, now)).toMatchObject({
      kind: 'task',
      action: 'Open the conversation',
      href: '/inbox/r-abc',
    });
  });

  it('UX-LP-7, UX-AG-6: a lapsed licence holds a home being set up, and says why', () => {
    const facts = at({
      stage: 'setup',
      status: 'draft',
      goLiveBlocked: { words: 'This home can’t go live yet.', fix: null },
    });
    expect(needsYouOn(facts, now)).toEqual({
      kind: 'nothing',
      doing: 'This home can’t go live yet.',
    });
  });
});

describe('UX-LP-1: the task on a letting is the same item Today shows for it', () => {
  it('UX-LP-1: the same words, leading to the same flow', () => {
    const items: TodayItem[] = [
      { kind: 'choose', ...home, count: 6 },
      { kind: 'offer', ...home },
      { kind: 'shortlist', ...home, count: 2, placesFree: null },
    ];
    for (const item of items) {
      const row = todayRow(item, now, { withAddress: false });
      const needs = needsYouOn(at({ today: [item] }), now);
      expect(needs.kind).toBe('task');
      if (needs.kind !== 'task') continue;
      expect(needs.href).toBe(row.href);
      expect(`${needs.lead} ${needs.action}`).toContain(row.why ?? row.title);
    }
  });
});

describe('UX-LP-3: four named parts, and never "Step n of 9"', () => {
  it('UX-LP-3: the label names the part and the stage', () => {
    expect(progressOf('viewings')).toEqual({
      segments: ['Set up', 'Find', 'Choose', 'Sign'],
      current: 1,
      detail: 'Viewings',
      label: 'Find · Viewings',
    });
    expect(progressOf('setup').label).toBe('Set up');
    // Stage 9 is the current part until the letting is finished; then every part is done.
    expect(progressOf('close').current).toBe(3);
    expect(progressOf('close', true).current).toBe(4);
    for (const stage of stages) expect(progressOf(stage).label).not.toMatch(/of 9/);
  });
});

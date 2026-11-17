import { describe, expect, it } from 'vitest';
import { nextAfterLet } from '@/domain/tenancy/results';
import {
  DECLINE_WAITS_DAYS,
  isDeclinablePrompt,
  mostRepeatedQuestion,
  plainQuestion,
  type PromptFacts,
  type PromptLetting,
  type PromptPlace,
  promptCodes,
  promptConditions,
  promptFor,
  promptTable,
  suggestionsAllowed,
} from './prompts';

const now = new Date('2026-11-17T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const admin = {
  userId: 'ann',
  role: 'admin' as const,
  organisationKind: 'agency' as const,
  members: 1,
};
const home = (over: Partial<PromptLetting> = {}): PromptLetting => ({
  id: 'l1',
  addressLine1: '12 Ranelagh Road',
  status: 'live',
  leadUserId: 'ann',
  answered: 0,
  viewingTimesAhead: 2,
  ...over,
});
const clean = Array.from({ length: 20 }, () => ({ edited: false }));

describe('UX-GR-5: the table, in section 9’s order', () => {
  it('holds every prompt in the table once, in its order', () => {
    expect(promptTable.map((rule) => rule.code)).toEqual([...promptCodes]);
    expect(new Set(promptCodes).size).toBe(13);
  });

  it('gives each prompt a pure condition', () => {
    for (const code of promptCodes) expect(typeof promptConditions[code]).toBe('function');
  });
});

describe('UX-GR-5: no screen shows more than one prompt; the higher in the table wins', () => {
  it('on Today, the checklist wins over everything else', () => {
    const facts: PromptFacts = {
      viewer: admin,
      checklistShowing: true,
      unknownHomeEnquiries: 2,
      homes: [home({ answered: 4, viewingTimesAhead: 0 })],
      teamAnswered: false,
      approveBeforeSend: true,
      recentApprovals: clean,
    };
    expect(promptFor('today', facts, {}, now)).toEqual({ code: 'add_first_letting' });
  });

  it('then "Set it up?", then viewing times, then the team, then checking', () => {
    const facts: PromptFacts = {
      viewer: admin,
      checklistShowing: false,
      unknownHomeEnquiries: 1,
      homes: [home({ answered: 4, viewingTimesAhead: 0 })],
      teamAnswered: false,
      approveBeforeSend: true,
      recentApprovals: clean,
    };
    expect(promptFor('today', facts, {}, now)?.code).toBe('set_up_unknown_home');
    const noUnknown = { ...facts, unknownHomeEnquiries: 0 };
    expect(promptFor('today', noUnknown, {}, now)).toEqual({
      code: 'add_viewing_times',
      lettingId: 'l1',
      address: '12 Ranelagh Road',
    });
    const withTimes = { ...noUnknown, homes: [home({ answered: 4 })] };
    expect(promptFor('today', withTimes, {}, now)?.code).toBe('invite_team');
    expect(promptFor('today', { ...withTimes, teamAnswered: true }, {}, now)?.code).toBe(
      'stop_checking',
    );
  });

  it('every place gets one prompt or none, whatever applies', () => {
    const everything: PromptFacts = {
      viewer: admin,
      checklistShowing: true,
      unknownHomeEnquiries: 3,
      homes: [home({ answered: 4, viewingTimesAhead: 0 })],
      justLiveWithoutOwner: true,
      teamAnswered: false,
      approveBeforeSend: true,
      recentApprovals: clean,
      repeatedQuestion: { lettingId: 'l1', times: 9 },
      ownerHasSeenSummary: false,
      justClosed: true,
    };
    const places: PromptPlace[] = [
      'today',
      'letting',
      'letting_menu',
      'after_sign_in',
      'inbox',
      'results',
      'renter_page',
      'search',
    ];
    for (const place of places) {
      const prompt = promptFor(place, everything, {}, now);
      expect(prompt === null || typeof prompt.code === 'string').toBe(true);
    }
    expect(promptFor('letting', everything, {}, now)?.code).toBe('add_viewing_times');
    expect(promptFor('inbox', everything, {}, now)?.code).toBe('answer_more');
  });

  it('on the results screen agrees with UX-TN-6: the owner’s summary, then the next letting', () => {
    const closed = { viewer: { ...admin, members: 3 }, justClosed: true };
    for (const seen of [false, true]) {
      const prompt = promptFor('results', { ...closed, ownerHasSeenSummary: seen }, {}, now);
      const next = nextAfterLet({ kind: 'agency', ownerHasSeenSummary: seen, members: 3 });
      expect(prompt?.code).toBe(next === 'add_letting' ? 'add_next_letting' : next);
    }
  });
});

describe('UX-GR-5: declined prompts wait at least 14 days', () => {
  const facts: PromptFacts = {
    viewer: admin,
    checklistShowing: false,
    homes: [home()],
    teamAnswered: false,
  };

  it('a decline holds for fourteen days, then the prompt comes back', () => {
    expect(promptFor('today', facts, { invite_team: daysAgo(3) }, now)).toBeNull();
    expect(
      promptFor('today', facts, { invite_team: daysAgo(DECLINE_WAITS_DAYS - 1) }, now),
    ).toBeNull();
    expect(promptFor('today', facts, { invite_team: daysAgo(DECLINE_WAITS_DAYS) }, now)).toEqual({
      code: 'invite_team',
    });
  });

  it('a declined prompt makes way for the next one that applies', () => {
    const both = { ...facts, teamAnswered: false, approveBeforeSend: true, recentApprovals: clean };
    expect(promptFor('today', both, { invite_team: daysAgo(1) }, now)?.code).toBe('stop_checking');
  });

  it('a prompt shown once never comes back once declined', () => {
    const checking = {
      ...facts,
      teamAnswered: true,
      approveBeforeSend: true,
      recentApprovals: clean,
    };
    expect(promptFor('today', checking, { stop_checking: daysAgo(400) }, now)).toBeNull();
  });

  it('only prompts that can be declined take "Not now"', () => {
    expect(isDeclinablePrompt('invite_team')).toBe(true);
    expect(isDeclinablePrompt('stop_checking')).toBe(true);
    expect(isDeclinablePrompt('add_first_letting')).toBe(false);
    expect(isDeclinablePrompt('anything')).toBe(false);
  });
});

describe('Each prompt’s condition (section 9, "When")', () => {
  it('Add viewing times: the letting’s lead, people have answered, and no times', () => {
    const viewer = admin;
    const cond = promptConditions.add_viewing_times;
    expect(cond({ viewer, homes: [home({ answered: 2, viewingTimesAhead: 0 })] })).not.toBeNull();
    expect(cond({ viewer, homes: [home({ answered: 0, viewingTimesAhead: 0 })] })).toBeNull();
    expect(cond({ viewer, homes: [home({ answered: 2, viewingTimesAhead: 1 })] })).toBeNull();
    expect(
      cond({ viewer, homes: [home({ answered: 2, viewingTimesAhead: 0, leadUserId: 'bob' })] }),
    ).toBeNull();
    expect(
      cond({ viewer, homes: [home({ answered: 2, viewingTimesAhead: 0, status: 'draft' })] }),
    ).toBeNull();
  });

  it('Let the owner follow along: agency members, just after go-live with no owner', () => {
    const cond = promptConditions.owner_follow_along;
    expect(cond({ viewer: admin, justLiveWithoutOwner: true })).not.toBeNull();
    expect(
      cond({ viewer: { ...admin, organisationKind: 'landlord' }, justLiveWithoutOwner: true }),
    ).toBeNull();
    expect(cond({ viewer: admin, justLiveWithoutOwner: false })).toBeNull();
  });

  it('Invite your team (UX-AG-13): an admin who is the only member and has a live letting', () => {
    const cond = promptConditions.invite_team;
    const live = { homes: [home()], teamAnswered: false };
    expect(cond({ viewer: admin, ...live })).not.toBeNull();
    expect(cond({ viewer: { ...admin, members: 2 }, ...live })).toBeNull();
    expect(cond({ viewer: { ...admin, role: 'negotiator' }, ...live })).toBeNull();
    expect(
      cond({ viewer: { ...admin, organisationKind: 'private_landlord' }, ...live }),
    ).toBeNull();
    expect(
      cond({ viewer: admin, homes: [home({ status: 'draft' })], teamAnswered: false }),
    ).toBeNull();
    expect(cond({ viewer: admin, homes: [home()], teamAnswered: true })).toBeNull();
  });

  it('Stop checking every answer?: admins and private landlords, twenty clean sends in a row', () => {
    const cond = promptConditions.stop_checking;
    const on = { approveBeforeSend: true, recentApprovals: clean };
    expect(cond({ viewer: admin, ...on })).not.toBeNull();
    expect(
      cond({ viewer: { ...admin, organisationKind: 'private_landlord', role: 'admin' }, ...on }),
    ).not.toBeNull();
    expect(cond({ viewer: { ...admin, role: 'negotiator' }, ...on })).toBeNull();
    expect(cond({ viewer: admin, ...on, approveBeforeSend: false })).toBeNull();
    expect(
      cond({ viewer: admin, approveBeforeSend: true, recentApprovals: clean.slice(1) }),
    ).toBeNull();
    expect(
      cond({
        viewer: admin,
        approveBeforeSend: true,
        recentApprovals: [{ edited: true }, ...clean.slice(1)],
      }),
    ).toBeNull();
  });

  it('Gaff can answer more if you add…: the same question five times about one home', () => {
    const asked = (n: number, lettingId = 'l1') =>
      Array.from({ length: n }, (_, i) => ({
        lettingId,
        question: i % 2 ? 'Is there PARKING?' : 'is there parking',
      }));
    expect(mostRepeatedQuestion(asked(5))).toEqual({ lettingId: 'l1', times: 5 });
    expect(
      promptConditions.answer_more({
        viewer: admin,
        repeatedQuestion: mostRepeatedQuestion(asked(4)),
      }),
    ).toBeNull();
    expect(
      promptConditions.answer_more({
        viewer: admin,
        repeatedQuestion: mostRepeatedQuestion(asked(5)),
      }),
    ).toEqual({ code: 'answer_more', lettingId: 'l1' });
    // Asked about different homes, it isn't the same unknown question.
    expect(mostRepeatedQuestion([...asked(3, 'l1'), ...asked(3, 'l2')])?.times).toBe(3);
    expect(plainQuestion('  Pets?? ')).toBe('pets');
  });

  it('no operator prompt is ever on a renter’s page or search (UX-GR-8, UX-GR-9)', () => {
    const facts: PromptFacts = { viewer: admin, checklistShowing: true, justClosed: true };
    expect(promptFor('renter_page', facts, {}, now)).toBeNull();
    expect(promptFor('search', facts, {}, now)).toBeNull();
  });
});

describe('UX-GR-5, UX-HM-7: a decline holds for Today’s “all caught up” action too', () => {
  it('leaves out inviting and viewing times while their prompts wait', () => {
    const built = ['finish_setup', 'add_letting', 'invite_colleague', 'add_viewing_times'];
    expect(suggestionsAllowed(built, { invite_team: daysAgo(2) }, now)).toEqual([
      'finish_setup',
      'add_letting',
      'add_viewing_times',
    ]);
    expect(suggestionsAllowed(built, { add_viewing_times: daysAgo(30) }, now)).toEqual(built);
  });
});

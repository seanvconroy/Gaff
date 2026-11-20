import { describe, expect, it } from 'vitest';
import {
  MAX_WAITLIST,
  defaultInviteCount,
  invitationCounts,
  planInvitations,
  waitlistSize,
} from './plan';

const ranked = ['a', 'b', 'c', 'd', 'e', 'f'];
const undecided = new Set(ranked);

describe('R11: planning invitations', () => {
  it('invites who the operator chose, waitlists the next in ranked order, holds the rest', () => {
    expect(
      planInvitations({
        rankedIds: ranked,
        undecidedIds: undecided,
        chosenIds: new Set(['a', 'b']),
        waitlistSize: 2,
      }),
    ).toEqual({ invited: ['a', 'b'], waitlisted: ['c', 'd'], notInvited: ['e', 'f'] });
  });

  it('respects the operator’s choice even when it differs from the ranking (a person decides)', () => {
    expect(
      planInvitations({
        rankedIds: ranked,
        undecidedIds: undecided,
        chosenIds: new Set(['e']),
        waitlistSize: 1,
      }),
    ).toEqual({ invited: ['e'], waitlisted: ['a'], notInvited: ['b', 'c', 'd', 'f'] });
  });

  it('only decides people not already decided', () => {
    const plan = planInvitations({
      rankedIds: ranked,
      undecidedIds: new Set(['c', 'd', 'e']),
      chosenIds: new Set(['d']),
      waitlistSize: 5,
    });
    expect(plan).toEqual({ invited: ['d'], waitlisted: ['c', 'e'], notInvited: [] });
  });

  it.each([
    [{ chosenIds: new Set<string>() }, 'at least one'],
    [{ chosenIds: new Set(['zz']) }, 'already been decided'],
    [{ chosenIds: new Set(['a']), waitlistSize: 51 }, 'up to 50'],
  ])('refuses a plan that can’t be right: %o', (overrides, message) => {
    expect(() =>
      planInvitations({
        rankedIds: ranked,
        undecidedIds: undecided,
        waitlistSize: 2,
        ...overrides,
      }),
    ).toThrow(message);
  });

  it('ticks as many as there are places by default', () => {
    expect(defaultInviteCount(4, 10)).toBe(4);
    expect(defaultInviteCount(14, 3)).toBe(3);
    expect(defaultInviteCount(0, 3)).toBe(0);
  });
});

describe('UX-DC-2 to UX-DC-4: choosing who views, before anything is sent', () => {
  it('UX-DC-3: the waiting list is the next ten, or everyone left if fewer, and never more', () => {
    expect(waitlistSize(null, 19)).toBe(10);
    expect(waitlistSize(null, 4)).toBe(4);
    expect(waitlistSize(25, 4)).toBe(4);
    expect(waitlistSize(3, 19)).toBe(3);
    expect(waitlistSize(0, 19)).toBe(0);
    expect(waitlistSize(-2, 19)).toBe(10);
    expect(waitlistSize(500, 900)).toBe(MAX_WAITLIST);
  });

  it('UX-DC-2: says who is invited, who waits and who is told they will hear either way', () => {
    expect(invitationCounts({ placesLeft: 14, undecided: 43, chosen: 14, waitlist: null })).toEqual(
      { invited: 14, waitlisted: 10, told: 19, unoffered: 0 },
    );
  });

  it('UX-DC-4: counts the places nobody is invited to when fewer are ticked', () => {
    expect(invitationCounts({ placesLeft: 14, undecided: 43, chosen: 11, waitlist: 10 })).toEqual({
      invited: 11,
      waitlisted: 10,
      told: 22,
      unoffered: 3,
    });
    expect(invitationCounts({ placesLeft: 2, undecided: 2, chosen: 2, waitlist: null })).toEqual({
      invited: 2,
      waitlisted: 0,
      told: 0,
      unoffered: 0,
    });
  });
});

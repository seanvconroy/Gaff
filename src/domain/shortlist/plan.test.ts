import { describe, expect, it } from 'vitest';
import { defaultInviteCount, planInvitations } from './plan';

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

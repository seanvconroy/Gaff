import { describe, expect, it } from 'vitest';
import {
  adminToTakeOver,
  handover,
  inviteEmailsProblem,
  MAX_INVITES_AT_ONCE,
  parseInviteEmails,
  refusalFor,
} from './members';

const ann = { userId: 'ann', role: 'admin' } as const;
const bob = { userId: 'bob', role: 'negotiator' } as const;
const cara = { userId: 'cara', role: 'admin' } as const;

describe('UX-AG-16: the last admin', () => {
  it('can’t be removed, leave, or stop being an admin', () => {
    const team = [ann, bob];
    expect(refusalFor(team, { kind: 'remove', userId: 'ann' }, 'cara')).toBe('last_admin');
    expect(refusalFor(team, { kind: 'leave', userId: 'ann' })).toBe('last_admin');
    expect(refusalFor(team, { kind: 'change_role', userId: 'ann', role: 'negotiator' })).toBe(
      'last_admin',
    );
  });

  it('can, once another member is an admin', () => {
    const team = [ann, bob, cara];
    expect(refusalFor(team, { kind: 'remove', userId: 'ann' }, 'cara')).toBeNull();
    expect(refusalFor(team, { kind: 'leave', userId: 'ann' })).toBeNull();
    expect(refusalFor(team, { kind: 'change_role', userId: 'ann', role: 'negotiator' })).toBeNull();
  });

  it('an agent can always leave or be removed; removing yourself is leaving', () => {
    expect(refusalFor([ann, bob], { kind: 'remove', userId: 'bob' }, 'ann')).toBeNull();
    expect(refusalFor([ann, bob], { kind: 'leave', userId: 'bob' })).toBeNull();
    expect(refusalFor([ann, bob, cara], { kind: 'remove', userId: 'ann' }, 'ann')).toBe(
      'remove_yourself',
    );
    expect(refusalFor([ann], { kind: 'remove', userId: 'zoe' }, 'ann')).toBe('not_a_member');
  });
});

describe('UX-AG-15: handing over lettings', () => {
  const led = [{ lettingId: 'l1' }, { lettingId: 'l2' }, { lettingId: 'l3' }];

  it('each letting goes to the lead chosen for it, or else to the fallback', () => {
    const result = handover(led, { l1: 'cara', l2: 'bob' }, [ann, cara], 'ann');
    // Bob is the one leaving, so he can't be chosen: l2 falls back.
    expect(Object.fromEntries(result)).toEqual({ l1: 'cara', l2: 'ann', l3: 'ann' });
  });

  it('never leaves a letting without a lead', () => {
    const result = handover(led, {}, [ann], 'ann');
    expect([...result.values()].every(Boolean)).toBe(true);
    expect(result.size).toBe(3);
    expect(() => handover(led, {}, [ann], 'bob')).toThrow();
  });

  it('UX-AG-17: someone leaving hands their lettings to an admin', () => {
    expect(adminToTakeOver([bob, ann, cara], 'bob')).toBe('ann');
    expect(adminToTakeOver([ann, bob, cara], 'ann')).toBe('cara');
    expect(adminToTakeOver([ann, bob], 'ann')).toBeNull();
  });
});

describe('UX-AG-11: several emails in one field', () => {
  it('splits what was typed or pasted, lower-cases it, and keeps each once', () => {
    expect(parseInviteEmails('Ann@Example.ie, bob@example.ie;\nann@example.ie  <cara@example.ie>')).toEqual({
      emails: ['ann@example.ie', 'bob@example.ie', 'cara@example.ie'],
      invalid: [],
    });
  });

  it('names what isn’t an address, as typed', () => {
    const parsed = parseInviteEmails('ann@example.ie bob@');
    expect(parsed.invalid).toEqual(['bob@']);
    expect(inviteEmailsProblem(parsed)).toBe(
      'bob@ isn’t an email address. Check it, then send again.',
    );
  });

  it('asks for at least one, and at most twenty', () => {
    expect(inviteEmailsProblem(parseInviteEmails('  '))).toBe(
      'Enter an email address, like ann@example.ie',
    );
    const many = Array.from({ length: MAX_INVITES_AT_ONCE + 1 }, (_, n) => `p${n}@example.ie`);
    expect(inviteEmailsProblem(parseInviteEmails(many.join(' ')))).toBe(
      'Invite up to 20 people at a time.',
    );
    expect(inviteEmailsProblem(parseInviteEmails('ann@example.ie'))).toBeNull();
  });
});

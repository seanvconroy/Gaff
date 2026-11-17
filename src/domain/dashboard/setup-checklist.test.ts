import { describe, expect, it } from 'vitest';
import {
  MAX_SETUP_STEPS,
  setupChecklistFor,
  setupComplete,
  type SetupFacts,
} from './setup-checklist';

const LETTING = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';

const admin: SetupFacts = {
  organisationKind: 'agency',
  role: 'admin',
  joinedByInvite: false,
  finishedBefore: false,
  lettingLiveOrHeld: false,
  testableLettingId: null,
  testSeen: false,
  realEnquiry: false,
  draftLettingId: null,
  advertisedOn: [],
  forwardingInPlace: false,
  teamAnswered: false,
};
const landlord: SetupFacts = { ...admin, organisationKind: 'private_landlord' };
const agent: SetupFacts = { ...admin, role: 'negotiator' };

const codes = (facts: SetupFacts) => setupChecklistFor(facts)?.steps.map((s) => s.code) ?? null;

describe('UX-GR-1: at most three steps, one next step with one button, never dismissed', () => {
  it('an agency admin who advertises on Daft has the three steps, in order', () => {
    expect(codes({ ...admin, advertisedOn: ['daft'] })).toEqual([
      'add_letting',
      'forwarding',
      'invite_team',
    ]);
  });

  it('no kind of user ever has more than three', () => {
    for (const facts of [admin, landlord, agent]) {
      const list = setupChecklistFor({ ...facts, advertisedOn: ['daft', 'myhome', 'daft'] });
      expect(list!.total).toBeLessThanOrEqual(MAX_SETUP_STEPS);
    }
  });

  it('counts what is done, and points at the first step not done', () => {
    const list = setupChecklistFor({
      ...admin,
      lettingLiveOrHeld: true,
      testSeen: true,
      teamAnswered: true,
      advertisedOn: ['myhome'],
    });
    expect(list).toMatchObject({ done: 2, total: 3, next: { code: 'forwarding' } });
    expect(list!.portals).toEqual(['myhome']);
  });

  it('has no way to be dismissed: it goes only when every step is done', () => {
    const facts = { ...admin, lettingLiveOrHeld: true, testSeen: true, teamAnswered: true };
    expect(setupChecklistFor(facts)).toBeNull();
    expect(setupComplete(facts)).toBe(true);
  });

  it('once finished it never comes back, even if a later home is advertised on Daft', () => {
    expect(
      setupChecklistFor({ ...admin, finishedBefore: true, advertisedOn: ['daft'] }),
    ).toBeNull();
  });
});

describe('UX-GR-1: each kind of user has their own steps (section 9)', () => {
  it('an agency admin: their first letting, then their team', () => {
    expect(codes(admin)).toEqual(['add_letting', 'invite_team']);
    expect(setupChecklistFor(admin)!.next.href).toBe('/lettings/new?from=%2Ftoday');
  });

  it('a private landlord: their home, and forwarding only if they advertise elsewhere', () => {
    expect(codes(landlord)).toEqual(['add_letting']);
    expect(codes({ ...landlord, advertisedOn: ['daft'] })).toEqual(['add_letting', 'forwarding']);
  });

  it('an agency agent who joined by a request: their first letting only', () => {
    expect(codes({ ...agent, advertisedOn: ['daft'] })).toEqual(['add_letting']);
  });

  it('a landlord’s team admin invites their team too', () => {
    expect(codes({ ...admin, organisationKind: 'landlord' })).toEqual([
      'add_letting',
      'invite_team',
    ]);
  });

  it('carries on from a home already in set-up', () => {
    expect(setupChecklistFor({ ...admin, draftLettingId: DRAFT })!.next).toMatchObject({
      code: 'add_letting',
      href: `/lettings/${DRAFT}`,
    });
  });

  it('opens forwarding from the home that went live, and inviting with a way back to Today', () => {
    const live = { ...admin, lettingLiveOrHeld: true, testSeen: true };
    expect(
      setupChecklistFor({ ...live, testableLettingId: LETTING, advertisedOn: ['daft'] })!.next
        .href,
    ).toBe(`/forwarding?letting=${LETTING}`);
    expect(setupChecklistFor(live)!.next.href).toBe('/settings/team/invite?from=%2Ftoday');
  });
});

describe('UX-GR-2: nothing that isn’t needed yet', () => {
  it('has no forwarding step until a home is said to be on Daft or MyHome', () => {
    expect(codes(admin)).not.toContain('forwarding');
  });

  it('holds only the three steps of section 9: no bank details, template, calendar, photo or identity', () => {
    const all = new Set<string>();
    for (const facts of [admin, landlord, agent]) {
      for (const code of codes({ ...facts, advertisedOn: ['daft'] }) ?? []) all.add(code);
    }
    expect([...all].sort()).toEqual(['add_letting', 'forwarding', 'invite_team']);
  });
});

describe('UX-GR-3: a first letting ends with a test enquiry the person watches being answered', () => {
  const live = { ...landlord, lettingLiveOrHeld: true, testableLettingId: LETTING };

  it('isn’t done at go-live: it moves on to sending the test enquiry', () => {
    const list = setupChecklistFor(live)!;
    expect(list.done).toBe(0);
    expect(list.next).toEqual({
      code: 'see_test',
      href: `/lettings/${LETTING}/test-enquiry?from=%2Ftoday`,
      lettingId: LETTING,
    });
  });

  it('is done once a test has been seen answered', () => {
    expect(setupChecklistFor({ ...live, testSeen: true })).toBeNull();
  });

  it('is done when a real enquiry arrived first: there is nothing left to prove', () => {
    expect(setupChecklistFor({ ...live, realEnquiry: true })).toBeNull();
  });

  it('is done for a home held only by the agency being confirmed: no test can go yet', () => {
    expect(
      codes({ ...admin, lettingLiveOrHeld: true, testableLettingId: null, teamAnswered: false }),
    ).toEqual(['add_letting', 'invite_team']);
    expect(
      setupChecklistFor({ ...admin, lettingLiveOrHeld: true, testableLettingId: null })!.next.code,
    ).toBe('invite_team');
  });
});

describe('UX-GR-4: someone who joins by invite has no checklist', () => {
  it('an invited agent has none', () => {
    expect(setupChecklistFor({ ...agent, joinedByInvite: true })).toBeNull();
    expect(setupComplete({ ...agent, joinedByInvite: true })).toBe(false);
  });

  it('nor does an invited admin: the team was set up before they came', () => {
    expect(setupChecklistFor({ ...admin, joinedByInvite: true })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  chosenView,
  isMine,
  lettingsIn,
  lettingsViews,
  oneWorkingDayAfter,
  todayIn,
  todayViews,
  waitedOverAWorkingDay,
  type Viewer,
} from './views';

const viewer = (over: Partial<Viewer>): Viewer => ({
  userId: 'ann',
  role: 'admin',
  organisationKind: 'agency',
  members: 3,
  ...over,
});

// Irish time is UTC in November.
const irish = (date: string, time: string) => new Date(`${date}T${time}:00Z`);

describe('UX-HM-11: who can switch Today between "Mine" and "Everyone"', () => {
  it('an admin of an agency with colleagues can', () => {
    expect(todayViews(viewer({}))).toEqual(['mine', 'everyone']);
  });

  it('an admin of a landlord’s team with colleagues can', () => {
    expect(todayViews(viewer({ organisationKind: 'landlord' }))).toEqual(['mine', 'everyone']);
  });

  it('an agent can’t: they see what they lead', () => {
    expect(todayViews(viewer({ role: 'negotiator' }))).toEqual(['mine']);
  });

  it('a team of one has nobody else’s to see, whether an agency or a landlord’s', () => {
    expect(todayViews(viewer({ members: 1 }))).toEqual(['mine']);
    expect(todayViews(viewer({ organisationKind: 'landlord', members: 1 }))).toEqual(['mine']);
  });

  it('a private landlord never sees a switch', () => {
    expect(todayViews(viewer({ organisationKind: 'private_landlord', members: 1 }))).toEqual([
      'mine',
    ]);
    expect(lettingsViews(viewer({ organisationKind: 'private_landlord', members: 1 }))).toEqual([
      'mine',
    ]);
  });
});

describe('UX-AG-8: every member of a team can see every home it runs, on Lettings', () => {
  it('an admin and an agent can both switch Lettings to "Everyone"', () => {
    expect(lettingsViews(viewer({}))).toEqual(['mine', 'everyone']);
    expect(lettingsViews(viewer({ role: 'negotiator' }))).toEqual(['mine', 'everyone']);
  });

  it('a team of one has no switch', () => {
    expect(lettingsViews(viewer({ members: 1 }))).toEqual(['mine']);
  });
});

describe('the view shown', () => {
  it('is "Mine" unless "Everyone" is asked for by someone who has it', () => {
    expect(chosenView(undefined, ['mine', 'everyone'])).toBe('mine');
    expect(chosenView('everyone', ['mine', 'everyone'])).toBe('everyone');
    expect(chosenView('mine', ['mine', 'everyone'])).toBe('mine');
    expect(chosenView('anything', ['mine', 'everyone'])).toBe('mine');
  });

  it('is never "Everyone" for someone who can’t switch, whatever the address says', () => {
    expect(chosenView('everyone', ['mine'])).toBe('mine');
  });
});

describe('UX-AG-9: what is a person’s own', () => {
  it('is what they lead', () => {
    expect(isMine({ leadUserId: 'ann' }, 'ann')).toBe(true);
    expect(isMine({ leadUserId: 'niamh' }, 'ann')).toBe(false);
  });

  it('and what nobody leads, so nothing sits unseen', () => {
    expect(isMine({ leadUserId: null }, 'ann')).toBe(true);
    expect(isMine({ leadUserId: null }, 'niamh')).toBe(true);
  });
});

describe('one working day', () => {
  it('is the same time the next day, Monday to Thursday', () => {
    // Monday 16 November 2026, 3pm.
    expect(oneWorkingDayAfter(irish('2026-11-16', '15:00'))).toEqual(irish('2026-11-17', '15:00'));
    expect(oneWorkingDayAfter(irish('2026-11-19', '09:30'))).toEqual(irish('2026-11-20', '09:30'));
  });

  it('skips the weekend: Friday 3pm is up on Monday 3pm', () => {
    expect(oneWorkingDayAfter(irish('2026-11-20', '15:00'))).toEqual(irish('2026-11-23', '15:00'));
  });

  it('starts counting on Monday for anything that arrives on a weekend', () => {
    expect(oneWorkingDayAfter(irish('2026-11-21', '10:00'))).toEqual(irish('2026-11-24', '00:00'));
    expect(oneWorkingDayAfter(irish('2026-11-22', '23:30'))).toEqual(irish('2026-11-24', '00:00'));
  });

  it('keeps the clock time across a change of the clocks, in Irish time', () => {
    // Clocks go forward on Sunday 28 March 2027. Friday 26 March, 3pm is 15:00 UTC; Monday 3pm
    // Irish time is 14:00 UTC.
    expect(oneWorkingDayAfter(new Date('2027-03-26T15:00:00Z'))).toEqual(
      new Date('2027-03-29T14:00:00Z'),
    );
  });

  it('something has waited over a working day only once that moment has passed', () => {
    const since = irish('2026-11-20', '15:00');
    expect(waitedOverAWorkingDay(since, irish('2026-11-23', '15:00'))).toBe(false);
    expect(waitedOverAWorkingDay(since, irish('2026-11-23', '15:01'))).toBe(true);
    expect(waitedOverAWorkingDay(since, irish('2026-11-22', '12:00'))).toBe(false);
  });

  it('counts something Gaff has no time for as waiting, so it is shown and not hidden', () => {
    expect(waitedOverAWorkingDay(null, irish('2026-11-16', '09:00'))).toBe(true);
  });
});

describe('UX-HM-11: what each view of Today shows', () => {
  const now = irish('2026-11-18', '12:00'); // Wednesday
  const items = [
    { id: 'mine-new', leadUserId: 'ann', since: irish('2026-11-18', '11:00') },
    { id: 'theirs-new', leadUserId: 'niamh', since: irish('2026-11-18', '09:00') },
    { id: 'theirs-old', leadUserId: 'niamh', since: irish('2026-11-16', '09:00') },
    { id: 'nobody’s', leadUserId: null, since: irish('2026-11-18', '11:30') },
    { id: 'theirs-unknown', leadUserId: 'tom', since: null },
  ];
  const ids = (list: ReadonlyArray<{ id: string }>) => list.map((item) => item.id);

  it('"Mine" is what the person leads, and what nobody leads', () => {
    expect(ids(todayIn('mine', items, { userId: 'ann' }, now))).toEqual(['mine-new', 'nobody’s']);
    expect(ids(todayIn('mine', items, { userId: 'niamh' }, now))).toEqual([
      'theirs-new',
      'theirs-old',
      'nobody’s',
    ]);
  });

  it('"Everyone" adds anything that has waited more than one working day on anyone else', () => {
    expect(ids(todayIn('everyone', items, { userId: 'ann' }, now))).toEqual([
      'mine-new',
      'theirs-old',
      'nobody’s',
      'theirs-unknown',
    ]);
  });

  it('keeps the order it was given: the one ordering rule (UX-HM-4)', () => {
    const reversed = [...items].reverse();
    expect(ids(todayIn('everyone', reversed, { userId: 'ann' }, now))).toEqual([
      'theirs-unknown',
      'nobody’s',
      'theirs-old',
      'mine-new',
    ]);
  });
});

describe('what each view of Lettings shows', () => {
  const lettings = [
    { id: 'a', leadUserId: 'ann' },
    { id: 'b', leadUserId: 'niamh' },
    { id: 'c', leadUserId: null },
  ];

  it('"Mine" is the homes a person leads; "Everyone" is every home', () => {
    expect(lettingsIn('mine', lettings, { userId: 'ann' }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(lettingsIn('everyone', lettings, { userId: 'ann' }).map((l) => l.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

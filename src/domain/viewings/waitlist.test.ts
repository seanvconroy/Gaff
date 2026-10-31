import { describe, expect, it } from 'vitest';
import { chooseOffers, heldForOthers, planOffer } from './waitlist';

const now = new Date('2026-11-05T12:00:00Z');
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

const list = [
  { id: 'third', waitlistPosition: 3 },
  { id: 'first', waitlistPosition: 1 },
  { id: 'second', waitlistPosition: 2 },
];
const ids = (people: Array<{ id: string }>) => people.map((p) => p.id);
const holds = { mode: 'one_at_a_time' as const, expiresAt: inHours(2) };

describe('R14: offering a freed place to the waiting list (Q2)', () => {
  it('offers to one person at a time, with a 2-hour hold, when there’s time', () => {
    expect(planOffer(inHours(30), now)).toEqual({ mode: 'one_at_a_time', expiresAt: inHours(2) });
  });

  it('shortens the hold so the place opens to everyone 4 hours before the viewing', () => {
    expect(planOffer(inHours(5), now)).toEqual({ mode: 'one_at_a_time', expiresAt: inHours(1) });
  });

  it('within 4 hours of the viewing, offers it to everyone at once', () => {
    expect(planOffer(inHours(3), now)).toEqual({ mode: 'everyone' });
  });

  it('doesn’t offer a place that’s about to start', () => {
    expect(planOffer(new Date(now.getTime() + 10 * 60_000), now)).toEqual({ mode: 'too_late' });
  });

  const none = new Set<string>();
  const base = { plan: holds, open: [], offered: none, holding: none, waitlisted: list };

  it('goes down the waiting list in ranked order, skipping people already offered it', () => {
    expect(ids(chooseOffers({ ...base, free: 1 }))).toEqual(['first']);
    expect(ids(chooseOffers({ ...base, free: 1, offered: new Set(['first']) }))).toEqual([
      'second',
    ]);
    const everyoneOffered = new Set(['first', 'second', 'third']);
    expect(chooseOffers({ ...base, free: 1, offered: everyoneOffered })).toEqual([]);
  });

  it('offers each free place to its own person, and only places nobody holds', () => {
    expect(ids(chooseOffers({ ...base, free: 2 }))).toEqual(['first', 'second']);
    const firstHolds = [{ applicationId: 'first', mode: 'one_at_a_time' as const }];
    const offered = new Set(['first']);
    expect(ids(chooseOffers({ ...base, free: 2, open: firstHolds, offered }))).toEqual(['second']);
    expect(chooseOffers({ ...base, free: 1, open: firstHolds, offered })).toEqual([]);
    expect(chooseOffers({ ...base, free: 0 })).toEqual([]);
  });

  it('doesn’t hold two places for one person', () => {
    expect(ids(chooseOffers({ ...base, free: 1, holding: new Set(['first']) }))).toEqual([
      'second',
    ]);
  });

  it('once open to everyone, tells everyone left except people who already hold an offer', () => {
    const offers = chooseOffers({
      ...base,
      plan: { mode: 'everyone' },
      free: 1,
      open: [{ applicationId: 'second', mode: 'one_at_a_time' }],
      offered: new Set(['first', 'second']),
    });
    expect(ids(offers)).toEqual(['first', 'third']);
  });

  it('never offers a place that’s too close to the start', () => {
    const offers = chooseOffers({ ...base, plan: { mode: 'too_late' }, free: 3 });
    expect(offers).toEqual([]);
  });

  it('counts a place held for someone else as taken, but not your own hold', () => {
    const open = [
      { applicationId: 'first', mode: 'one_at_a_time' as const },
      { applicationId: 'second', mode: 'everyone' as const },
    ];
    expect(heldForOthers(open, 'someone-invited')).toBe(1);
    expect(heldForOthers(open, 'first')).toBe(0);
  });
});

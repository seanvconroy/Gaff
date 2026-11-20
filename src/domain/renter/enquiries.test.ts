import { describe, expect, it } from 'vitest';
import { collectedAt, type RenterView } from './path';
import { countNeedingThem, enquiryIsOver, enquiryNeedsThem, sortEnquiries } from './enquiries';

const views = Object.keys(collectedAt) as RenterView[];
const at = (view: RenterView) => ({ view, checkToDo: false, tenantTask: null });

describe('UX-RH-1: which homes need the renter', () => {
  it('UX-RH-1: a page with a button for them to press needs them', () => {
    const needing = views.filter((view) => enquiryNeedsThem(at(view)));
    expect(needing).toEqual([
      'questions',
      'invited',
      'cancelled',
      'place_offered',
      'after_viewing',
      'offer',
    ]);
  });

  it('UX-RH-1: the checks need them while there is one to do, and not while they wait', () => {
    expect(enquiryNeedsThem({ ...at('checks'), checkToDo: true })).toBe(true);
    expect(enquiryNeedsThem({ ...at('checks'), checkToDo: false })).toBe(false);
  });

  it('UX-RH-1: a tenant is needed to sign, pay and confirm, and not while the lister acts', () => {
    for (const tenantTask of ['sign', 'pay', 'pps', 'inventory'] as const) {
      expect(enquiryNeedsThem({ ...at('tenancy'), tenantTask })).toBe(true);
    }
    for (const tenantTask of [
      'agreement_coming',
      'agreement_countersign',
      'payment_coming',
      'moving_in',
      'moved_in',
    ] as const) {
      expect(enquiryNeedsThem({ ...at('tenancy'), tenantTask })).toBe(false);
    }
  });

  it('rule 1: waiting on a person’s decision never reads as something to do', () => {
    for (const view of ['answers_sent', 'waiting_list', 'not_invited_yet', 'applied'] as const) {
      expect(enquiryNeedsThem(at(view))).toBe(false);
    }
  });
});

describe('UX-RH-5: a let or closed home stays, marked', () => {
  it('UX-RH-5: which rows are over', () => {
    expect(views.filter(enquiryIsOver)).toEqual([
      'offer_closed',
      'offer_declined',
      'let_to_someone_else',
      'home_closed',
      'withdrawn',
    ]);
  });
});

describe('UX-RH-1: the order of the list', () => {
  it('UX-RH-1: rows that need them come first, then the rest, then the ones that are over', () => {
    const row = (name: string, needsYou: boolean, over: boolean, day: number) => ({
      name,
      needsYou,
      over,
      lastActivity: new Date(Date.UTC(2026, 10, day)),
    });
    const sorted = sortEnquiries([
      row('let', false, true, 16),
      row('waiting', false, false, 10),
      row('book', true, false, 3),
      row('applied', false, false, 14),
      row('offer', true, false, 12),
    ]);
    expect(sorted.map((each) => each.name)).toEqual(['offer', 'book', 'applied', 'waiting', 'let']);
    expect(countNeedingThem(sorted)).toBe(2);
  });
});

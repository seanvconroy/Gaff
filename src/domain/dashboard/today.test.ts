import { describe, expect, it } from 'vitest';
import { needsYouToday, type LettingSnapshot } from './today';

const letting = (over: Partial<LettingSnapshot>): LettingSnapshot => ({
  id: 'l1',
  addressLine1: '12 Ranelagh Road',
  status: 'live',
  undecided: 0,
  toMark: 0,
  toChoose: 0,
  firstViewingAt: null,
  ...over,
});

describe('R28: what needs a decision today', () => {
  it('is empty when nothing needs a person', () => {
    expect(
      needsYouToday({ approvals: 0, attention: 0, questions: 0, lettings: [letting({})] }),
    ).toEqual([]);
  });

  it('puts renters waiting on a reply first, then attendance, then who views, then set-up', () => {
    const items = needsYouToday({
      approvals: 2,
      attention: 1,
      questions: 3,
      lettings: [
        letting({ id: 'draft', addressLine1: '7 Seaview', status: 'draft' }),
        letting({ id: 'later', undecided: 4, firstViewingAt: new Date('2026-11-09T18:00:00Z') }),
        letting({ id: 'sooner', undecided: 2, firstViewingAt: new Date('2026-11-07T18:00:00Z') }),
        letting({ id: 'today', toMark: 3 }),
        letting({ id: 'applied', toChoose: 2 }),
        letting({ id: 'approved', readyToOffer: true }),
        letting({ id: 'declined', needsNewChoice: true }),
        letting({ id: 'let', status: 'let', rtbDueBy: '2027-01-01' }),
        letting({ id: 'signing', status: 'let', tenancyStep: 'sign_agreement' }),
      ],
    });
    expect(items.map((i) => ('lettingId' in i ? `${i.kind}:${i.lettingId}` : i.kind))).toEqual([
      'approvals',
      'attention',
      'questions',
      'attendance:today',
      'tenancy:signing',
      'rtb:let',
      'choose:applied',
      'offer:approved',
      'rechoose:declined',
      'shortlist:sooner',
      'shortlist:later',
      'setup:draft',
    ]);
  });

  it('only asks who views for lettings taking enquiries', () => {
    const items = needsYouToday({
      approvals: 0,
      attention: 0,
      questions: 0,
      lettings: [letting({ status: 'paused', undecided: 3 })],
    });
    expect(items).toEqual([]);
  });
});

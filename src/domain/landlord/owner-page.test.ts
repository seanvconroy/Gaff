import { describe, expect, it } from 'vitest';
import {
  MAX_FIGURES,
  OWNER_RECORD,
  letSummary,
  ownerDecisions,
  ownerFigures,
  ownerRecord,
  whereItStands,
  type OwnerFacts,
  type RecordStep,
} from './owner-page';
import { stages } from '@/domain/lettings/stages';

const none = {
  enquiries: 0,
  answered: 0,
  invited: 0,
  waitlisted: 0,
  booked: 0,
  came: 0,
  didNotCome: 0,
  applied: 0,
};

function facts(over: Partial<OwnerFacts> & { numbers?: Partial<OwnerFacts['numbers']> }) {
  return {
    stage: 'enquiries',
    status: 'live',
    places: 14,
    meetEverything: null,
    checks: null,
    approval: 'not_asked',
    offer: 'none',
    ...over,
    numbers: { ...none, ...over.numbers },
  } satisfies OwnerFacts;
}

describe('UX-OP-1: where the letting stands, in one sentence', () => {
  it('UX-OP-1: follows the letting from set-up to let', () => {
    expect(whereItStands(facts({ stage: 'setup', status: 'draft' }))).toEqual({
      code: 'setting_up',
    });
    expect(whereItStands(facts({}))).toEqual({ code: 'no_enquiries' });
    expect(whereItStands(facts({ numbers: { enquiries: 23 } }))).toEqual({
      code: 'enquiries',
      enquiries: 23,
    });
    expect(
      whereItStands(facts({ stage: 'viewings', numbers: { enquiries: 23, booked: 8 } })),
    ).toEqual({ code: 'viewings', booked: 8, places: 14 });
    expect(whereItStands(facts({ stage: 'applications', numbers: { applied: 6 } }))).toEqual({
      code: 'applications',
      applied: 6,
    });
    expect(whereItStands(facts({ stage: 'checks' }))).toEqual({ code: 'checks' });
    expect(whereItStands(facts({ stage: 'tenancy', status: 'let' }))).toEqual({ code: 'let' });
    expect(whereItStands(facts({ stage: 'close', status: 'withdrawn' }))).toEqual({
      code: 'withdrawn',
    });
  });

  it('UX-OP-1: says what the owner’s own answer and the offer have come to', () => {
    expect(whereItStands(facts({ stage: 'checks', approval: 'asked' }))).toEqual({
      code: 'approval_asked',
    });
    expect(whereItStands(facts({ stage: 'checks', approval: 'approved' }))).toEqual({
      code: 'approved',
    });
    expect(whereItStands(facts({ stage: 'checks', approval: 'declined' }))).toEqual({
      code: 'declined',
    });
    expect(whereItStands(facts({ stage: 'offer', approval: 'approved', offer: 'open' }))).toEqual({
      code: 'offer_out',
    });
    expect(
      whereItStands(facts({ stage: 'offer', approval: 'approved', offer: 'expired' })),
    ).toEqual({ code: 'offer_not_taken' });
  });
});

describe('UX-OP-1: the figures', () => {
  it('UX-OP-1: never more than three, at any stage', () => {
    for (const stage of stages) {
      for (const status of ['draft', 'live', 'let', 'withdrawn'] as const) {
        const shown = ownerFigures(
          facts({
            stage,
            status,
            meetEverything: 4,
            checks: { done: 2, total: 4 },
            numbers: {
              enquiries: 23,
              answered: 20,
              invited: 14,
              waitlisted: 5,
              booked: 8,
              came: 7,
              applied: 6,
            },
          }),
        );
        expect(shown.length, `${stage} ${status}`).toBeLessThanOrEqual(MAX_FIGURES);
      }
    }
  });

  it('UX-OP-1: shows the figures of the stage the letting is in', () => {
    const numbers = { enquiries: 23, answered: 20, invited: 14, waitlisted: 5, booked: 8 };
    expect(ownerFigures(facts({ numbers, meetEverything: 9 }))).toEqual([
      { code: 'enquiries', value: 23 },
      { code: 'answered', value: 20 },
      { code: 'meet_everything', value: 9 },
    ]);
    expect(ownerFigures(facts({ stage: 'viewings', numbers }))).toEqual([
      { code: 'invited', value: 14 },
      { code: 'booked', value: 8, of: 14 },
      { code: 'waitlisted', value: 5 },
    ]);
    expect(
      ownerFigures(facts({ stage: 'viewings', numbers: { ...numbers, came: 3 } })).at(-1),
    ).toEqual({ code: 'came', value: 3 });
    expect(
      ownerFigures(
        facts({
          stage: 'checks',
          checks: { done: 3, total: 4 },
          numbers: { ...numbers, came: 7, applied: 6 },
        }),
      ),
    ).toEqual([
      { code: 'came', value: 7 },
      { code: 'applied', value: 6 },
      { code: 'checks_done', value: 3, of: 4 },
    ]);
  });

  it('UX-OP-1: never shows a figure that is zero only because its stage hasn’t come', () => {
    const early = ownerFigures(facts({ numbers: { enquiries: 3, answered: 1 } }));
    expect(early.map((figure) => figure.code)).toEqual(['enquiries', 'answered']);
    // Nobody has been invited, booked, come or applied yet: none of those is on the page.
    expect(ownerFigures(facts({}))).toEqual([]);
    expect(ownerFigures(facts({ stage: 'setup', status: 'draft' }))).toEqual([]);
    // A let home's page is a summary, with no running figures.
    expect(ownerFigures(facts({ stage: 'tenancy', status: 'let' }))).toEqual([]);
  });
});

function step(id: number, type: string, over: Partial<RecordStep> = {}): RecordStep {
  return {
    id,
    type,
    data: {},
    at: new Date(Date.UTC(2026, 10, 1, 9, id)),
    actorType: 'system',
    actorId: null,
    personName: null,
    ...over,
  };
}

describe('UX-OP-3: what the record shows an owner', () => {
  const record = [
    step(1, 'letting.draft_saved'),
    step(2, 'rent_check.recorded'),
    step(3, 'letting.went_live', { actorType: 'person', personName: 'Ann Power' }),
    step(4, 'enquiry.received'),
    step(5, 'message.sent', { data: { kind: 'first_reply', author: 'template' } }),
    step(6, 'answers.drafted', { actorType: 'ai' }),
    step(7, 'message.approved'),
    step(8, 'application.answered', { actorType: 'renter', actorId: 'a1' }),
    step(9, 'shortlist.decided', { actorType: 'person', personName: 'Ann Power' }),
    step(10, 'message.sent', { data: { kind: 'invitation', author: 'template' } }),
    step(11, 'viewing.booked', { actorType: 'renter', actorId: 'a1' }),
    step(12, 'letting.shared_with_landlord'),
    step(13, 'application.submitted', { actorType: 'renter', actorId: 'a1' }),
    step(14, 'applicants.chosen', { actorType: 'person', personName: 'Ann Power' }),
    step(15, 'check.completed'),
    step(16, 'landlord.approval_answered', { actorType: 'landlord' }),
    step(17, 'a.step.added.later'),
  ];

  it('UX-OP-3: keeps enquiries, invitations, viewings, applications and decisions, newest first', () => {
    expect(ownerRecord(record).map((each) => each.type)).toEqual([
      'landlord.approval_answered',
      'applicants.chosen',
      'application.submitted',
      'viewing.booked',
      'shortlist.decided',
      'application.answered',
      'enquiry.received',
      'letting.went_live',
    ]);
  });

  it('UX-OP-3: leaves out Gaff’s internal steps, and any step nobody has decided to show', () => {
    const shown = ownerRecord(record).map((each) => each.type);
    for (const internal of [
      'message.sent',
      'answers.drafted',
      'message.approved',
      'letting.draft_saved',
      'rent_check.recorded',
      'letting.shared_with_landlord',
      'check.completed',
      'a.step.added.later',
    ]) {
      expect(shown, internal).not.toContain(internal);
    }
    // No kind of message, and nothing the assistant did, is ever on the list.
    expect(OWNER_RECORD.filter((type) => /^(message|answers|question|reply)\./.test(type))).toEqual(
      [],
    );
  });

  it('UX-OP-1: “What’s been decided” is decisions only, newest first', () => {
    expect(ownerDecisions(record).map((each) => each.type)).toEqual([
      'landlord.approval_answered',
      'applicants.chosen',
      'shortlist.decided',
      'letting.went_live',
    ]);
  });
});

describe('UX-OP-5: the summary once the home is let', () => {
  const firstEnquiryAt = new Date('2026-11-01T09:00:00Z');
  const tenancy = { rentCents: 185_000, startDate: '2026-12-13', rtbRegisteredAt: null };

  it('UX-OP-5: counts days to let from the first enquiry to the signed agreement', () => {
    expect(
      letSummary({
        firstEnquiryAt,
        signedAt: new Date('2026-11-19T15:00:00Z'),
        acceptedAt: new Date('2026-11-17T10:00:00Z'),
        closedAt: null,
        askingRentCents: 190_000,
        tenancy: { ...tenancy, rtbRegisteredAt: new Date('2026-12-20T10:00:00Z') },
      }),
    ).toEqual({
      daysToLet: 18,
      rentCents: 185_000,
      startDate: '2026-12-13',
      rtbRegisteredAt: new Date('2026-12-20T10:00:00Z'),
    });
  });

  it('UX-OP-5: until it’s signed, counts to the day the offer was accepted', () => {
    expect(
      letSummary({
        firstEnquiryAt,
        signedAt: null,
        acceptedAt: new Date('2026-11-17T10:00:00Z'),
        closedAt: null,
        askingRentCents: 185_000,
        tenancy,
      }),
    ).toMatchObject({ daysToLet: 16, rtbRegisteredAt: null });
  });

  it('UX-OP-5: a home closed as let with no tenancy on Gaff shows the rent asked, and no dates it doesn’t know', () => {
    expect(
      letSummary({
        firstEnquiryAt: null,
        signedAt: null,
        acceptedAt: null,
        closedAt: new Date('2026-11-20T10:00:00Z'),
        askingRentCents: 185_000,
        tenancy: null,
      }),
    ).toEqual({ daysToLet: null, rentCents: 185_000, startDate: null, rtbRegisteredAt: null });
  });
});

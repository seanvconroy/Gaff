import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, lettings } from '@/db/schema';
import { needsYouOn } from '@/domain/lettings/overview';
import { factsFor } from '@/server/answers/facts';
import { saveAnswers } from '@/server/lettings/drafts';
import { overviewFactsFor, peopleFor } from '@/server/lettings/page';
import { getLetting } from '@/server/lettings/queries';
import { timelineFor } from '@/server/timeline/timeline';
import { aLiveLetting, aRenterEnquires, createTestMember } from './helpers';

describe('UX-LP-12: a live home’s facts change at any time, and answers use them from then on', () => {
  it('UX-LP-12: a changed fact is what Gaff answers from next, and the change is recorded', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await saveAnswers(member, lettingId, {
      step: 'home',
      patch: { parking: 'space' },
      advance: false,
    });
    const facts = await withOrg(member.organisationId, async (tx) => {
      const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
      return factsFor(tx, letting!);
    });
    expect(facts.map((f) => f.text)).toContain('Parking: A parking space');
    const changed = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'letting.details_changed'))),
    );
    // Rule 8: the record holds which part changed, never what it says.
    expect(changed.map((e) => e.data)).toEqual([{ step: 'home' }]);
  });

  it('UX-LP-12: the address and rent are set up once, and don’t change from Home', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await expect(
      saveAnswers(member, lettingId, {
        step: 'address',
        patch: { addressLine1: '1 Other Road' },
        advance: false,
      }),
    ).rejects.toThrow('This home is live now');
  });
});

describe('UX-LP-1: the task on a letting’s page is the item Today shows for it', () => {
  it('UX-LP-1: with people waiting to hear, it is Choose who views', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await aRenterEnquires(member, 1);
    const detail = await getLetting(member, lettingId);
    const { facts } = await overviewFactsFor(member, detail!);
    expect(facts.today.map((item) => item.kind)).toContain('shortlist');
    expect(needsYouOn(facts)).toMatchObject({
      kind: 'task',
      action: 'Choose who views',
      href: `/lettings/${lettingId}/who-views`,
    });
    expect(facts.enquiries).toBe(1);
  });
});

describe('UX-LP-8, UX-LP-9: People is everyone who enquired, in the ranking’s order', () => {
  it('UX-LP-8: answered first, then by enquiry time; nobody is hidden; rule 2 holds', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const first = await aRenterEnquires(member, 1);
    const second = await aRenterEnquires(member, 2, { occupants: '2', hasPets: 'no' });
    const people = await peopleFor(member, lettingId);
    expect(people.map((p) => p.id)).toEqual([second, first]);
    expect(people[0]).toMatchObject({ met: 2, total: 2, answered: true });
    // Before anyone applies, nothing about income or checks is held, so none is shown.
    for (const person of people) {
      expect(person.sheet.income).toEqual([]);
      expect(person.sheet.checks).toEqual([]);
      expect(person.sheet.conversationHref).toBe(`/inbox/renter-${person.id}`);
    }
    expect(people[0]!.sheet.told.map((row) => row.label)).toEqual(
      expect.arrayContaining(['People', 'Pets']),
    );
  });
});

describe('UX-LP-6: History marks the decisions people made', () => {
  it('UX-LP-6: going live is a decision; a first reply is not', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await aRenterEnquires(member, 1);
    const entries = await timelineFor(member, lettingId);
    const decisions = entries.filter((e) => e.decision).map((e) => e.what);
    expect(decisions.some((what) => /Set-up confirmed/.test(what))).toBe(true);
    expect(decisions.some((what) => /First reply/.test(what))).toBe(false);
  });
});

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, decisions, lettings, messages } from '@/db/schema';
import { inviteToView } from '@/server/shortlist/invite';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { aLiveLetting, aRenterEnquires, createTestMember } from './helpers';

async function setUp() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member); // 4 places; up to 3 people, no pets
  const ids = {
    noAnswer: await aRenterEnquires(member, 1),
    pets: await aRenterEnquires(member, 2, { occupants: '2', hasPets: 'yes' }),
    best: await aRenterEnquires(member, 3, { occupants: '3', hasPets: 'no' }),
    second: await aRenterEnquires(member, 4, { occupants: '1', hasPets: 'no' }),
  };
  return { member, lettingId, ids };
}

describe('R11: a person approves who views, in one action', () => {
  it('invites who they chose, waitlists the next in rank, and tells everyone else', async () => {
    const { member, lettingId, ids } = await setUp();
    const counts = await inviteToView(member, lettingId, {
      chosenIds: [ids.best, ids.second],
      waitlistSize: 1,
    });
    expect(counts).toEqual({ invited: 2, waitlisted: 1, notInvited: 1 });

    const people = await withOrg(member.organisationId, (tx) =>
      tx
        .select({
          id: applications.id,
          status: applications.status,
          position: applications.waitlistPosition,
        })
        .from(applications)
        .where(eq(applications.lettingId, lettingId)),
    );
    const status = Object.fromEntries(people.map((p) => [p.id, [p.status, p.position]]));
    expect(status[ids.best]).toEqual(['invited', null]);
    expect(status[ids.second]).toEqual(['invited', null]);
    expect(status[ids.pets]).toEqual(['waitlisted', 1]);
    expect(status[ids.noAnswer]).toEqual(['not_invited', null]);

    const sent = await withOrg(member.organisationId, (tx) =>
      tx
        .select({
          applicationId: messages.applicationId,
          kind: messages.kind,
          author: messages.author,
          body: messages.body,
        })
        .from(messages)
        .where(eq(messages.lettingId, lettingId)),
    );
    const kinds = (id: string) =>
      sent
        .filter((m) => m.applicationId === id)
        .map((m) => m.kind)
        .sort();
    expect(kinds(ids.best)).toEqual(['enquiry', 'first_reply', 'invitation']);
    expect(kinds(ids.pets)).toEqual(['enquiry', 'first_reply', 'waitlisted']);
    expect(kinds(ids.noAnswer)).toEqual(['enquiry', 'first_reply', 'holding']);
    expect(
      sent
        .filter((m) => ['invitation', 'waitlisted', 'holding'].includes(m.kind))
        .every((m) => m.author === 'template'),
    ).toBe(true);
    expect(sent.find((m) => m.kind === 'invitation')!.body).toMatch(/\/r\/[A-Za-z0-9_-]{43}/);

    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting?.stage).toBe('viewings');
  });

  it('records the decision with the criteria and ranking the person saw, and no personal data', async () => {
    const { member, lettingId, ids } = await setUp();
    await inviteToView(member, lettingId, { chosenIds: [ids.best], waitlistSize: 0 });
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'invite_to_view')),
    );
    expect(decision?.decidedBy).toBe(member.userId);
    const basis = decision!.basis as {
      criteria: unknown;
      ranking: Array<{ applicationId: string; position: number }>;
      invited: string[];
    };
    expect(basis.criteria).toEqual({ maxOccupants: 3, noPets: true });
    expect(basis.ranking.map((r) => r.applicationId)).toEqual([
      ids.best,
      ids.second,
      ids.pets,
      ids.noAnswer,
    ]);
    expect(basis.invited).toEqual([ids.best]);
    expect(JSON.stringify(basis)).not.toMatch(/Renter|example\.ie|087/);
  });

  it('won’t decide anyone twice', async () => {
    const { member, lettingId, ids } = await setUp();
    await inviteToView(member, lettingId, { chosenIds: [ids.best], waitlistSize: 5 });
    await expect(
      inviteToView(member, lettingId, { chosenIds: [ids.best], waitlistSize: 0 }),
    ).rejects.toThrow(/already been decided/);
    expect((await shortlistFor(member, lettingId)).filter((r) => r.status === 'enquired')).toEqual(
      [],
    );
  });
});

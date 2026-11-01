import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, viewingSlots } from '@/db/schema';
import { createLetting } from '@/server/lettings/create-letting';
import { getLetting, listLettings } from '@/server/lettings/queries';
import { addViewingSession, removeViewingSession } from '@/server/lettings/viewing-sessions';
import { aLetting, aViewingSession } from '../fixtures/lettings';
import { createTestMember } from './helpers';

describe('R1: create a letting', () => {
  it('creates the letting in set-up, with its landlord and key facts', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const detail = await getLetting(member, lettingId);
    expect(detail?.letting).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      monthlyRentCents: 185_000,
      stage: 'setup',
      status: 'draft',
      createdBy: member.userId,
    });
    expect(detail?.landlord).toMatchObject({ name: 'Mary Byrne', email: 'mary.byrne@example.ie' });
    expect(detail?.facts.map((f) => f.answer)).toEqual([
      'Gas central heating',
      'Bins collected on Tuesdays',
    ]);
    expect(await listLettings(member)).toHaveLength(1);
  });

  it('records who created it, with no personal data in the record (R27, ADR-0006)', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    expect(event).toMatchObject({
      type: 'letting.created',
      actorType: 'person',
      actorId: member.userId,
      data: { setupFacts: 2, withLandlord: true },
    });
    expect(JSON.stringify(event?.data)).not.toMatch(/Mary|Ranelagh|example\.ie/);
  });

  it('another organisation cannot see it (ADR-0004)', async () => {
    const owner = await createTestMember();
    const other = await createTestMember();
    const { lettingId } = await createLetting(owner, aLetting());
    expect(await getLetting(other, lettingId)).toBeNull();
    expect(await listLettings(other)).toEqual([]);
  });
});

describe('R1: viewing times', () => {
  it('adds a session of slots and creates one bookable slot each', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await addViewingSession(member, lettingId, aViewingSession());
    const slots = await withOrg(member.organisationId, (tx) =>
      tx.select().from(viewingSlots).where(eq(viewingSlots.lettingId, lettingId)),
    );
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.capacity === 1)).toBe(true);
    const detail = await getLetting(member, lettingId);
    expect(detail?.setup.viewingSlots).toBe(4);
    expect(detail?.places).toBe(4);
  });

  it('refuses a session that overlaps another, and says which', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await addViewingSession(member, lettingId, aViewingSession());
    await expect(
      addViewingSession(
        member,
        lettingId,
        aViewingSession({ start: '18:30', end: '19:30', kind: 'group', capacity: '8' }),
      ),
    ).rejects.toThrow(/overlaps the viewing on .*, 6pm/);
  });

  it('removes a session and its slots, and records it', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const { sessionId } = await addViewingSession(
      member,
      lettingId,
      aViewingSession({ kind: 'group', capacity: '10', slotMinutes: '' }),
    );
    await removeViewingSession(member, lettingId, sessionId);
    const detail = await getLetting(member, lettingId);
    expect(detail?.sessions).toEqual([]);
    expect(detail?.setup.viewingSlots).toBe(0);
    const types = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type })
        .from(events)
        .where(eq(events.lettingId, lettingId))
        .orderBy(asc(events.id)),
    );
    expect(types.map((t) => t.type)).toEqual([
      'letting.created',
      'viewings.session_added',
      'viewings.session_removed',
    ]);
  });
});

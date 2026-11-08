import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, lettings } from '@/db/schema';
import { getLetting } from '@/server/lettings/queries';
import { createLetting } from '@/server/lettings/create-letting';
import { setCriteria } from '@/server/lettings/set-criteria';
import { aLetting } from '../fixtures/lettings';
import { createTestMember } from './helpers';

describe('R2: criteria', () => {
  it('saves the criteria and marks the set-up step done', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
    const detail = await getLetting(member, lettingId);
    expect(detail?.letting.criteria).toEqual({ maxOccupants: 3, noPets: true });
    expect(detail?.setup.criteriaSet).toBe(true);
  });

  it('records the full criteria, so the record shows what everyone was ranked against (R27)', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await setCriteria(member, lettingId, { minStayMonths: 12, noPets: false });
    await setCriteria(member, lettingId, { minStayMonths: 24, noPets: false });
    // In the order they happened: without an order, Postgres may return rows in any order.
    const history = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(eq(events.type, 'criteria.set'))
        .orderBy(asc(events.id)),
    );
    expect(history.map((e) => e.data)).toEqual([
      { minStayMonths: 12, noPets: false },
      { minStayMonths: 24, noPets: false },
    ]);
  });

  it('refuses anything outside the fixed list, even if called directly', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await expect(
      // @ts-expect-error: a free-text criterion is not a type that exists
      setCriteria(member, lettingId, { noPets: false, other: 'Professionals only' }),
    ).rejects.toThrow();
  });

  it('locks the criteria once people have been invited to view', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await withOrg(member.organisationId, (tx) =>
      tx.update(lettings).set({ stage: 'viewings' }).where(eq(lettings.id, lettingId)),
    );
    await expect(setCriteria(member, lettingId, { noPets: true })).rejects.toThrow(
      /already been invited/,
    );
  });
});

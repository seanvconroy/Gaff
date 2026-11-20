import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events } from '@/db/schema';
import { recordComparable, recordComparables } from '@/server/lettings/comparables';
import { createLetting } from '@/server/lettings/create-letting';
import { getLetting } from '@/server/lettings/queries';
import { aLetting } from '../fixtures/lettings';
import { createTestMember } from './helpers';

const three = [180_000, 195_000, 210_000].map((monthlyRentCents) => ({
  area: 'Dublin 6',
  propertyType: 'apartment' as const,
  bedrooms: 2,
  monthlyRentCents,
}));

describe('R4: comparables', () => {
  it('keeps three comparables and marks the step done', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await recordComparables(member, lettingId, three);
    const detail = await getLetting(member, lettingId);
    expect(detail?.comparables.map((c) => c.monthlyRentCents)).toEqual([180_000, 195_000, 210_000]);
    expect(detail?.setup.comparables).toBe(3);
  });

  it('replaces them when saved again, and records only numbers (ADR-0006)', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await recordComparables(member, lettingId, three);
    await recordComparables(
      member,
      lettingId,
      three.map((c) => ({ ...c, area: 'Rathmines' })),
    );
    const detail = await getLetting(member, lettingId);
    expect(detail?.comparables.map((c) => c.area)).toEqual(['Rathmines', 'Rathmines', 'Rathmines']);
    const recorded = await withOrg(member.organisationId, (tx) =>
      tx.select({ data: events.data }).from(events).where(eq(events.type, 'comparables.recorded')),
    );
    expect(recorded.map((e) => e.data)).toEqual([
      { count: 3, medianRentCents: 195_000 },
      { count: 3, medianRentCents: 195_000 },
    ]);
  });

  it('needs exactly three', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await expect(recordComparables(member, lettingId, three.slice(0, 2))).rejects.toThrow(/three/);
  });
});

describe('UX-LP-14: comparable rents, one home at a time', () => {
  it('UX-LP-14: keeps each as it is entered, replaces one entered again, and records numbers only', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    expect(await recordComparable(member, lettingId, 1, three[0]!)).toEqual({ count: 1 });
    expect(await recordComparable(member, lettingId, 2, three[1]!)).toEqual({ count: 2 });
    expect(
      await recordComparable(member, lettingId, 2, { ...three[1]!, area: 'Rathmines' }),
    ).toEqual({ count: 2 });
    expect(await recordComparable(member, lettingId, 3, three[2]!)).toEqual({ count: 3 });
    const detail = await getLetting(member, lettingId);
    expect(detail?.comparables.map((c) => c.area)).toEqual(['Dublin 6', 'Rathmines', 'Dublin 6']);
    expect(detail?.setup.comparables).toBe(3);
    const recorded = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(eq(events.lettingId, lettingId)),
    );
    const ours = recorded.filter((e) => e.type.startsWith('comparable'));
    // Events in one transaction share a time, so they're compared in a fixed order.
    const key = (e: { type: string; data: unknown }) =>
      `${e.type}:${(e.data as { position?: number }).position ?? 9}`;
    const sorted = [...ours].sort((x, y) => key(x).localeCompare(key(y)));
    expect(sorted.map((e) => [e.type, e.data])).toEqual([
      ['comparable.recorded', { position: 1, count: 1 }],
      ['comparable.recorded', { position: 2, count: 2 }],
      ['comparable.recorded', { position: 2, count: 2 }],
      ['comparable.recorded', { position: 3, count: 3 }],
      ['comparables.recorded', { count: 3, medianRentCents: 195_000 }],
    ]);
  });

  it('UX-LP-14: there are three places, no more', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await expect(recordComparable(member, lettingId, 4, three[0]!)).rejects.toThrow(/three/);
  });
});

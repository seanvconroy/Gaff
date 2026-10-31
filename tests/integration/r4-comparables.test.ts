import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events } from '@/db/schema';
import { recordComparables } from '@/server/lettings/comparables';
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

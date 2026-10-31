import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events } from '@/db/schema';
import { createLetting } from '@/server/lettings/create-letting';
import { getLetting } from '@/server/lettings/queries';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { aLetting } from '../fixtures/lettings';
import { createTestMember } from './helpers';

describe('R3: rent check', () => {
  it('records a first letting as market rent and marks the step done', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const outcome = await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
    expect(outcome).toEqual({ result: 'market', reason: 'first_letting' });
    const detail = await getLetting(member, lettingId);
    expect(detail?.rentCheck).toMatchObject({ result: 'market', rulesVersion: 'ie-2026-03-v1' });
    expect(detail?.setup.rentCheckDone).toBe(true);
  });

  it('keeps the step open while a capped rent is certainly over the 2% ceiling', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const previous = {
      lastLet: 'before_new_rules' as const,
      ending: 'tenant_left' as const,
      substantialChange: false,
      previousRentCents: 170_000,
      previousRentSetOn: '2025-10-31',
    };
    await recordRentCheck(member, lettingId, previous, 185_000);
    let detail = await getLetting(member, lettingId);
    expect(detail?.rentCheck?.result).toBe('capped');
    expect(detail?.rentProblem?.ceilingCents).toBeLessThan(185_000);
    expect(detail?.setup.rentCheckDone).toBe(false);

    // The operator lowers the rent to within the cap: the step is done.
    await recordRentCheck(member, lettingId, previous, 172_000);
    detail = await getLetting(member, lettingId);
    expect(detail?.letting.monthlyRentCents).toBe(172_000);
    expect(detail?.rentProblem).toBeNull();
    expect(detail?.setup.rentCheckDone).toBe(true);
  });

  it('records every check and rent change, for the rent-setting pack (R24, R27)', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await recordRentCheck(
      member,
      lettingId,
      {
        lastLet: 'under_new_rules',
        ending: 'landlord_other',
        substantialChange: false,
        previousRentCents: 180_000,
        previousRentSetOn: '2026-04-01',
      },
      183_000,
    );
    const recorded = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(eq(events.lettingId, lettingId)),
    );
    expect(recorded.slice(1)).toEqual([
      { type: 'letting.rent_changed', data: { fromCents: 185_000, toCents: 183_000 } },
      {
        type: 'rent_check.recorded',
        data: {
          result: 'capped',
          reason: 'landlord_ended',
          rulesVersion: 'ie-2026-03-v1',
          lastLet: 'under_new_rules',
          ending: 'landlord_other',
          previousRentCents: 180_000,
          previousRentSetOn: '2026-04-01',
        },
      },
    ]);
  });
});

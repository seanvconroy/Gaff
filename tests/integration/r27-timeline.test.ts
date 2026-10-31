import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { decisions, lettings } from '@/db/schema';
import { recordComparables } from '@/server/lettings/comparables';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { timelineFor } from '@/server/timeline/timeline';
import { aLetting, aViewingSession } from '../fixtures/lettings';
import { createTestMember } from './helpers';

async function setUpLetting() {
  const member = await createTestMember({ name: 'Ann Power' });
  const { lettingId } = await createLetting(member, aLetting());
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
  return { member, lettingId };
}

describe('Stage 1: confirming set-up', () => {
  it('takes a person’s decision and makes the letting live', async () => {
    const { member, lettingId } = await setUpLetting();
    await startTakingEnquiries(member, lettingId);
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting).toMatchObject({ stage: 'enquiries', status: 'live' });
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.lettingId, lettingId)),
    );
    expect(decision).toMatchObject({
      kind: 'confirm_setup',
      decidedBy: member.userId,
      basis: { criteria: 2, rentCheck: 'market', viewingSlots: 4, comparables: 0 },
    });
  });

  it('refuses while set-up is unfinished', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await expect(startTakingEnquiries(member, lettingId)).rejects.toThrow(/Finish setting up/);
  });
});

describe('R27: the letting’s timeline', () => {
  it('tells the story in plain words, with who did what, and no personal details', async () => {
    const { member, lettingId } = await setUpLetting();
    await recordComparables(
      member,
      lettingId,
      [180_000, 195_000, 210_000].map((monthlyRentCents) => ({
        area: 'Dublin 6',
        propertyType: 'apartment' as const,
        bedrooms: 2,
        monthlyRentCents,
      })),
    );
    await startTakingEnquiries(member, lettingId);
    const entries = await timelineFor(member, lettingId);
    expect(entries.map((e) => [e.what, e.who])).toEqual([
      ['Letting added', 'Ann Power'],
      ['Viewing time added', 'Ann Power'],
      ['Criteria set', 'Ann Power'],
      ['Rent check: market rent can be set', 'Ann Power'],
      ['Three comparable rents recorded', 'Ann Power'],
      ['Set-up confirmed: Gaff started answering enquiries', 'Ann Power'],
    ]);
    expect(entries[2]?.detail).toBe('Up to 3 people; No pets (assistance dogs are always welcome)');
    expect(entries[4]?.detail).toBe('Middle rent €1,950 a month');
    expect(JSON.stringify(entries)).not.toMatch(/Mary|mary\.byrne|Ranelagh/);
  });

  it('is not visible to another organisation', async () => {
    const { lettingId } = await setUpLetting();
    const other = await createTestMember();
    expect(await timelineFor(other, lettingId)).toEqual([]);
  });
});

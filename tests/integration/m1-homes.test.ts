import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { homes, lettings, listings } from '@/db/schema';
import { createLetting } from '@/server/lettings/create-letting';
import { aLetting } from '../fixtures/lettings';
import { createTestMember } from './helpers';

describe('M31, ADR-0018: homes, lettings and listings', () => {
  it('creating a letting creates its home and a draft listing', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const { letting, home, listing } = await withOrg(member.organisationId, async (tx) => {
      const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
      const [home] = await tx.select().from(homes).where(eq(homes.id, letting!.homeId));
      const [listing] = await tx.select().from(listings).where(eq(listings.lettingId, lettingId));
      return { letting: letting!, home: home!, listing: listing! };
    });

    expect(home).toMatchObject({
      organisationId: member.organisationId,
      addressLine1: letting.addressLine1,
      area: letting.area,
      county: letting.county,
      eircode: 'D06 F2X3',
      propertyType: letting.propertyType,
      bedrooms: letting.bedrooms,
      bathrooms: letting.bathrooms,
      berScale: 'previous',
      berRating: letting.berRating,
      parking: letting.parking,
    });
    expect(listing).toMatchObject({ homeId: home.id, status: 'draft', slug: null, revision: 0 });
  });

  it('M38: the routing key comes from the Eircode, and an exempt home has no scale', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting({ berRating: 'exempt' }));
    const [home] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({
          routingKey: homes.routingKey,
          scale: homes.berScale,
          reason: homes.berExemptReason,
        })
        .from(homes)
        .innerJoin(lettings, eq(lettings.homeId, homes.id))
        .where(eq(lettings.id, lettingId)),
    );
    expect(home).toEqual({ routingKey: 'D06', scale: null, reason: 'other' });
  });

  it('one listing per letting', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const [listing] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listings).where(eq(listings.lettingId, lettingId)),
    );
    await expect(
      withOrg(member.organisationId, (tx) =>
        tx.insert(listings).values({
          organisationId: member.organisationId,
          lettingId,
          homeId: listing!.homeId,
          createdBy: member.userId,
        }),
      ),
    ).rejects.toThrow();
  });
});

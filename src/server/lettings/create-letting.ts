import { withOrg } from '@/db/client';
import { landlords, lettingFacts, lettings } from '@/db/schema';
import type { NewLetting } from '@/domain/lettings/new-letting';
import type { Member } from '@/server/auth/member';
import { recordEvent } from '@/server/record/events';

/** R1: creates a letting in set-up, with its landlord and key facts. */
export async function createLetting(
  member: Member,
  input: NewLetting,
): Promise<{ lettingId: string }> {
  return withOrg(member.organisationId, async (tx) => {
    let landlordId: string | null = null;
    if (input.landlordName && input.landlordEmail) {
      const [landlord] = await tx
        .insert(landlords)
        .values({
          organisationId: member.organisationId,
          name: input.landlordName,
          email: input.landlordEmail,
        })
        .returning({ id: landlords.id });
      landlordId = landlord!.id;
    }

    const [letting] = await tx
      .insert(lettings)
      .values({
        organisationId: member.organisationId,
        landlordId,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        area: input.area,
        county: input.county,
        eircode: input.eircode ?? null,
        monthlyRentCents: input.rent,
        availableFrom: input.availableFrom,
        propertyType: input.propertyType,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        furnished: input.furnished,
        berRating: input.berRating,
        parking: input.parking ?? null,
        photosUrl: input.photosUrl ?? null,
        daftUrl: input.daftUrl ?? null,
        myhomeUrl: input.myhomeUrl ?? null,
        createdBy: member.userId,
      })
      .returning({ id: lettings.id });
    const lettingId = letting!.id;

    if (input.otherFacts.length > 0) {
      await tx.insert(lettingFacts).values(
        input.otherFacts.map((answer) => ({
          organisationId: member.organisationId,
          lettingId,
          answer,
          source: 'setup' as const,
          createdBy: member.userId,
        })),
      );
    }

    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.created',
      subject: { type: 'letting', id: lettingId },
      data: { setupFacts: input.otherFacts.length, withLandlord: landlordId !== null },
    });
    return { lettingId };
  });
}

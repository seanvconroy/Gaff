import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { developments, homes, landlords, lettingFacts, lettings, listings } from '@/db/schema';
import { berFromLettingRating } from '@/domain/homes/ber';
import type { NewLetting } from '@/domain/lettings/new-letting';
import { routingKeyOf } from '@/domain/places/eircode';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * R1: creates a letting in set-up, with its landlord and key facts. ADR-0018: the home is
 * created with it, and a draft listing that the letter can publish later (M31).
 */
export async function createLetting(
  member: Member,
  input: NewLetting,
  options: { developmentId?: string; floor?: number | null; floorAreaSqm?: number | null } = {},
): Promise<{ lettingId: string }> {
  return withOrg(member.organisationId, async (tx) => {
    // M33: a home in a development takes the development's location.
    const [development] = options.developmentId
      ? await tx
          .select({
            id: developments.id,
            latitude: developments.latitude,
            longitude: developments.longitude,
          })
          .from(developments)
          .where(eq(developments.id, options.developmentId))
      : [];
    if (options.developmentId && !development) {
      throw new UserFacingError('That development isn’t in your account.');
    }
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

    const ber = berFromLettingRating(input.berRating);
    const [home] = await tx
      .insert(homes)
      .values({
        organisationId: member.organisationId,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        area: input.area,
        county: input.county,
        eircode: input.eircode ?? null,
        routingKey: input.eircode ? routingKeyOf(input.eircode) : null,
        propertyType: input.propertyType,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        berScale: ber.kind === 'rated' ? ber.scale : null,
        berRating: input.berRating,
        berExemptReason: ber.kind === 'exempt' ? ber.reason : null,
        parking: input.parking ?? null,
        developmentId: development?.id ?? null,
        latitude: development?.latitude ?? null,
        longitude: development?.longitude ?? null,
        floor: options.floor ?? null,
        floorAreaSqm: options.floorAreaSqm ?? null,
        createdBy: member.userId,
      })
      .returning({ id: homes.id });
    const homeId = home!.id;

    const [letting] = await tx
      .insert(lettings)
      .values({
        organisationId: member.organisationId,
        homeId,
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

    await tx.insert(listings).values({
      organisationId: member.organisationId,
      lettingId,
      homeId,
      createdBy: member.userId,
    });

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

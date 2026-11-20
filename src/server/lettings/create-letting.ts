import { type Tx, withOrg } from '@/db/client';
import { landlords, lettingFacts, lettings } from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import type { DraftOrigin, FlowStep } from '@/domain/lettings/add-letting';
import type { NewLetting } from '@/domain/lettings/new-letting';
import type { Member } from '@/server/auth/member';
import { recordEvent } from '@/server/record/events';

/** Everything a letting row is made from. Only the first seven are needed (UX-LT-14). */
export interface LettingToMake {
  /** Given when a draft becomes a letting: the letting keeps the draft's ID. */
  id?: string;
  addressLine1: string;
  addressLine2?: string;
  area: string;
  county: string;
  eircode?: string;
  /** M38: the pin the lister placed or confirmed. */
  point?: { lat: number; lng: number };
  rentCents: number;
  availableFrom: string;
  propertyType: string;
  bedrooms: number;
  bathrooms?: number;
  furnished?: string;
  berRating?: string;
  parking?: string;
  description?: string;
  /** P11: the description is the AI's draft, unchanged. */
  descriptionByAi?: boolean;
  otherFacts?: string[];
  photosUrl?: string;
  daftUrl?: string;
  myhomeUrl?: string;
  landlordId?: string | null;
  /** Letting details carried in, for the person to confirm at that step. Not yet "set". */
  criteria?: Criteria;
  noSmokingIndoors?: boolean;
  setupStep?: FlowStep;
  origin?: DraftOrigin;
  previousLettingId?: string | null;
  /** BA-15 (M35): a home of a development, made from one of its types. */
  unit?: {
    developmentId: string;
    unitTypeId: string;
    unitLabel: string;
    unitFloor: number | null;
  };
}

/** Makes the letting row, its facts and its first event, in the caller's transaction. */
export async function makeLettingIn(
  tx: Tx,
  member: Member,
  input: LettingToMake,
): Promise<{ lettingId: string }> {
  const [letting] = await tx
    .insert(lettings)
    .values({
      ...(input.id ? { id: input.id } : {}),
      organisationId: member.organisationId,
      landlordId: input.landlordId ?? null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      area: input.area,
      county: input.county,
      eircode: input.eircode ?? null,
      // M38: the pin placed while it was a draft (or last time, when it's let again).
      ...(input.point
        ? {
            latitude: input.point.lat,
            longitude: input.point.lng,
            pointSource: 'letter' as const,
            pointSetAt: new Date(),
          }
        : {}),
      monthlyRentCents: input.rentCents,
      availableFrom: input.availableFrom,
      propertyType: input.propertyType,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms ?? null,
      furnished: input.furnished ?? null,
      berRating: input.berRating ?? null,
      parking: input.parking ?? null,
      description: input.description ?? null,
      descriptionByAi: Boolean(input.description && input.descriptionByAi),
      photosUrl: input.photosUrl ?? null,
      daftUrl: input.daftUrl ?? null,
      myhomeUrl: input.myhomeUrl ?? null,
      criteria: input.criteria ?? null,
      noSmokingIndoors: input.noSmokingIndoors ?? false,
      setupStep: input.setupStep ?? null,
      previousLettingId: input.previousLettingId ?? null,
      ...(input.unit ?? {}),
      createdBy: member.userId,
      // UX-AG-9: whoever adds the letting leads it, until someone changes that.
      leadUserId: member.userId,
    })
    .returning({ id: lettings.id });
  const lettingId = letting!.id;

  const facts = input.otherFacts ?? [];
  if (facts.length > 0) {
    await tx.insert(lettingFacts).values(
      facts.map((answer, index) => ({
        organisationId: member.organisationId,
        lettingId,
        answer,
        source: 'setup' as const,
        createdBy: member.userId,
        // Kept in the order they were written: rows made together share a timestamp.
        createdAt: new Date(Date.now() + index),
      })),
    );
  }

  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.created',
    subject: { type: 'letting', id: lettingId },
    data: {
      setupFacts: facts.length,
      withLandlord: Boolean(input.landlordId),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.previousLettingId ? { fromLettingId: input.previousLettingId } : {}),
      ...(input.unit ? { fromUnitTypeId: input.unit.unitTypeId } : {}),
    },
  });
  return { lettingId };
}

/**
 * R1: creates a letting in set-up from everything at once, with its landlord and key facts.
 * The screens add a home a step at a time instead (src/server/lettings/drafts.ts); this is the
 * way in for an import, and for tests.
 */
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
    return makeLettingIn(tx, member, {
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      area: input.area,
      county: input.county,
      eircode: input.eircode,
      rentCents: input.rent,
      availableFrom: input.availableFrom,
      propertyType: input.propertyType,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      furnished: input.furnished,
      berRating: input.berRating,
      parking: input.parking,
      description: input.description,
      otherFacts: input.otherFacts,
      photosUrl: input.photosUrl,
      daftUrl: input.daftUrl,
      myhomeUrl: input.myhomeUrl,
      landlordId,
    });
  });
}

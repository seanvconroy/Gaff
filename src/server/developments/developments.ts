import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  developments,
  homes,
  landlords,
  lettings,
  listings,
  media,
  rentChecks,
  viewingSessions,
} from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import {
  developmentPublishProblems,
  developmentSchema,
  parseUnitRows,
} from '@/domain/developments/development';
import type { NewLetting } from '@/domain/lettings/new-letting';
import { routingKeyOf } from '@/domain/places/eircode';
import { approximateLocation } from '@/domain/places/locate';
import { loadGazetteer } from '@/server/places/places';
import { slugify } from '@/domain/places/slug';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { saveDescription, saveLettingDetails } from '@/server/listings/editor';
import { publishListing, type PublishResult } from '@/server/listings/publish';
import { recordEvent } from '@/server/record/events';
import { letterReadiness } from '@/server/verification/readiness';
import { republishDevelopment, writePublicDevelopment } from './project';

/** M32 to M35: developments, the homes in them, and many homes at once. */

export type DevelopmentResult =
  { ok: true; id: string } | { ok: false; errors: Record<string, string> };

function errorsOf(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

export async function createDevelopment(
  member: Member,
  values: Record<string, string>,
): Promise<DevelopmentResult> {
  const parsed = developmentSchema.safeParse({
    description: '',
    amenities: '',
    eircode: '',
    ...values,
  });
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error.issues) };
  const input = parsed.data;
  const routingKey = input.eircode ? routingKeyOf(input.eircode) : null;
  const point = approximateLocation(
    { area: input.area, county: input.county, routingKey },
    await loadGazetteer(),
  ).point;
  const id = crypto.randomUUID();
  await withOrg(member.organisationId, async (tx) => {
    await tx.insert(developments).values({
      id,
      organisationId: member.organisationId,
      name: input.name,
      slug: `${slugify(input.name).slice(0, 60)}-${id.slice(0, 8)}`,
      addressLine1: input.addressLine1,
      area: input.area,
      county: input.county,
      eircode: input.eircode,
      routingKey,
      latitude: point.lat,
      longitude: point.lng,
      description: input.description || null,
      amenities: input.amenities,
      createdBy: member.userId,
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'development.created',
      subject: { type: 'development', id },
      data: { developmentId: id },
    });
  });
  return { ok: true, id };
}

/** M32: the description and amenities. A live development's page changes at once. */
export async function updateDevelopment(
  member: Member,
  id: string,
  values: Record<string, string>,
): Promise<DevelopmentResult> {
  return withOrg(member.organisationId, async (tx) => {
    const [current] = await tx.select().from(developments).where(eq(developments.id, id));
    if (!current) throw new UserFacingError('We couldn’t find that development.');
    // A form with every amenity unticked sends none: that means none.
    const parsed = developmentSchema.safeParse({
      name: current.name,
      addressLine1: current.addressLine1,
      area: current.area,
      county: current.county,
      eircode: current.eircode ?? '',
      description: '',
      amenities: '',
      ...values,
    });
    if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error.issues) };
    const problems = developmentPublishProblems({
      description: parsed.data.description,
      readyPhotos: 99,
      lettersChecked: true,
    }).filter((p) => p.field === 'description' && current.status === 'live');
    if (problems.length) return { ok: false, errors: { description: problems[0]!.message } };
    await tx
      .update(developments)
      .set({ description: parsed.data.description || null, amenities: parsed.data.amenities })
      .where(eq(developments.id, id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'development.updated',
      subject: { type: 'development', id },
      data: { developmentId: id },
    });
    if (current.status === 'live') await republishDevelopment(tx, id, member.userId);
    return { ok: true as const, id };
  });
}

export async function myDevelopments(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx.select().from(developments).orderBy(desc(developments.createdAt)),
  );
}

/** The development and everything in it, for its page in the workspace. */
export async function developmentForEditor(member: Member, id: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [development] = await tx.select().from(developments).where(eq(developments.id, id));
    if (!development) return null;
    const photos = await tx
      .select()
      .from(media)
      .where(eq(media.developmentId, id))
      .orderBy(asc(media.position));
    const inIt = await tx
      .select({
        lettingId: lettings.id,
        addressLine1: lettings.addressLine1,
        rentCents: lettings.monthlyRentCents,
        bedrooms: lettings.bedrooms,
        lettingStatus: lettings.status,
        stage: lettings.stage,
        listingStatus: listings.status,
        slug: listings.slug,
      })
      .from(lettings)
      .innerJoin(homes, eq(homes.id, lettings.homeId))
      .innerJoin(listings, eq(listings.lettingId, lettings.id))
      .where(eq(homes.developmentId, id))
      .orderBy(asc(lettings.addressLine1));
    const readiness = await letterReadiness(member);
    return {
      development,
      photos,
      homes: inIt,
      problems: developmentPublishProblems({
        description: development.description ?? '',
        readyPhotos: photos.filter((p) => p.status === 'ready').length,
        lettersChecked: readiness.missing.length === 0,
      }),
    };
  });
}

/** M32, M75: the development's page goes live once it's described, photographed and checked. */
export async function publishDevelopment(
  member: Member,
  id: string,
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const detail = await developmentForEditor(member, id);
  if (!detail) throw new UserFacingError('We couldn’t find that development.');
  if (detail.problems.length) return { ok: false, problems: detail.problems.map((p) => p.message) };
  await withOrg(member.organisationId, async (tx) => {
    await tx.update(developments).set({ status: 'live' }).where(eq(developments.id, id));
    await writePublicDevelopment(tx, id);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'development.published',
      subject: { type: 'development', id },
      data: { developmentId: id },
    });
    await republishDevelopment(tx, id, member.userId);
  });
  return { ok: true };
}

/**
 * M35: many homes at once, like one already set up: the template's facts, criteria, viewing
 * times and listing words are copied, and each row changes what differs (unit, floor, rent,
 * date, size). Each home is ready to publish once its letting is taking enquiries.
 */
export async function addHomesLike(
  member: Member,
  developmentId: string,
  templateLettingId: string,
  rowsText: string,
  now = new Date(),
): Promise<{ ok: true; added: string[] } | { ok: false; errors: string[] }> {
  const parsed = parseUnitRows(rowsText, irishToday(now));
  if (parsed.errors.length) return { ok: false, errors: parsed.errors };
  const template = await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ letting: lettings, home: homes, listing: listings, development: developments })
      .from(lettings)
      .innerJoin(homes, eq(homes.id, lettings.homeId))
      .innerJoin(listings, eq(listings.lettingId, lettings.id))
      .innerJoin(developments, eq(developments.id, homes.developmentId))
      .where(and(eq(lettings.id, templateLettingId), eq(developments.id, developmentId)));
    if (!row) return null;
    const [landlord] = row.letting.landlordId
      ? await tx.select().from(landlords).where(eq(landlords.id, row.letting.landlordId))
      : [];
    const sessions = await tx
      .select()
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, templateLettingId));
    const [rentCheck] = await tx
      .select({ lastLet: rentChecks.lastLet })
      .from(rentChecks)
      .where(eq(rentChecks.lettingId, templateLettingId));
    return { ...row, landlord: landlord ?? null, sessions, rentCheck: rentCheck ?? null };
  });
  if (!template) return { ok: false, errors: ['Choose a home in this development to copy.'] };

  const added: string[] = [];
  for (const unit of parsed.rows) {
    const { letting, home, listing, development } = template;
    const input: NewLetting = {
      addressLine1: `${unit.unit}, ${development.addressLine1}`,
      addressLine2: undefined,
      area: development.area,
      county: development.county as NewLetting['county'],
      eircode: undefined,
      rent: unit.rentCents,
      availableFrom: unit.availableFrom,
      propertyType: letting.propertyType as NewLetting['propertyType'],
      bedrooms: letting.bedrooms,
      bathrooms: letting.bathrooms,
      furnished: letting.furnished as NewLetting['furnished'],
      berRating: letting.berRating as NewLetting['berRating'],
      parking: (letting.parking ?? undefined) as NewLetting['parking'],
      photosUrl: undefined,
      daftUrl: undefined,
      myhomeUrl: undefined,
      landlordName: template.landlord?.name,
      landlordEmail: template.landlord?.email,
      otherFacts: [],
    } as NewLetting;
    const { lettingId } = await createLetting(member, input, {
      developmentId,
      floor: unit.floor,
      floorAreaSqm: unit.floorAreaSqm ?? home.floorAreaSqm,
    });
    // The home's own facts, as the template home has them.
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(homes)
        .set({
          showExactAddress: home.showExactAddress,
          berScale: home.berScale,
          berNumber: home.berNumber,
          berCertificateDate: home.berCertificateDate,
          heating: home.heating,
          outdoorSpace: home.outdoorSpace,
          accessibility: home.accessibility,
          appliances: home.appliances,
          broadband: home.broadband,
          hasLift: home.hasLift,
          ensuites: home.ensuites,
          unitTypeId: home.unitTypeId,
        })
        .where(
          inArray(
            homes.id,
            tx.select({ id: lettings.homeId }).from(lettings).where(eq(lettings.id, lettingId)),
          ),
        ),
    );
    if (letting.criteria) await setCriteria(member, lettingId, letting.criteria as Criteria);
    for (const session of template.sessions.filter((s) => s.endsAt > now)) {
      await addViewingSession(member, lettingId, {
        kind: session.kind,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        slotMinutes: session.slotMinutes ?? undefined,
        capacity: session.capacity ?? undefined,
      } as Parameters<typeof addViewingSession>[2]);
    }
    if (template.rentCheck?.lastLet === 'never') {
      await recordRentCheck(member, lettingId, { lastLet: 'never' }, unit.rentCents);
    }
    if (listing.description) await saveDescription(member, lettingId, listing.description);
    const deposit = Math.min(letting.depositCents ?? unit.rentCents, unit.rentCents);
    await saveLettingDetails(member, lettingId, {
      deposit: (deposit / 100).toFixed(2),
      tourUrl: listing.tourUrl ?? '',
      enquiryLimit: letting.enquiryLimit ? String(letting.enquiryLimit) : '',
    });
    if (letting.stage !== 'setup') {
      await startTakingEnquiries(member, lettingId).catch((error: unknown) => {
        if (!(error instanceof UserFacingError)) throw error;
      });
    }
    added.push(lettingId);
  }
  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'development.homes_added',
      subject: { type: 'development', id: developmentId },
      data: { developmentId, homes: added.length },
    }),
  );
  return { ok: true, added };
}

/** M35: publish every home in the development that's ready, with one declaration (M25). */
export async function publishReadyHomes(
  member: Member,
  developmentId: string,
): Promise<{ published: number; held: number; notReady: number }> {
  const detail = await developmentForEditor(member, developmentId);
  if (!detail) throw new UserFacingError('We couldn’t find that development.');
  let published = 0;
  let held = 0;
  let notReady = 0;
  for (const home of detail.homes.filter((h) => h.listingStatus === 'draft')) {
    const result: PublishResult = await publishListing(member, home.lettingId, { declare: true });
    if (result.outcome === 'live') published += 1;
    else if (result.outcome === 'held') held += 1;
    else notReady += 1;
  }
  return { published, held, notReady };
}

import { and, asc, desc, eq, gt, min, sum } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  checks,
  events,
  lettings,
  offers,
  organisations,
  tenancies,
  users,
  viewingSessions,
  viewingSlots,
} from '@/db/schema';
import { lettingDetailsParts } from '@/domain/criteria/criteria';
import { listerFrom } from '@/domain/frame/frame';
import {
  letSummary,
  ownerDecisions,
  ownerFigures,
  ownerRecord,
  whereItStands,
  type OwnerFacts,
  type RecordStep,
} from '@/domain/landlord/owner-page';
import { applicantLabels, landlordNumbers } from '@/domain/landlord/pseudonyms';
import { resolveAccessLink } from '@/server/access/links';
import { listerColumns } from '@/server/frame/lister';
import { approvalState } from '@/server/offers/approval';
import { rankLetting } from '@/server/shortlist/shortlist';

/** Who did a step, as an owner is told it. A renter is only ever "Applicant N" (UX-OP-2). */
export type OwnerActor =
  | { kind: 'person'; name: string }
  | { kind: 'applicant'; label: string }
  | { kind: 'owner' }
  | { kind: 'gaff' };

export type OwnerStep = Pick<RecordStep, 'id' | 'type' | 'data' | 'at'> & { actor: OwnerActor };

/** Checks that are back, whatever they found. */
const BACK = ['passed', 'not_passed', 'answered', 'no_answer', 'not_needed'];

/**
 * R27 (Q4), UX-OP-1 to UX-OP-5: what an owner's private link shows: where the letting stands,
 * the figures of its stage, what's been decided, what's asked of renters, and the record without
 * Gaff's internal steps. Once the home is let, a summary. Renters are "Applicant N": no names,
 * contact details or message text are loaded here, so none can reach the page.
 */
export async function landlordView(token: string, now: Date = new Date()) {
  const link = await resolveAccessLink(token, 'landlord');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        letting: {
          id: lettings.id,
          addressLine1: lettings.addressLine1,
          area: lettings.area,
          monthlyRentCents: lettings.monthlyRentCents,
          availableFrom: lettings.availableFrom,
          bedrooms: lettings.bedrooms,
          propertyType: lettings.propertyType,
          status: lettings.status,
          stage: lettings.stage,
          criteria: lettings.criteria,
          noSmokingIndoors: lettings.noSmokingIndoors,
          closedAt: lettings.closedAt,
        },
        organisationName: organisations.name,
        organisation: listerColumns,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(eq(lettings.id, link.subjectId));
    if (!row) return null;
    const lettingId = row.letting.id;
    // Never a name, an email, a phone number or an answer: an ID, a status and two times.
    const people = await tx
      .select({
        id: applications.id,
        status: applications.status,
        answersAt: applications.answersAt,
        firstEnquiredAt: applications.firstEnquiredAt,
      })
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .orderBy(asc(applications.firstEnquiredAt), asc(applications.id));
    const labels = applicantLabels(people.map((p) => p.id));
    const numbers = landlordNumbers(
      people.map((p) => ({ status: p.status, answered: p.answersAt !== null })),
    );

    const ranked = await rankLetting(tx, lettingId);
    const asked = ranked[0]?.total ?? 0;
    const [slots] = await tx
      .select({ places: sum(viewingSlots.capacity) })
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId));
    const [nextViewing] = await tx
      .select({ at: min(viewingSessions.startsAt) })
      .from(viewingSessions)
      .where(and(eq(viewingSessions.lettingId, lettingId), gt(viewingSessions.startsAt, now)));

    const chosen = await approvalState(tx, lettingId);
    const theirChecks = chosen?.preferredId
      ? await tx
          .select({ status: checks.status })
          .from(checks)
          .where(eq(checks.applicationId, chosen.preferredId))
      : [];
    const [offer] = await tx
      .select({ status: offers.status, expiresAt: offers.expiresAt })
      .from(offers)
      .where(eq(offers.lettingId, lettingId))
      .orderBy(desc(offers.createdAt))
      .limit(1);
    const [tenancy] = await tx
      .select({
        rentCents: tenancies.rentCents,
        startDate: tenancies.startDate,
        rtbRegisteredAt: tenancies.rtbRegisteredAt,
        operatorSignedAt: tenancies.operatorSignedAt,
        tenantSignedAt: tenancies.tenantSignedAt,
        createdAt: tenancies.createdAt,
      })
      .from(tenancies)
      .where(eq(tenancies.lettingId, lettingId));

    const approval = chosen?.approval;
    const facts: OwnerFacts = {
      stage: row.letting.stage,
      status: row.letting.status,
      numbers,
      places: Number(slots?.places ?? 0),
      meetEverything:
        asked === 0 ? null : ranked.filter((r) => r.answered && r.met === r.total).length,
      checks:
        theirChecks.length === 0
          ? null
          : {
              done: theirChecks.filter((c) => BACK.includes(c.status)).length,
              total: theirChecks.length,
            },
      approval: !approval
        ? 'not_asked'
        : approval.status !== 'answered'
          ? 'asked'
          : approval.preferredAnswer === 'approved'
            ? 'approved'
            : 'declined',
      offer: offer?.status ?? 'none',
    };

    const logged = await tx
      .select({ event: events, personName: users.name })
      .from(events)
      .leftJoin(users, eq(users.id, events.actorId))
      .where(eq(events.lettingId, lettingId))
      .orderBy(asc(events.occurredAt), asc(events.id));
    const steps: RecordStep[] = logged.map(({ event, personName }) => ({
      id: event.id,
      type: event.type,
      data: event.data,
      at: event.occurredAt,
      actorType: event.actorType,
      actorId: event.actorId,
      personName: event.actorType === 'person' ? personName : null,
    }));
    const forOwner = (step: RecordStep): OwnerStep => ({
      id: step.id,
      type: step.type,
      data: step.data,
      at: step.at,
      actor:
        step.actorType === 'person'
          ? { kind: 'person', name: step.personName ?? row.organisationName }
          : step.actorType === 'renter'
            ? { kind: 'applicant', label: labels.get(step.actorId ?? '') ?? 'An applicant' }
            : step.actorType === 'landlord'
              ? { kind: 'owner' }
              : { kind: 'gaff' },
    });

    return {
      organisationName: row.organisationName,
      /** Whoever lets the home, for the page's frame (UX-PP-9). */
      lister: listerFrom(row.organisation),
      letting: row.letting,
      criteria: lettingDetailsParts(row.letting.criteria, row.letting.noSmokingIndoors, now),
      numbers,
      standing: whereItStands(facts),
      figures: ownerFigures(facts),
      decisions: ownerDecisions(steps).map(forOwner),
      record: ownerRecord(steps).map(forOwner),
      /** The next viewing still to come, for "what happens next, and when". */
      nextViewingAt: nextViewing?.at ?? null,
      /** When the offer that's out closes. */
      offerClosesAt: offer?.status === 'open' ? offer.expiresAt : null,
      /** UX-OP-5: the summary, once the home is let. */
      summary:
        row.letting.status === 'let'
          ? letSummary({
              firstEnquiryAt: people[0]?.firstEnquiredAt ?? null,
              signedAt: tenancy?.operatorSignedAt ?? tenancy?.tenantSignedAt ?? null,
              acceptedAt: tenancy?.createdAt ?? null,
              closedAt: row.letting.closedAt,
              askingRentCents: row.letting.monthlyRentCents,
              tenancy: tenancy ?? null,
            })
          : null,
    };
  });
}

export type OwnerView = NonNullable<Awaited<ReturnType<typeof landlordView>>>;

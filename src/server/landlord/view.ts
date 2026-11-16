import { asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings, organisations } from '@/db/schema';
import { describeCriteria } from '@/domain/criteria/criteria';
import { listerFrom } from '@/domain/frame/frame';
import { applicantLabels, landlordNumbers } from '@/domain/landlord/pseudonyms';
import { resolveAccessLink } from '@/server/access/links';
import { listerColumns } from '@/server/frame/lister';
import { rankLetting } from '@/server/shortlist/shortlist';
import { timelineEntries } from '@/server/timeline/timeline';

/**
 * R27 (Q4): what a landlord's private read-only link shows: the stage, the numbers, the
 * criteria, the ranking with its reasons and the timeline. Renters are "Applicant N": no
 * names, contact details or message text ever reach this view.
 */
export async function landlordView(token: string) {
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
        },
        organisationName: organisations.name,
        organisation: listerColumns,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(eq(lettings.id, link.subjectId));
    if (!row) return null;
    const people = await tx
      .select({
        id: applications.id,
        status: applications.status,
        answersAt: applications.answersAt,
      })
      .from(applications)
      .where(eq(applications.lettingId, row.letting.id))
      .orderBy(asc(applications.firstEnquiredAt), asc(applications.id));
    const labels = applicantLabels(people.map((p) => p.id));
    const ranking = (await rankLetting(tx, row.letting.id)).map((r) => ({
      label: labels.get(r.id) ?? 'An applicant',
      position: r.position,
      met: r.met,
      total: r.total,
      answered: r.answered,
      reason: r.reason,
      status: r.status,
    }));
    const timeline = await timelineEntries(tx, row.letting.id, (event) =>
      event.actorType === 'person'
        ? row.organisationName
        : event.actorType === 'renter'
          ? (labels.get(event.actorId ?? '') ?? 'An applicant')
          : event.actorType === 'ai'
            ? 'Gaff’s AI assistant'
            : event.actorType === 'landlord'
              ? 'You'
              : 'Gaff',
    );
    return {
      organisationName: row.organisationName,
      /** Whoever lets the home, for the page's frame (UX-PP-9). */
      lister: listerFrom(row.organisation),
      letting: row.letting,
      criteria: describeCriteria(row.letting.criteria ?? { noPets: false }),
      numbers: landlordNumbers(
        people.map((p) => ({ status: p.status, answered: p.answersAt !== null })),
      ),
      ranking,
      timeline,
    };
  });
}

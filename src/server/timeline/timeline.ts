import { asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { events, users } from '@/db/schema';
import { describeCriteria, type Criteria } from '@/domain/criteria/criteria';
import { formatRent } from '@/lib/format';
import type { Member } from '@/server/auth/member';

export interface TimelineEntry {
  id: number;
  at: Date;
  who: string;
  what: string;
  detail?: string;
}

type EventRow = typeof events.$inferSelect;

const rentCheckTitles: Record<string, string> = {
  market: 'Rent check: market rent can be set',
  capped: 'Rent check: the rent cap applies',
  get_advice: 'Rent check: get advice before setting the rent',
};

/** One event in plain words. Personal details are never in events, so none appear here. */
export function describeEvent(
  event: Pick<EventRow, 'type' | 'data'>,
): Omit<TimelineEntry, 'id' | 'at' | 'who'> {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case 'letting.created':
      return {
        what: 'Letting added',
        detail:
          [
            Number(data.setupFacts) > 0
              ? `${data.setupFacts} extra ${data.setupFacts === 1 ? 'fact' : 'facts'}`
              : null,
            data.withLandlord ? 'landlord added' : null,
          ]
            .filter(Boolean)
            .join(', ') || undefined,
      };
    case 'viewings.session_added':
      return {
        what: 'Viewing time added',
        detail:
          data.kind === 'group'
            ? `Group viewing for up to ${data.places}`
            : `${data.slots} slots, one booking each`,
      };
    case 'viewings.session_removed':
      return { what: 'Viewing time removed' };
    case 'criteria.set': {
      const lines = describeCriteria(data as unknown as Criteria);
      return { what: 'Criteria set', detail: lines.length ? lines.join('; ') : 'No criteria' };
    }
    case 'rent_check.recorded':
      return { what: rentCheckTitles[String(data.result)] ?? 'Rent check recorded' };
    case 'letting.rent_changed':
      return {
        what: 'Rent changed',
        detail: `From ${formatRent(Number(data.fromCents))} to ${formatRent(Number(data.toCents))}`,
      };
    case 'comparables.recorded':
      return {
        what: 'Three comparable rents recorded',
        detail: `Middle rent ${formatRent(Number(data.medianRentCents))}`,
      };
    case 'letting.went_live':
      return { what: 'Set-up confirmed: Gaff started answering enquiries' };
    default:
      return { what: event.type };
  }
}

/** R27: every message, booking, decision and the criteria used, oldest first. */
export async function timelineFor(member: Member, lettingId: string): Promise<TimelineEntry[]> {
  const rows = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ event: events, personName: users.name })
      .from(events)
      .leftJoin(users, eq(users.id, events.actorId))
      .where(eq(events.lettingId, lettingId))
      .orderBy(asc(events.occurredAt), asc(events.id)),
  );
  return rows.map(({ event, personName }) => ({
    id: event.id,
    at: event.occurredAt,
    who:
      event.actorType === 'person'
        ? (personName ?? 'Someone on your team')
        : event.actorType === 'ai'
          ? 'Gaff’s AI assistant'
          : event.actorType === 'renter'
            ? 'A renter'
            : event.actorType === 'landlord'
              ? 'The landlord'
              : 'Gaff',
    ...describeEvent(event),
  }));
}

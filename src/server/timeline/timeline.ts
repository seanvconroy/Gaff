import { asc, eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { events, users } from '@/db/schema';
import { describeCriteria, type Criteria } from '@/domain/criteria/criteria';
import { formatDate, formatRent } from '@/lib/format';
import type { Member } from '@/server/auth/member';

export interface TimelineEntry {
  id: number;
  at: Date;
  who: string;
  what: string;
  detail?: string;
}

type EventRow = typeof events.$inferSelect;

const messageTitles: Record<string, string> = {
  first_reply: 'First reply sent',
  answer: 'Answer sent',
  operator_answer: 'Your answer sent',
  holding: 'Holding message sent',
  invitation: 'Invitation to view sent',
  waitlisted: 'Waitlist message sent',
  booking_confirmation: 'Booking confirmed',
  reminder: 'Viewing reminder sent',
  place_offered: 'A freed place offered',
  letting_closed: 'Closing message sent',
  apply_invitation: 'Invitation to apply sent',
  checks_invitation: 'Checks explained to the renter',
  reference_request: 'Reference request sent',
  reference_reminder: 'Reference reminder sent',
  landlord_approval: 'Approval request sent to the landlord',
  offer: 'Offer sent',
  offer_expired: 'Offer closed message sent',
  outcome: 'Outcome message sent',
};

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
    case 'enquiry.received':
      return {
        what: 'Enquiry received',
        detail: `Via ${data.portal === 'daft' ? 'Daft' : 'MyHome'}`,
      };
    case 'enquiry.repeated':
      return {
        what: 'The same renter enquired again',
        detail: `Via ${data.portal === 'daft' ? 'Daft' : 'MyHome'}. Kept as one enquiry.`,
      };
    case 'reply.received':
      return { what: 'Reply received' };
    case 'message.sent':
      return {
        what: messageTitles[String(data.kind)] ?? 'Message sent',
        detail:
          data.author === 'ai'
            ? 'Written by the AI assistant'
            : data.author === 'person'
              ? 'Written by a person'
              : 'Fixed wording',
      };
    case 'message.failed':
      return { what: 'A message couldn’t be sent', detail: `After ${data.attempts} tries` };
    case 'answers.drafted':
      return {
        what:
          Number(data.toOperator) > 0 && Number(data.answered) === 0
            ? 'Question passed to your team'
            : 'Answers drafted',
        detail: [
          Number(data.answered) > 0 ? `${data.answered} answered from the facts` : null,
          Number(data.toOperator) > 0 ? `${data.toOperator} for a person` : null,
        ]
          .filter(Boolean)
          .join(', '),
      };
    case 'message.approved':
      return { what: data.edited ? 'Draft edited and approved' : 'Draft approved' };
    case 'message.discarded':
      return { what: 'Draft not sent' };
    case 'question.answered':
      return {
        what: 'Question answered by your team',
        detail: data.remembered ? 'Remembered for everyone who asks' : undefined,
      };
    case 'application.answered':
      return {
        what: data.changed ? 'A renter changed their answers' : 'A renter answered the questions',
      };
    case 'shortlist.decided':
      return {
        what: 'Invitations to view decided',
        detail: `${data.invited} invited, ${data.waitlisted} on the waiting list, ${data.notInvited} told we’ll be in touch`,
      };
    case 'viewing.booked':
      return { what: data.rescheduled ? 'A renter moved their viewing' : 'Viewing booked' };
    case 'viewing.cancelled':
      return { what: 'A renter cancelled their viewing' };
    case 'viewing.attendance_marked':
      return { what: data.attended ? 'Marked as came to the viewing' : 'Marked as didn’t come' };
    case 'waitlist.offered':
      return {
        what: 'A freed place was offered to the waiting list',
        detail:
          data.mode === 'everyone'
            ? `To all ${data.offered} left, first to book`
            : 'To the next person, with a 2-hour hold',
      };
    case 'letting.shared_with_landlord':
      return { what: 'Read-only link shared with the landlord' };
    case 'letting.landlord_link_revoked':
      return { what: 'Stopped sharing with the landlord' };
    case 'application.submitted':
      return { what: data.changed ? 'A renter changed their application' : 'A renter applied' };
    case 'applicants.chosen':
      return {
        what: data.withBackup
          ? 'Preferred applicant and backup chosen'
          : 'Preferred applicant chosen',
        detail: `From ${data.applied} ${data.applied === 1 ? 'application' : 'applications'}`,
      };
    case 'checks.requested':
      return { what: 'Checks requested', detail: `${data.checks} to do` };
    case 'check.started':
      return { what: data.kind === 'identity' ? 'ID check started' : 'Income check started' };
    case 'reference.requested':
      return {
        what:
          data.kind === 'landlord_reference'
            ? 'Previous landlord asked for a reference'
            : 'Employer asked for a reference',
      };
    case 'check.completed':
      return { what: checkOutcomeWords(String(data.kind), String(data.outcome)) };
    case 'letting.landlord_added':
      return { what: data.updated ? 'Landlord’s details updated' : 'Landlord’s details added' };
    case 'landlord.approval_requested':
      return { what: 'The landlord was asked to approve' };
    case 'landlord.approval_answered':
      return {
        what:
          data.preferred === 'approved'
            ? 'The landlord approved the preferred applicant'
            : 'The landlord declined the preferred applicant',
        detail:
          data.backup === null
            ? undefined
            : data.backup === 'approved'
              ? 'Backup approved'
              : 'Backup declined',
      };
    case 'offer.made':
      return {
        what: data.role === 'backup' ? 'Offer sent to the backup' : 'Offer sent',
        detail: `${data.deadlineHours} hours to answer${data.withBackup ? '; then to the backup, as approved' : ''}`,
      };
    case 'offer.accepted':
      return { what: 'Offer accepted: the home is let' };
    case 'offer.declined':
      return { what: 'Offer declined' };
    case 'offer.expired':
      return { what: 'Offer not answered in time' };
    case 'outcomes.sent':
      return {
        what: 'Everyone else told',
        detail: `${data.told} told; personal details deleted on ${formatDate(String(data.deleteAfter))}`,
      };
    case 'letting.closed':
      return {
        what:
          data.outcome === 'let' ? 'Letting closed: the home is let' : 'Letting closed: withdrawn',
        detail: `${data.told} told; personal details deleted on ${formatDate(String(data.deleteAfter))}`,
      };
    case 'application.personal_data_deleted':
      return { what: 'A renter’s personal details deleted on schedule' };
    case 'letting.went_live':
      return { what: 'Set-up confirmed: Gaff started answering enquiries' };
    default:
      return { what: event.type };
  }
}

type Who = (event: EventRow, personName: string | null) => string;

/** R27: the letting's events in order, in plain words, with "who" decided by the viewer. */
export async function timelineEntries(
  tx: Tx,
  lettingId: string,
  who: Who,
): Promise<TimelineEntry[]> {
  const rows = await tx
    .select({ event: events, personName: users.name })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorId))
    .where(eq(events.lettingId, lettingId))
    .orderBy(asc(events.occurredAt), asc(events.id));
  return rows.map(({ event, personName }) => ({
    id: event.id,
    at: event.occurredAt,
    who: who(event, personName),
    ...describeEvent(event),
  }));
}

/** R27: every message, booking, decision and the criteria used, oldest first. */
export async function timelineFor(member: Member, lettingId: string): Promise<TimelineEntry[]> {
  return withOrg(member.organisationId, (tx) =>
    timelineEntries(tx, lettingId, (event, personName) =>
      event.actorType === 'person'
        ? (personName ?? 'Someone on your team')
        : event.actorType === 'ai'
          ? 'Gaff’s AI assistant'
          : event.actorType === 'renter'
            ? 'A renter'
            : event.actorType === 'landlord'
              ? 'The landlord'
              : 'Gaff',
    ),
  );
}

function checkOutcomeWords(kind: string, outcome: string): string {
  const name: Record<string, string> = {
    identity: 'ID check',
    income: 'Income check',
    landlord_reference: 'Landlord reference',
    employer_reference: 'Employer reference',
  };
  const words: Record<string, string> = {
    passed: kind === 'identity' ? 'verified' : 'income confirmed',
    not_passed: kind === 'identity' ? 'not verified' : 'income not confirmed',
    answered: 'answered',
    no_answer: 'no answer after two reminders',
    not_needed: 'not needed',
  };
  return `${name[kind] ?? 'Check'}: ${words[outcome] ?? outcome}`;
}

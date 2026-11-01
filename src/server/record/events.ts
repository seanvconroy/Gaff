import { z } from 'zod';
import type { Tx } from '@/db/client';
import { events } from '@/db/schema';
import { assertNoPersonalData } from '@/domain/record/personal-data';

/**
 * Every event type and the shape of its payload (ADR-0006). Payload fields must be IDs,
 * enums, numbers, booleans or dates: a compliance test rejects plain strings here.
 */
export const eventCatalogue = {
  'organisation.created': z.object({ kind: z.enum(['agency', 'landlord']) }),
  'member.joined': z.object({ role: z.enum(['admin', 'negotiator']) }),
  'letting.created': z.object({ setupFacts: z.number().int().min(0), withLandlord: z.boolean() }),
  'viewings.session_added': z.object({
    sessionId: z.uuid(),
    kind: z.enum(['slots', 'group']),
    slots: z.number().int().min(1),
    places: z.number().int().min(1),
  }),
  'viewings.session_removed': z.object({ sessionId: z.uuid() }),
  'rent_check.recorded': z.object({
    result: z.enum(['market', 'capped', 'get_advice']),
    reason: z.enum([
      'first_letting',
      'tenant_ended',
      'tenancy_before_new_rules',
      'landlord_ended',
      'substantial_change',
    ]),
    rulesVersion: z.enum(['ie-2026-03-v1']),
    lastLet: z.enum(['never', 'before_new_rules', 'under_new_rules']),
    ending: z.enum(['tenant_left', 'tenant_breach', 'unsuitable', 'landlord_other']).optional(),
    previousRentCents: z.number().int().optional(),
    previousRentSetOn: z.iso.date().optional(),
  }),
  'letting.rent_changed': z.object({ fromCents: z.number().int(), toCents: z.number().int() }),
  'email.received': z.object({ inboundEmailId: z.uuid() }),
  'email.needs_attention': z.object({
    inboundEmailId: z.uuid(),
    problem: z.enum([
      'not_from_a_portal',
      'no_contact_email',
      'no_matching_letting',
      'unknown_thread',
      'details_deleted',
    ]),
  }),
  'email.dismissed': z.object({ inboundEmailId: z.uuid() }),
  /** R6: a new renter enquired. */
  'enquiry.received': z.object({ applicationId: z.uuid(), portal: z.enum(['daft', 'myhome']) }),
  /** R6: the same renter enquired again (maybe on the other portal): merged, not duplicated. */
  'enquiry.repeated': z.object({ applicationId: z.uuid(), portal: z.enum(['daft', 'myhome']) }),
  'reply.received': z.object({ applicationId: z.uuid(), messageId: z.uuid() }),
  /** R9: the renter answered the pre-viewing questions (which ones isn't personal; the answers are). */
  'application.answered': z.object({
    applicationId: z.uuid(),
    questions: z.number().int(),
    changed: z.boolean(),
  }),
  /** Every outbound message, once the provider has accepted it (R7: first reply time). */
  'message.sent': z.object({
    messageId: z.uuid(),
    kind: z.enum([
      'first_reply',
      'answer',
      'operator_answer',
      'holding',
      'invitation',
      'waitlisted',
      'booking_confirmation',
      'reminder',
      'place_offered',
      'letting_closed',
      'apply_invitation',
    ]),
    channel: z.enum(['email', 'sms']),
    author: z.enum(['template', 'ai', 'person']),
  }),
  'message.failed': z.object({ messageId: z.uuid(), attempts: z.number().int() }),
  /** R8: answers drafted for a renter's message: how many by the AI, how many for a person. */
  'answers.drafted': z.object({
    sourceMessageId: z.uuid(),
    answered: z.number().int(),
    toOperator: z.number().int(),
    author: z.enum(['ai', 'template', 'none']),
  }),
  /** R29: a person approved an AI-written message (an 'approve_message' decision). */
  'message.approved': z.object({ messageId: z.uuid(), decisionId: z.uuid(), edited: z.boolean() }),
  'message.discarded': z.object({ messageId: z.uuid() }),
  'question.answered': z.object({ questionId: z.uuid(), remembered: z.boolean() }),
  'settings.approve_before_send': z.object({ on: z.boolean() }),
  'viewing.booked': z.object({ bookingId: z.uuid(), slotId: z.uuid(), rescheduled: z.boolean() }),
  'viewing.cancelled': z.object({ bookingId: z.uuid(), slotId: z.uuid() }),
  /** R15: a person marked whether someone came (a 'mark_attendance' decision). */
  'viewing.attendance_marked': z.object({
    decisionId: z.uuid(),
    bookingId: z.uuid(),
    slotId: z.uuid(),
    attended: z.boolean(),
  }),
  /** R14: a freed place offered to the approved waiting list. */
  'waitlist.offered': z.object({
    slotId: z.uuid(),
    mode: z.enum(['one_at_a_time', 'everyone']),
    offered: z.number().int(),
  }),
  /** R11: a person decided who views (an 'invite_to_view' decision with the ranking used). */
  /** R28, Q15: the usual time a letting takes this operator, to compare with. */
  'settings.usual_times': z.object({
    minutesPerLetting: z.number().int().nullable(),
    daysToLet: z.number().int().nullable(),
  }),
  'shortlist.decided': z.object({
    decisionId: z.uuid(),
    invited: z.number().int(),
    waitlisted: z.number().int(),
    notInvited: z.number().int(),
  }),
  /** R27, Q4: a private read-only link for the landlord (renters pseudonymised). */
  'letting.shared_with_landlord': z.object({ linkId: z.uuid() }),
  'letting.landlord_link_revoked': z.object({ links: z.number().int() }),
  /** R16: someone who came to view applied (stage 5), or changed their application. */
  'application.submitted': z.object({ applicationId: z.uuid(), changed: z.boolean() }),
  /** R16, R17: the operator's income rule, in tenths of the rent. */
  'settings.income_rule': z.object({ ruleTenths: z.number().int() }),
  /** R26: a person closed the letting (a 'close_letting' decision); everyone was told. */
  'letting.closed': z.object({
    decisionId: z.uuid(),
    outcome: z.enum(['let', 'withdrawn']),
    told: z.number().int(),
    deleteAfter: z.iso.date(),
  }),
  /** R26: the retention job deleted a renter's personal details, on schedule. */
  'application.personal_data_deleted': z.object({
    applicationId: z.uuid(),
    backstop: z.boolean(),
  }),
  'inbound_email.content_deleted': z.object({ inboundEmailId: z.uuid() }),
  /** Stage 1: a person confirmed the facts, rent and criteria (a 'confirm_setup' decision). */
  'letting.went_live': z.object({ decisionId: z.uuid() }),
  'comparables.recorded': z.object({
    count: z.number().int(),
    medianRentCents: z.number().int(),
  }),
  /** The full criteria are kept, so the record shows what everyone was ranked against. */
  'criteria.set': z.object({
    moveInBy: z.iso.date().optional(),
    minStayMonths: z.number().int().optional(),
    maxOccupants: z.number().int().optional(),
    noPets: z.boolean(),
  }),
} satisfies Record<string, z.ZodObject>;

export type EventType = keyof typeof eventCatalogue;
export type EventData<T extends EventType> = z.input<(typeof eventCatalogue)[T]>;

export type Actor =
  | { type: 'person'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'renter'; applicationId: string }
  | { type: 'landlord'; landlordId: string };

function actorId(actor: Actor): string | null {
  switch (actor.type) {
    case 'person':
      return actor.userId;
    case 'renter':
      return actor.applicationId;
    case 'landlord':
      return actor.landlordId;
    default:
      return null;
  }
}

export interface NewEvent<T extends EventType> {
  organisationId: string;
  lettingId?: string | null;
  actor: Actor;
  type: T;
  subject?: { type: string; id: string };
  data: EventData<T>;
  occurredAt?: Date;
}

/** Writes an event in the caller's transaction, so the record never drifts from the data. */
export async function recordEvent<T extends EventType>(tx: Tx, event: NewEvent<T>): Promise<void> {
  const data = eventCatalogue[event.type].parse(event.data) as Record<string, unknown>;
  assertNoPersonalData(event.type, data);
  await tx.insert(events).values({
    organisationId: event.organisationId,
    lettingId: event.lettingId ?? null,
    actorType: event.actor.type,
    actorId: actorId(event.actor),
    type: event.type,
    subjectType: event.subject?.type ?? null,
    subjectId: event.subject?.id ?? null,
    data,
    ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
  });
}

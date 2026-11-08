import { z } from 'zod';
import type { Tx } from '@/db/client';
import { events } from '@/db/schema';
import { assertNoPersonalData } from '@/domain/record/personal-data';
import { withdrawableStatuses } from '@/domain/enquiries/marketplace';

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
  'enquiry.received': z.object({
    applicationId: z.uuid(),
    portal: z.enum(['daft', 'myhome', 'gaff']),
  }),
  /** R6: the same renter enquired again (maybe on the other portal): merged, not duplicated. */
  'enquiry.repeated': z.object({
    applicationId: z.uuid(),
    portal: z.enum(['daft', 'myhome', 'gaff']),
  }),
  /** M81: the renter withdrew their enquiry; their details follow the retention rules. */
  'enquiry.withdrawn': z.object({
    applicationId: z.uuid(),
    from: z.enum(withdrawableStatuses),
  }),
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
      'checks_invitation',
      'reference_request',
      'reference_reminder',
      'landlord_approval',
      'offer',
      'offer_expired',
      'outcome',
      'agreement_ready',
      'agreement_signed',
      'payment_request',
      'payment_received',
      'inventory_shared',
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
  /** P16: a renter asked for a text code to book a viewing, and confirmed their mobile. */
  'booking.mobile_code_sent': z.object({ applicationId: z.uuid() }),
  'booking.mobile_confirmed': z.object({ applicationId: z.uuid() }),
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
  /** R17: a person chose the preferred applicant and maybe a backup (a 'choose_applicants' decision). */
  'applicants.chosen': z.object({
    decisionId: z.uuid(),
    applied: z.number().int(),
    withBackup: z.boolean(),
  }),
  /** R18: checks set up for someone a person chose, and the renter told about them. */
  'checks.requested': z.object({ applicationId: z.uuid(), checks: z.number().int() }),
  /** R18: the renter started an ID or income check with the provider. */
  'check.started': z.object({ checkId: z.uuid(), kind: z.enum(['identity', 'income']) }),
  /** R18: a referee was asked (then reminded twice, if needed). */
  'reference.requested': z.object({
    checkId: z.uuid(),
    kind: z.enum(['landlord_reference', 'employer_reference']),
  }),
  /** R18: how a check ended. Never a refusal: a person decides. */
  'check.completed': z.object({
    checkId: z.uuid(),
    kind: z.enum(['identity', 'income', 'landlord_reference', 'employer_reference']),
    outcome: z.enum(['passed', 'not_passed', 'answered', 'no_answer', 'not_needed']),
  }),
  /** R19: the operator added (or updated) the landlord's contact details. */
  'letting.landlord_added': z.object({ updated: z.boolean() }),
  /** R19: the landlord was sent a private link to approve the chosen applicants. */
  'landlord.approval_requested': z.object({ approvalId: z.uuid(), withBackup: z.boolean() }),
  /** R19: the landlord's answer for each person. */
  'landlord.approval_answered': z.object({
    approvalId: z.uuid(),
    preferred: z.enum(['approved', 'declined']),
    backup: z.enum(['approved', 'declined']).nullable(),
  }),
  /** R20: an offer went out (to the backup only as a person pre-approved, Q20). */
  'offer.made': z.object({
    offerId: z.uuid(),
    decisionId: z.uuid(),
    role: z.enum(['preferred', 'backup']),
    deadlineHours: z.number().int(),
    withBackup: z.boolean(),
  }),
  'offer.accepted': z.object({ offerId: z.uuid() }),
  'offer.declined': z.object({ offerId: z.uuid() }),
  'offer.expired': z.object({ offerId: z.uuid() }),
  /** R21: everyone else was told, with the date their details go. */
  'outcomes.sent': z.object({ told: z.number().int(), deleteAfter: z.iso.date() }),
  /** R22: the tenancy, set up when the offer was accepted. */
  'tenancy.created': z.object({ tenancyId: z.uuid() }),
  'agreement.sent': z.object({ tenancyId: z.uuid() }),
  'agreement.signed_by_tenant': z.object({ tenancyId: z.uuid() }),
  /** R22: both sides signed (a 'sign_agreement' decision), electronically or on paper. */
  'agreement.signed': z.object({
    tenancyId: z.uuid(),
    decisionId: z.uuid(),
    mode: z.enum(['electronic', 'paper']),
  }),
  /** R23: the operator's payment account changed (the IBAN itself is never logged). */
  'settings.payment_account': z.object({ changed: z.boolean() }),
  /** R23: the deposit and first month's rent asked for, to the operator's own account. */
  'payment.requested': z.object({
    tenancyId: z.uuid(),
    totalCents: z.number().int(),
    dueDate: z.iso.date(),
  }),
  'payment.received': z.object({ tenancyId: z.uuid() }),
  /** R24 (Q24): the tenant gave (or removed) their optional PPS number; never the number. */
  'tenancy.ppsn_given': z.object({ tenancyId: z.uuid(), given: z.boolean() }),
  /** R24: registered with the RTB; the PPS number is deleted then. */
  'tenancy.rtb_registered': z.object({ tenancyId: z.uuid(), ppsnDeleted: z.boolean() }),
  /** R25: moving in. */
  'movein.checklist_saved': z.object({ tenancyId: z.uuid(), keysHandedOver: z.boolean() }),
  'inventory.item_added': z.object({
    tenancyId: z.uuid(),
    itemId: z.uuid(),
    withPhoto: z.boolean(),
  }),
  'inventory.shared': z.object({ tenancyId: z.uuid(), items: z.number().int() }),
  'inventory.confirmed': z.object({ tenancyId: z.uuid() }),
  /** R26, stage 9: the let home is finished; the record stays, personal details go later. */
  'letting.finished': z.object({
    tenancyId: z.uuid(),
    daysToLet: z.number().int().nullable(),
    deleteAfter: z.iso.date(),
  }),
  /** R26: the tenant's references deleted once the tenancy started (PRD checks table). */
  'tenancy.references_deleted': z.object({ tenancyId: z.uuid(), references: z.number().int() }),
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
  /** M43: a photo was added to a home or development, then checked and resized. */
  'photo.added': z.object({
    mediaId: z.uuid(),
    kind: z.enum(['photo', 'floor_plan', 'logo', 'agent_photo']),
  }),
  'photo.processed': z.object({
    mediaId: z.uuid(),
    outcome: z.enum(['ready', 'rejected']),
    reason: z.enum(['not_an_image', 'too_small', 'unreadable', 'missing']).optional(),
  }),
  /** M22 to M27: a check on a letter was started, and decided by a provider or a person. */
  'letter_check.requested': z.object({
    checkId: z.uuid(),
    method: z.enum(['mobile', 'id_document', 'psra_register']),
    ofAgent: z.boolean(),
  }),
  'letter_check.decided': z.object({
    checkId: z.uuid(),
    method: z.enum(['mobile', 'id_document', 'psra_register']),
    outcome: z.enum(['passed', 'failed', 'needs_review']),
    reason: z
      .enum(['name_differs', 'not_current', 'not_found', 'document', 'face_mismatch', 'gave_up'])
      .optional(),
  }),
  /** M24: the ID-check provider was asked to delete its copy of the documents. */
  'letter_check.provider_redacted': z.object({ checkId: z.uuid() }),
  /** P23, P29: a chosen renter's own identity check, copied to their application. */
  'identity.shared': z.object({
    applicationId: z.uuid(),
    checkId: z.uuid(),
    outcome: z.enum(['checked', 'in_person']),
  }),
  /** P27: the letter saw an original photo ID when they met the renter. */
  'check.recorded_in_person': z.object({ applicationId: z.uuid(), checkId: z.uuid() }),
  /** M16: an admin invited a colleague; a colleague joined; one was removed. */
  'member.invited': z.object({
    invitationId: z.uuid(),
    role: z.enum(['admin', 'negotiator']),
  }),
  'member.removed': z.object({ role: z.enum(['admin', 'negotiator']) }),
  /** M17, M18: the public profile of the organisation, or a member's own, changed. */
  'profile.updated': z.object({ whose: z.enum(['organisation', 'member']) }),
  /** M48 to M52: a listing was published, held for review, changed status or was confirmed. */
  'listing.published': z.object({ listingId: z.uuid(), revision: z.number().int() }),
  'listing.edited': z.object({ listingId: z.uuid(), revision: z.number().int() }),
  'listing.held': z.object({
    listingId: z.uuid(),
    reasons: z.array(
      z.enum([
        'photo_reused',
        'rent_far_below',
        'scam_wording',
        'description_copied',
        'new_account_burst',
        'unfair_wording',
        'first_listing_review',
      ]),
    ),
  }),
  /** ADR-0023, P13: the AI flagged wording in a listing; counts and grounds only. */
  'listing.wording_flagged': z.object({
    listingId: z.uuid(),
    findings: z.number().int(),
    grounds: z.array(
      z.enum([
        'gender',
        'civil_status',
        'family_status',
        'sexual_orientation',
        'religion',
        'age',
        'disability',
        'race',
        'traveller_community',
        'housing_assistance',
      ]),
    ),
  }),
  /** M45, P10: the AI drafted a description; whether it passed Gaff's checks, and if not why. */
  'listing.description_drafted': z.object({
    listingId: z.uuid(),
    accepted: z.boolean(),
    problem: z
      .enum([
        'unavailable',
        'too_short',
        'too_long',
        'listing_text',
        'unknown_fact',
        'number_not_in_facts',
      ])
      .optional(),
  }),
  /** M32 to M35: developments and the homes added to them. */
  'development.created': z.object({ developmentId: z.uuid() }),
  'development.updated': z.object({ developmentId: z.uuid() }),
  'development.published': z.object({ developmentId: z.uuid() }),
  'development.homes_added': z.object({ developmentId: z.uuid(), homes: z.number().int() }),
  'listing.hold_resolved': z.object({
    listingId: z.uuid(),
    outcome: z.enum(['released', 'removed']),
    reason: z
      .enum(['scam', 'discrimination', 'misleading', 'duplicate', 'offensive', 'other'])
      .optional(),
  }),
  'listing.status_changed': z.object({
    listingId: z.uuid(),
    from: z.enum([
      'draft',
      'in_review',
      'live',
      'paused',
      'enquiries_closed',
      'let_agreed',
      'let',
      'withdrawn',
    ]),
    to: z.enum([
      'draft',
      'in_review',
      'live',
      'paused',
      'enquiries_closed',
      'let_agreed',
      'let',
      'withdrawn',
    ]),
    because: z.enum(['letter', 'letting', 'freshness', 'review', 'enquiry_limit']),
  }),
  'listing.confirmed': z.object({ listingId: z.uuid() }),
  'listing.declared': z.object({ homeId: z.uuid(), wordingVersion: z.enum(['m25-v1']) }),
} satisfies Record<string, z.ZodObject>;

export type EventType = keyof typeof eventCatalogue;
export type EventData<T extends EventType> = z.input<(typeof eventCatalogue)[T]>;

export type Actor =
  | { type: 'person'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'renter'; applicationId: string }
  | { type: 'landlord'; landlordId: string }
  | { type: 'staff'; userId: string };

function actorId(actor: Actor): string | null {
  switch (actor.type) {
    case 'person':
      return actor.userId;
    case 'renter':
      return actor.applicationId;
    case 'landlord':
      return actor.landlordId;
    case 'staff':
      return actor.userId;
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

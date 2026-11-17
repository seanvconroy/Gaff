import { z } from 'zod';
import type { Tx } from '@/db/client';
import { events } from '@/db/schema';
import { draftOrigins } from '@/domain/lettings/add-letting';
import { organisationKinds } from '@/domain/organisations/kinds';
import { assertNoPersonalData } from '@/domain/record/personal-data';

/**
 * Every event type and the shape of its payload (ADR-0006). Payload fields must be IDs,
 * enums, numbers, booleans or dates: a compliance test rejects plain strings here.
 */
export const eventCatalogue = {
  'organisation.created': z.object({ kind: z.enum(organisationKinds) }),
  'member.joined': z.object({ role: z.enum(['admin', 'negotiator']) }),
  /**
   * UX-AG-4, UX-AG-5 (Q32): someone at Gaff confirmed that the agency's first admin works there
   * (`checked`), or a founder set the agency up for a pilot and invited its admin (`invited`).
   */
  'organisation.confirmed': z.object({ how: z.enum(['checked', 'invited']) }),
  /** UX-AG-2: an agency that was applying for its licence found it on the register. */
  'organisation.licence_found': z.object({ registerEntryId: z.uuid() }),
  /** UX-AG-6: the weekly check found the agency's licence gone from the register, or back. */
  'organisation.licence_lapsed': z.object({ registerEntryId: z.uuid() }),
  'organisation.licence_renewed': z.object({ registerEntryId: z.uuid() }),
  /** UX-AG-5: a founder invited an agency's first admin, by email. Never the address. */
  'member.invited': z.object({ inviteId: z.uuid(), role: z.enum(['admin', 'negotiator']) }),
  /** UX-AG-3: someone asked to join the agency. Its admins answer (WP-19). */
  'member.join_requested': z.object({ requestId: z.uuid() }),
  /**
   * UX-AG-4: a person decided to put the home live (a 'confirm_setup' decision) while their
   * agency was being confirmed. It goes live when the agency is confirmed.
   */
  'letting.go_live_held': z.object({
    decisionId: z.uuid(),
    reason: z.enum(['being_confirmed']),
  }),
  /** UX-AG-4: the agency was confirmed, but the home's set-up had been undone meanwhile. */
  'letting.go_live_hold_ended': z.object({ reason: z.enum(['not_ready']) }),
  /**
   * UX-AC-14 (rule 1): a member who applied for this home as a renter tried to open it in the
   * workspace, or to decide something on it, and was stopped. The actor is that member.
   */
  'letting.conflict_noted': z.object({ stopped: z.enum(['page', 'decision']) }),
  /**
   * UX-FL-2: someone began adding a home. Its ID is the letting's from then on, so a letting's
   * record starts here. `origin` is how it began; `fromLettingId` is the letting "Let it again"
   * was pressed on (UX-LT-23).
   */
  'letting.draft_started': z.object({
    origin: z.enum(draftOrigins),
    fromLettingId: z.uuid().optional(),
    /** UX-LT-16: the enquiry it was started from. */
    inboundEmailId: z.uuid().optional(),
  }),
  /**
   * UX-LT-2, UX-AI-5: an advert the lister pasted was read into the home. Counts only: how
   * many values were found, how many the reader gave that code dropped, how many lines about
   * who should apply were left out, how many values ask to be checked. Never a word of it.
   */
  'letting.advert_read': z.object({
    reader: z.enum(['fake', 'bedrock']),
    found: z.number().int().min(0),
    dropped: z.number().int().min(0),
    leftOut: z.number().int().min(0),
    unsure: z.number().int().min(0),
  }),
  /**
   * UX-LT-16: the enquiry a home was started from was attached to it, now that it is a
   * letting. `matched` is false where the email could no longer be read as an enquiry (its
   * content was deleted on schedule, say): then it stays in Inbox.
   */
  'letting.enquiry_attached': z.object({ inboundEmailId: z.uuid(), matched: z.boolean() }),
  /** A step of adding it was answered, or the review confirmed. Which step: never what was typed. */
  'letting.draft_saved': z.object({ step: z.enum(['review', 'address', 'rent', 'home']) }),
  /** UX-LT-8: an advert link was kept, to match enquiries to the home. Never fetched (Q31). */
  'letting.advert_link_kept': z.object({ daft: z.boolean(), myhome: z.boolean() }),
  'letting.created': z.object({
    setupFacts: z.number().int().min(0),
    withLandlord: z.boolean(),
    origin: z.enum(draftOrigins).optional(),
    fromLettingId: z.uuid().optional(),
  }),
  /** A letting in set-up had its address, its date or its facts changed. Which step only. */
  'letting.details_changed': z.object({ step: z.enum(['address', 'rent', 'home']) }),
  /** UX-LT-10: photos were added, removed or put in a new order. Counts only. */
  'letting.photos_changed': z.object({
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
    reordered: z.boolean(),
    count: z.number().int().min(0),
  }),
  /** UX-MT-5: the one house rule. It is shown to renters and never used to rank anyone. */
  'letting.house_rules_set': z.object({ noSmokingIndoors: z.boolean() }),
  /** UX-LT-21: "On gaff.ie" was switched on or off. */
  'letting.on_gaff_set': z.object({ on: z.boolean() }),
  /** "Is it advertised anywhere else?" was answered. */
  'letting.advertised_set': z.object({ daft: z.boolean(), myhome: z.boolean() }),
  /** UX-LT-24: a person looked at what a renter gets, on a made-up enquiry. Nothing was sent. */
  'letting.test_enquiry_sent': z.object({}),
  /**
   * UX-LT-19: Gaff emailed a made-up enquiry to the person's own mailbox, for their forwarding
   * rule to send back. Never the address it went to.
   */
  'forwarding.test_sent': z.object({ service: z.enum(['gmail', 'outlook', 'other']) }),
  /** UX-LT-19: the test enquiry came back through the forwarding rule. */
  'forwarding.test_arrived': z.object({ inboundEmailId: z.uuid() }),
  /**
   * UX-LT-20: mail came through the organisation's forwarding rule for the first time: the test
   * enquiry, or an enquiry from Daft or MyHome. From now on no home asks for forwarding.
   */
  'forwarding.in_place': z.object({ via: z.enum(['test', 'enquiry']) }),
  /** Q43: the lister gave, changed or removed the number renters can call. Never the number. */
  'organisation.phone_set': z.object({ given: z.boolean() }),
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
      'checks_invitation',
      'reference_request',
      'reference_reminder',
      'landlord_approval',
      'owner_link',
      'offer',
      'offer_expired',
      'outcome',
      'agreement_ready',
      'agreement_signed',
      'payment_request',
      'payment_received',
      'inventory_shared',
      'message',
      'owner_message',
    ]),
    channel: z.enum(['email', 'sms']),
    author: z.enum(['template', 'ai', 'person']),
    /**
     * UX-ME-1: whose it was, as IDs, so a funnel can count a first reply, an invitation, an
     * offer or a reference request as delivered for that application or check.
     */
    applicationId: z.uuid().nullable().optional(),
    checkId: z.uuid().nullable().optional(),
  }),
  'message.failed': z.object({ messageId: z.uuid(), attempts: z.number().int() }),
  /** UX-NV-18: a person wrote to a renter or to a home's owner themselves, in Inbox. */
  'message.written': z.object({ messageId: z.uuid(), to: z.enum(['renter', 'owner']) }),
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
  'letting.shared_with_landlord': z.object({
    linkId: z.uuid(),
    /** UX-OW-1: how many earlier links this one replaced. They stop working. */
    replaced: z.number().int().optional(),
  }),
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
    /** `cant_give`: a referee said they can't give the reference (UX-RF-4). */
    outcome: z.enum(['passed', 'not_passed', 'answered', 'no_answer', 'cant_give', 'not_needed']),
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
  /**
   * R23: the operator's payment account changed (the IBAN itself is never logged). UX-SI-10:
   * and how the admin confirmed it was them, just before.
   */
  'settings.payment_account': z.object({
    changed: z.boolean(),
    confirmedBy: z.enum(['passkey', 'email_code']).optional(),
  }),
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
  /** UX-RN-25: the tenant said something's not right about an item. The note isn't here. */
  'inventory.item_queried': z.object({ tenancyId: z.uuid(), itemId: z.uuid() }),
  /** UX-RN-24: the tenant skipped the optional PPS number. */
  'tenancy.ppsn_skipped': z.object({ tenancyId: z.uuid() }),
  /** UX-RN-11: the renter corrected their name or their email when applying. Neither is here. */
  'application.details_changed': z.object({
    applicationId: z.uuid(),
    name: z.boolean(),
    email: z.boolean(),
  }),
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
  /** UX-LP-14: one comparable home entered on its own screen: which one, and how many now. */
  'comparable.recorded': z.object({
    position: z.number().int(),
    count: z.number().int(),
  }),
  /** UX-TN-3 (rule 2): the tenant's PPS number was shown, for registering with the RTB. */
  'tenancy.ppsn_shown': z.object({ tenancyId: z.uuid() }),
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
  | { type: 'landlord'; landlordId: string }
  /** One of Gaff's own team. They can confirm an agency and nothing else (Q13, Q32). */
  | { type: 'staff'; userId: string };

function actorId(actor: Actor): string | null {
  switch (actor.type) {
    case 'person':
    case 'staff':
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

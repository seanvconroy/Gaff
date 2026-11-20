import { z } from 'zod';
import type { Tx } from '@/db/client';
import { events } from '@/db/schema';
import { draftOrigins } from '@/domain/lettings/add-letting';
import { enquirySources } from '@/domain/enquiries/sources';
import { reportReasons } from '@/domain/homes/report';
import { caseDecisions, caseFacts } from '@/domain/trust/cases';
import { riskSignals } from '@/domain/listings/checks';
import { wordingGrounds } from '@/domain/listings/wording';
import { promptCodes } from '@/domain/activation/prompts';
import { organisationKinds } from '@/domain/organisations/kinds';
import { assertNoPersonalData } from '@/domain/record/personal-data';
import { sharedFields } from '@/domain/developments/development';

/**
 * Every event type and the shape of its payload (ADR-0006). Payload fields must be IDs,
 * enums, numbers, booleans or dates: a compliance test rejects plain strings here.
 */
/** UX-AV-6: how an enquiry made on Gaff was shown to come from its renter's own address. */
const confirmedBy = ['signed_in', 'email_link', 'reply'] as const;

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
  /** UX-AG-3: someone asked to join the agency. Its admins answer on Team. */
  'member.join_requested': z.object({ requestId: z.uuid() }),
  /** UX-AG-3: an admin answered a request to join. The subject is the person who asked. */
  'member.join_answered': z.object({
    requestId: z.uuid(),
    answer: z.enum(['approved', 'declined']),
  }),
  /** UX-AG-12: an admin sent an invite again, with a new link, or cancelled it. */
  'member.invite_resent': z.object({ inviteId: z.uuid() }),
  'member.invite_cancelled': z.object({ inviteId: z.uuid() }),
  /** An admin changed a member's role. The subject is the member. */
  'member.role_changed': z.object({ role: z.enum(['admin', 'negotiator']) }),
  /**
   * UX-AG-15: an admin removed a member, and UX-AG-17: a member left. The subject is the
   * person; `handedOver` is how many lettings they led went to someone else.
   */
  'member.removed': z.object({
    role: z.enum(['admin', 'negotiator']),
    handedOver: z.number().int().min(0),
    confirmedBy: z.enum(['passkey', 'email_code']),
  }),
  'member.left': z.object({
    role: z.enum(['admin', 'negotiator']),
    handedOver: z.number().int().min(0),
  }),
  /** UX-GR-1: an admin answered the checklist's "Invite your team" with "It's just me". */
  'team.just_me': z.object({}),
  /** UX-GR-1: the person's setup checklist was complete: it never shows again. */
  'setup.finished': z.object({ steps: z.number().int().min(1) }),
  /** UX-GR-5: "Not now" to a prompt. It waits fourteen days, or for good if shown once. */
  'prompt.declined': z.object({ prompt: z.enum(promptCodes) }),
  /**
   * UX-AG-9: the letting has a new lead: someone chose them (`changed`), or the lead left or
   * was removed (`handover`).
   */
  'letting.lead_changed': z.object({
    leadUserId: z.uuid(),
    reason: z.enum(['changed', 'handover']),
  }),
  /** UX-AG-8: an agent chose "Help with this letting" on a letting someone else leads. */
  'letting.help_started': z.object({}),
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
    reader: z.enum(['fake', 'anthropic', 'bedrock']),
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
  /**
   * M38, M126: the lister placed or moved the home's pin. Whether it was in the area the address
   * names, and whether the home was still a draft: never the point itself, which is a private
   * landlord's personal data (rule 8, ADR-0006).
   */
  'letting.point_set': z.object({
    check: z.enum(['inside', 'outside', 'unknown']),
    draft: z.boolean(),
  }),
  /** UX-LT-8: an advert link was kept, to match enquiries to the home. Never fetched (Q31). */
  'letting.advert_link_kept': z.object({ daft: z.boolean(), myhome: z.boolean() }),
  'letting.created': z.object({
    setupFacts: z.number().int().min(0),
    withLandlord: z.boolean(),
    origin: z.enum(draftOrigins).optional(),
    fromLettingId: z.uuid().optional(),
    /** BA-15 (M35): made with the other homes of a development's type. */
    fromUnitTypeId: z.uuid().optional(),
  }),
  /** A letting in set-up had its address, its date or its facts changed. Which step only. */
  'letting.details_changed': z.object({ step: z.enum(['address', 'rent', 'home']) }),
  /**
   * UX-LT-10: photos were added, removed or put in a new order. Counts only. M44: or one was
   * marked as a floor plan, or as a photo again.
   */
  'letting.photos_changed': z.object({
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
    reordered: z.boolean(),
    count: z.number().int().min(0),
    floorPlan: z.enum(['marked', 'unmarked']).optional(),
  }),
  /** UX-MT-5: the one house rule. It is shown to renters and never used to rank anyone. */
  'letting.house_rules_set': z.object({ noSmokingIndoors: z.boolean() }),
  /** UX-LT-21: "On gaff.ie" was switched on or off. */
  'letting.on_gaff_set': z.object({ on: z.boolean() }),
  /**
   * M49 (BA-13): the home had no change and no "Still available" for this many days, so its
   * lister was asked, on Today and by email. The actor is the system.
   */
  'letting.freshness_asked': z.object({ days: z.number().int().min(1) }),
  /** M49: nobody answered for this many days, so it stepped back from Gaff's public pages. */
  'letting.stepped_back': z.object({
    reason: z.enum(['not_confirmed']),
    days: z.number().int().min(1),
  }),
  /**
   * M49: the lister said "Still available": on Gaff (a person), or from the email's signed link
   * (the system, as nobody signed in). `firstReplies` went to enquiries that waited.
   */
  'letting.confirmed_available': z.object({
    via: z.enum(['gaff', 'email']),
    wasStale: z.boolean(),
    firstReplies: z.number().int().min(0),
  }),
  /**
   * UX-TS-3, BA-9: a visitor reported the home's listing to Gaff's team, for this reason, and it
   * opened or joined this case. Nothing about who sent it is here. The actor is the system.
   */
  'listing.reported': z.object({
    reportId: z.uuid(),
    caseId: z.uuid(),
    reason: z.enum(reportReasons),
  }),
  /**
   * BA-9 (M97): the rules took the home off gaff.ie at once, on strong signs of a scam (this
   * many scam reports on its case), until a person looks. The actor is the system.
   */
  'listing.held': z.object({ caseId: z.uuid(), scamReports: z.number().int().min(1) }),
  /**
   * UX-TS-4, BA-9 (M98): a person on Gaff's team decided the case: the home is off gaff.ie (actor
   * `staff`), for this reason, relying on these facts, answering this many reports. Its
   * enquiries wait until it's back.
   */
  'listing.hidden': z.object({
    caseId: z.uuid(),
    reason: z.enum(reportReasons),
    facts: z.array(z.enum(caseFacts)).min(1),
    reports: z.number().int().min(0),
  }),
  /** UX-TS-4, BA-9: a person decided the case needs no action: the home stays up (`staff`). */
  'listing.kept_up': z.object({ caseId: z.uuid(), reports: z.number().int().min(0) }),
  /** UX-TS-4, BA-9 (M98): the lister asked Gaff's team to look again: this appeal case. */
  'listing.look_again_asked': z.object({ caseId: z.uuid() }),
  /**
   * BA-9 (M98): a different person decided the appeal (actor `staff`): put back, or kept off
   * for this reason, relying on these facts.
   */
  'listing.appeal_decided': z.object({
    caseId: z.uuid(),
    decision: z.enum(caseDecisions),
    reason: z.enum(reportReasons).optional(),
    facts: z.array(z.enum(caseFacts)).min(1).optional(),
  }),
  /**
   * UX-TS-4: the home is back on gaff.ie (actor `staff`), by this case's decision. The enquiries
   * that waited got their first replies: this many.
   */
  'listing.unhidden': z.object({ caseId: z.uuid(), firstReplies: z.number().int().min(0) }),
  /**
   * BA-10 (M29, P12): the checks a home passes as it goes public held it for a person on Gaff's
   * team (actor `system`): this case, these signals as codes, and, for the AI's wording check,
   * how many phrases it found and their grounds as codes. Never the phrases themselves.
   */
  'listing.held_by_checks': z.object({
    caseId: z.uuid(),
    signals: z.array(z.enum(riskSignals)).min(1),
    findings: z.number().int().min(0),
    grounds: z.array(z.enum(wordingGrounds)),
  }),
  /** BA-10 (M98): a person on Gaff's team looked at a held home and released it (`staff`). */
  'listing.released': z.object({ caseId: z.uuid() }),
  /**
   * BA-10 (M107): a person on Gaff's team paused the organisation's listings after this decided
   * case, for this reason, relying on these facts (actor `staff`). None of its homes is public,
   * and none goes live, until it's lifted.
   */
  'organisation.listings_paused': z.object({
    pauseId: z.uuid(),
    caseId: z.uuid(),
    reason: z.enum(reportReasons),
    facts: z.array(z.enum(caseFacts)).min(1),
  }),
  /** BA-10 (M98): the lister asked Gaff to look again at the pause (actor `person`). */
  'organisation.pause_appeal_asked': z.object({ pauseId: z.uuid() }),
  /** BA-10 (M98): a different person decided the appeal: lifted, or kept (`staff`). */
  'organisation.pause_appeal_decided': z.object({
    pauseId: z.uuid(),
    decision: z.enum(caseDecisions),
  }),
  /** BA-10 (M107): the pause ended: lifted by a person on Gaff's team, or on appeal (`staff`). */
  'organisation.listings_unpaused': z.object({
    pauseId: z.uuid(),
    how: z.enum(['lifted', 'appeal']),
  }),
  /** UX-LS-10: the scheduled job took a let home's page off gaff.ie, this many days after it was let. */
  'letting.gaff_page_removed': z.object({ daysAfterLet: z.number().int() }),
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
  /** UX-VW-6: a viewing time was cancelled. `told`: how many people booked were told. */
  'viewings.session_removed': z.object({
    sessionId: z.uuid(),
    told: z.number().int().min(0).optional(),
  }),
  /**
   * UX-VW-6: a viewing time was changed. `moved`: people were booked, so it moved as it was;
   * `told`: how many of them heard.
   */
  'viewings.session_changed': z.object({
    sessionId: z.uuid(),
    moved: z.boolean(),
    told: z.number().int().min(0),
  }),
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
  /**
   * R6, UX-AV-8: a new enquiry, from a portal or made on Gaff. For one made on Gaff,
   * `confirmed` says how its address was shown to be the renter's (UX-AV-6): they were signed
   * in, or they opened the link in their first email, or replied to it.
   */
  'enquiry.received': z.object({
    applicationId: z.uuid(),
    portal: z.enum(enquirySources),
    confirmed: z.enum(confirmedBy).optional(),
  }),
  /** R6, UX-AV-9: the same renter enquired again (maybe elsewhere): merged, not duplicated. */
  'enquiry.repeated': z.object({
    applicationId: z.uuid(),
    portal: z.enum(enquirySources),
    confirmed: z.enum(confirmedBy).optional(),
  }),
  /**
   * UX-AV-6: an enquiry made on Gaff from a typed email, waiting for its link to be opened. It
   * names no letting: nothing reaches the letting until the renter confirms.
   */
  'enquiry.waiting': z.object({ waitingEnquiryId: z.uuid(), again: z.boolean() }),
  /** UX-AV-6: it was confirmed, and is now this application. */
  'enquiry.confirmed': z.object({ waitingEnquiryId: z.uuid(), applicationId: z.uuid() }),
  /** UX-AV-6: unconfirmed after 24 hours, or its home stopped taking enquiries: dropped. */
  'enquiry.dropped': z.object({
    waitingEnquiryId: z.uuid(),
    reason: z.enum(['unconfirmed', 'not_available']),
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
  /** P16: a renter was texted a code to confirm their mobile before booking; it matched. */
  'booking.mobile_code_sent': z.object({ applicationId: z.uuid() }),
  'booking.mobile_confirmed': z.object({ applicationId: z.uuid() }),
  /** R18: checks set up for someone a person chose, and the renter told about them. */
  'checks.requested': z.object({ applicationId: z.uuid(), checks: z.number().int() }),
  /** R18: the renter started an ID or income check with the provider; P25: which try. */
  'check.started': z.object({
    checkId: z.uuid(),
    kind: z.enum(['identity', 'income']),
    attempt: z.number().int().optional(),
  }),
  /** P26: the ID provider deleted the document and selfie it held for this check. */
  'check.redacted': z.object({ checkId: z.uuid() }),
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
    /**
     * UX-PF-12: an ID check passed because the renter said yes, this time, to using the one they
     * keep on their own profile. Absent: the check was done for this letting.
     */
    kept: z.boolean().optional(),
  }),
  /** R19: the operator added (or updated) the landlord's contact details. */
  'letting.landlord_added': z.object({ updated: z.boolean() }),
  /** R19: the landlord was sent a private link to approve the chosen applicants. */
  'landlord.approval_requested': z.object({ approvalId: z.uuid(), withBackup: z.boolean() }),
  /** UX-DC-16: a person reminded the owner, who was sent the same email with a new link. */
  'landlord.approval_reminded': z.object({ approvalId: z.uuid() }),
  /**
   * UX-DC-15 (Q22): a person recorded that the owner had already approved the people chosen.
   * The offer decision then records that the operator confirmed it.
   */
  'landlord.approval_confirmed': z.object({ approvalId: z.uuid(), withBackup: z.boolean() }),
  /** UX-DC-13: a person sent a reminder about a check waiting on the renter or a referee. */
  'check.reminded': z.object({
    checkId: z.uuid(),
    kind: z.enum(['identity', 'income', 'landlord_reference', 'employer_reference']),
    to: z.enum(['renter', 'referee']),
  }),
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
  /** BA-15 (M32): a development was started. */
  'development.created': z.object({ developmentId: z.uuid() }),
  /**
   * BA-15: a development's name, address, pin or shared facts changed, and how many of its
   * homes took the change (those still using the shared value).
   */
  'development.changed': z.object({
    developmentId: z.uuid(),
    part: z.enum(['name', 'address', 'pin', 'facts']),
    homes: z.number().int().min(0),
  }),
  /** BA-15 (M33): a development's or a type's shared photos changed, and how many homes took it. */
  'development.photos_changed': z.object({
    developmentId: z.uuid(),
    unitTypeId: z.uuid().optional(),
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
    reordered: z.boolean(),
    count: z.number().int().min(0),
    floorPlan: z.enum(['marked', 'unmarked']).optional(),
    homes: z.number().int().min(0),
  }),
  /** BA-15 (M33): a type of home was added to a development. */
  'unit_type.added': z.object({ developmentId: z.uuid(), unitTypeId: z.uuid() }),
  /** BA-15: a type's rooms or rent changed, and how many of its homes took the change. */
  'unit_type.changed': z.object({
    unitTypeId: z.uuid(),
    part: z.enum(['home', 'rent']),
    homes: z.number().int().min(0),
  }),
  /** BA-15 (M35): the homes of a type were made, in one step. */
  'unit_type.homes_made': z.object({ unitTypeId: z.uuid(), homes: z.number().int().min(1) }),
  /** BA-15: a viewing time offered across a type's homes at once. */
  'unit_type.viewing_offered': z.object({
    unitTypeId: z.uuid(),
    homes: z.number().int().min(1),
  }),
  /**
   * BA-15: a person put a type's homes live together. Each home's going live is that person's
   * own recorded decision (`letting.went_live`); this counts how it went.
   */
  'unit_type.put_live': z.object({
    unitTypeId: z.uuid(),
    live: z.number().int().min(0),
    held: z.number().int().min(0),
    notReady: z.number().int().min(0),
  }),
  /** BA-15: a lister changed shared values by hand on one home: from now on they're its own. */
  'letting.own_values_set': z.object({ fields: z.array(z.enum(sharedFields)).min(1) }),
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

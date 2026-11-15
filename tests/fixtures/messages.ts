import { answersEmail, operatorAnswerEmail } from '@/copy/templates/answers';
import { applyInvitationEmail } from '@/copy/templates/applications';
import { checksInvitationEmail, referenceRequestEmail } from '@/copy/templates/checks';
import { lettingClosedEmail } from '@/copy/templates/closing';
import { firstReply } from '@/copy/templates/first-reply';
import { holdingEmail, invitationEmail, waitlistedEmail } from '@/copy/templates/invitations';
import {
  landlordApprovalEmail,
  offerEmail,
  offerExpiredEmail,
  outcomeEmail,
} from '@/copy/templates/offers';
import {
  agreementReadyEmail,
  agreementSignedEmail,
  inventorySharedEmail,
  paymentReceivedEmail,
  paymentRequestEmail,
} from '@/copy/templates/tenancy';
import {
  bookingConfirmationEmail,
  placeOfferedEmail,
  reminderEmail,
  reminderSms,
} from '@/copy/templates/viewings';
import type { OutboundKind } from '@/server/messages/outbox';

/**
 * Every message Gaff sends to a renter, an owner or a referee, each written once with made-up
 * details (UX-AI-10). The tests that pin the templates' words and the tests of the email layout
 * both read this list, so a new template is covered by adding it here.
 */
export const MESSAGES_WRITTEN_AT = new Date('2026-11-01T12:00:00Z');

export const APP = 'https://app.gaff.test';
const RENTER_LINK = `${APP}/r/renter-token`;

export interface WrittenMessage {
  /** The message's name in these tests. */
  name: string;
  kind: OutboundKind;
  /** Who wrote the words: a fixed template, the assistant, or a person at the lister. */
  author: 'template' | 'ai' | 'person';
  subject: string;
  body: string;
  /** The private link the message carries, if it carries one. */
  link: string | null;
}

const base = {
  renterName: 'Aoife Byrne',
  operatorName: 'Halcyon Lettings',
  address: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
};
const tenant = { ...base, tenantName: 'Aoife Byrne' };
const viewing = {
  ...base,
  startsAt: new Date('2026-11-07T18:00:00Z'),
  manageUrl: RENTER_LINK,
};
const sessions = [
  { startsAt: new Date('2026-11-07T18:00:00Z'), endsAt: new Date('2026-11-07T19:00:00Z') },
  { startsAt: new Date('2026-11-09T11:00:00Z'), endsAt: new Date('2026-11-09T11:30:00Z') },
];
const reference = {
  refereeName: 'Mary Byrne',
  renterName: 'Aoife Byrne',
  operatorName: 'Halcyon Lettings',
  referenceUrl: `${APP}/reference/referee-token`,
};

/** The fixed text message (R13). It is not an email, and its words are pinned too. */
export function writtenSms(): string {
  return reminderSms(viewing);
}

export function writtenMessages(): WrittenMessage[] {
  const now = MESSAGES_WRITTEN_AT;
  const firstReplyInput = {
    ...base,
    rentCents: 185_000,
    availableFrom: '2026-12-01',
    questionsUrl: RENTER_LINK,
    firstViewing: sessions[0]!.startsAt,
    privacyUrl: `${APP}/privacy/halcyon-lettings`,
  };
  const list: Array<
    [
      string,
      OutboundKind,
      { subject: string; body: string },
      string | null,
      WrittenMessage['author']?,
    ]
  > = [
    ['first reply', 'first_reply', firstReply(firstReplyInput, now), RENTER_LINK],
    [
      'first reply, nothing to answer',
      'first_reply',
      firstReply({ ...firstReplyInput, questionsUrl: null, firstViewing: null }, now),
      null,
    ],
    [
      'answer',
      'answer',
      answersEmail({
        ...base,
        answers: [{ question: 'Is there a garden?', answer: 'Yes, a small back garden.' }],
        passedToPerson: true,
      }),
      null,
      'ai',
    ],
    [
      'a person’s answer',
      'operator_answer',
      operatorAnswerEmail({
        ...base,
        personName: 'Ann Power',
        question: 'Is there parking?',
        answer: 'Yes, one space behind the building.',
      }),
      null,
      'person',
    ],
    [
      'invitation',
      'invitation',
      invitationEmail({ ...base, bookingUrl: RENTER_LINK, sessions }),
      RENTER_LINK,
    ],
    ['waiting list', 'waitlisted', waitlistedEmail(base), null],
    [
      'holding',
      'holding',
      holdingEmail({ ...base, viewingDays: sessions.map((s) => s.startsAt) }),
      null,
    ],
    [
      'booking confirmation',
      'booking_confirmation',
      bookingConfirmationEmail({ ...viewing, rescheduled: false }),
      RENTER_LINK,
    ],
    [
      'booking moved',
      'booking_confirmation',
      bookingConfirmationEmail({ ...viewing, rescheduled: true }),
      RENTER_LINK,
    ],
    [
      'reminder, the day before',
      'reminder',
      reminderEmail({ ...viewing, when: 'day_before' }),
      RENTER_LINK,
    ],
    [
      'reminder, two hours before',
      'reminder',
      reminderEmail({ ...viewing, when: 'two_hours' }),
      RENTER_LINK,
    ],
    [
      'a place offered to one person',
      'place_offered',
      placeOfferedEmail({
        ...viewing,
        everyone: false,
        holdUntil: new Date('2026-11-06T20:40:00Z'),
      }),
      RENTER_LINK,
    ],
    [
      'a place offered to everyone waiting',
      'place_offered',
      placeOfferedEmail({ ...viewing, everyone: true, holdUntil: null }),
      RENTER_LINK,
    ],
    [
      'letting closed, let',
      'letting_closed',
      lettingClosedEmail({ ...base, outcome: 'let', deleteOn: '2026-12-05' }),
      null,
    ],
    [
      'letting closed, withdrawn',
      'letting_closed',
      lettingClosedEmail({ ...base, outcome: 'withdrawn', deleteOn: '2026-12-05' }),
      null,
    ],
    [
      'invitation to apply',
      'apply_invitation',
      applyInvitationEmail({ ...base, applyUrl: RENTER_LINK }),
      RENTER_LINK,
    ],
    [
      'checks',
      'checks_invitation',
      checksInvitationEmail({ ...base, checksUrl: RENTER_LINK }),
      RENTER_LINK,
    ],
    [
      'reference request, landlord',
      'reference_request',
      referenceRequestEmail({ ...reference, role: 'landlord', reminder: false }),
      reference.referenceUrl,
    ],
    [
      'reference request, employer',
      'reference_request',
      referenceRequestEmail({ ...reference, role: 'employer', reminder: false }),
      reference.referenceUrl,
    ],
    [
      'reference reminder',
      'reference_reminder',
      referenceRequestEmail({ ...reference, role: 'landlord', reminder: true }),
      reference.referenceUrl,
    ],
    [
      'owner approval',
      'landlord_approval',
      landlordApprovalEmail({
        landlordName: 'Mary Byrne',
        operatorName: base.operatorName,
        address: base.address,
        area: base.area,
        withBackup: true,
        approvalUrl: `${APP}/approve/owner-token`,
        availableFrom: '2026-12-01',
      }),
      `${APP}/approve/owner-token`,
    ],
    [
      'offer',
      'offer',
      offerEmail({
        ...base,
        rent: '€1,850',
        deposit: '€1,850',
        startDate: 'Tuesday 1 December',
        deadline: 'Thursday 5 November, 6pm',
        offerUrl: RENTER_LINK,
      }),
      RENTER_LINK,
    ],
    [
      'offer closed',
      'offer_expired',
      offerExpiredEmail({
        ...base,
        deadline: 'Thursday 5 November, 6pm',
        deleteOn: '2026-12-05',
      }),
      null,
    ],
    [
      'outcome, applied',
      'outcome',
      outcomeEmail({ ...base, applied: true, deleteOn: '2026-12-05' }),
      null,
    ],
    [
      'outcome, enquired only',
      'outcome',
      outcomeEmail({ ...base, applied: false, deleteOn: '2026-12-05' }),
      null,
    ],
    [
      'agreement ready',
      'agreement_ready',
      agreementReadyEmail({ ...tenant, agreementUrl: `${RENTER_LINK}/agreement` }),
      `${RENTER_LINK}/agreement`,
    ],
    [
      'agreement signed',
      'agreement_signed',
      agreementSignedEmail({ ...tenant, agreementUrl: `${RENTER_LINK}/agreement` }),
      `${RENTER_LINK}/agreement`,
    ],
    [
      'payment request',
      'payment_request',
      paymentRequestEmail({
        ...tenant,
        deposit: '€1,850',
        firstRent: '€1,850',
        total: '€3,700',
        dueDate: 'Friday 27 November',
        pageUrl: RENTER_LINK,
      }),
      RENTER_LINK,
    ],
    [
      'payment received',
      'payment_received',
      paymentReceivedEmail({ ...tenant, total: '€3,700', startDate: 'Tuesday 1 December' }),
      null,
    ],
    [
      'inventory',
      'inventory_shared',
      inventorySharedEmail({ ...tenant, pageUrl: RENTER_LINK }),
      RENTER_LINK,
    ],
  ];
  return list.map(([name, kind, message, link, author]) => ({
    name,
    kind,
    author: author ?? 'template',
    subject: message.subject,
    body: message.body,
    link,
  }));
}

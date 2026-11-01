import { and, desc, eq, gt, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  messages,
  offers,
  organisations,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import {
  OFFER_EXPIRED_TEMPLATE,
  OFFER_TEMPLATE,
  OUTCOME_TEMPLATE,
  offerEmail,
  offerExpiredEmail,
  outcomeEmail,
} from '@/copy/templates/offers';
import { offerExpiry, offerTermsSchema, whoCanBeOffered } from '@/domain/offers/offer';
import { deletionDateAfterClosing } from '@/domain/retention/retention';
import { env } from '@/lib/env';
import { formatDate, formatDateTime, formatEuro, irishToday } from '@/lib/format';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent, type Actor } from '@/server/record/events';
import { approvalState } from './approval';

type Letting = typeof lettings.$inferSelect;

function deleteOn(): string {
  return deletionDateAfterClosing(irishToday(), env().RETENTION_PERSONAL_DAYS);
}

/** Sends one offer: the renter's status, the email, and the job that closes it at the deadline. */
async function createOffer(
  tx: Tx,
  input: {
    organisationId: string;
    letting: Letting;
    operatorName: string;
    applicationId: string;
    role: 'preferred' | 'backup';
    depositCents: number;
    startDate: string;
    deadlineHours: number;
    decisionId: string;
    thenOfferToId: string | null;
    actor: Actor;
  },
): Promise<void> {
  const [person] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId));
  if (!person) throw new Error('No such application');
  const expiresAt = offerExpiry(new Date(), input.deadlineHours);
  const [offer] = await tx
    .insert(offers)
    .values({
      organisationId: input.organisationId,
      lettingId: input.letting.id,
      applicationId: input.applicationId,
      role: input.role,
      rentCents: input.letting.monthlyRentCents,
      depositCents: input.depositCents,
      startDate: input.startDate,
      deadlineHours: input.deadlineHours,
      expiresAt,
      decisionId: input.decisionId,
      thenOfferToId: input.thenOfferToId,
    })
    .returning({ id: offers.id });
  await tx
    .update(applications)
    .set({ status: 'offered' })
    .where(eq(applications.id, input.applicationId));
  const token = await createAccessLink(tx, {
    organisationId: input.organisationId,
    purpose: 'renter',
    subjectId: input.applicationId,
  });
  await queueMessage(tx, {
    organisationId: input.organisationId,
    lettingId: input.letting.id,
    applicationId: input.applicationId,
    kind: 'offer',
    author: 'template',
    templateKey: OFFER_TEMPLATE,
    toAddress: person.email,
    ...offerEmail({
      renterName: person.fullName,
      operatorName: input.operatorName,
      address: input.letting.addressLine1,
      area: input.letting.area,
      rent: formatEuro(input.letting.monthlyRentCents),
      deposit: formatEuro(input.depositCents),
      startDate: formatDate(input.startDate),
      deadline: formatDateTime(expiresAt),
      offerUrl: `${env().APP_URL}/r/${token}`,
    }),
  });
  await enqueue(
    tx,
    'expire_home_offer',
    { organisationId: input.organisationId, offerId: offer!.id },
    { runAt: expiresAt, jobKey: `expire_home_offer:${offer!.id}` },
  );
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.letting.id,
    actor: input.actor,
    type: 'offer.made',
    subject: { type: 'offer', id: offer!.id },
    data: {
      offerId: offer!.id,
      decisionId: input.decisionId,
      role: input.role,
      deadlineHours: input.deadlineHours,
      withBackup: input.thenOfferToId !== null,
    },
  });
}

export type MakeOfferResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * R20: a person makes the offer (a 'make_offer' decision), with the landlord's approval
 * (R19, Q22), a deposit of no more than a month's rent, a move-in date and a deadline. They can
 * also approve offering it to the backup if it isn't accepted in time (Q20).
 */
export async function makeOffer(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
): Promise<MakeOfferResult> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting || letting.status !== 'live') {
      throw new UserFacingError('This home isn’t taking applications.');
    }
    const [open] = await tx
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.lettingId, lettingId), inArray(offers.status, ['open', 'accepted'])))
      .limit(1);
    if (open) throw new UserFacingError('An offer is already out for this home.');
    const state = await approvalState(tx, lettingId);
    if (!state?.preferredId) throw new UserFacingError('Choose your preferred applicant first.');
    const parsed = offerTermsSchema(letting.monthlyRentCents, irishToday()).safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    const terms = parsed.data;
    const who = whoCanBeOffered({
      route: state.route,
      approval: state.approval,
      landlordConfirmed: terms.landlordConfirmed,
      hasBackup: state.backupId !== null,
    });
    if (!who.preferred) throw new UserFacingError(who.problem ?? 'The landlord hasn’t approved.');
    if (terms.offerBackup && !who.backup) {
      throw new UserFacingError(
        'The landlord hasn’t approved your backup, so the offer can’t go to them automatically.',
      );
    }
    const thenOfferToId = terms.offerBackup ? state.backupId : null;
    const decision = await recordDecision(tx, {
      member,
      kind: 'make_offer',
      lettingId,
      basis: {
        applicationId: state.preferredId,
        rentCents: letting.monthlyRentCents,
        depositCents: terms.depositCents,
        startDate: terms.startDate,
        deadlineHours: terms.deadlineHours,
        thenOfferToId,
        approvalRoute: state.route,
        approvalId: state.approval?.id ?? null,
        landlordConfirmedByOperator: state.route === 'operator_confirms',
      },
    });
    const [organisation] = await tx
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    await createOffer(tx, {
      organisationId: member.organisationId,
      letting,
      operatorName: organisation!.name,
      applicationId: state.preferredId,
      role: 'preferred',
      depositCents: terms.depositCents,
      startDate: terms.startDate,
      deadlineHours: terms.deadlineHours,
      decisionId: decision.id,
      thenOfferToId,
      actor: { type: 'person', userId: member.userId },
    });
    await tx.update(lettings).set({ stage: 'offer' }).where(eq(lettings.id, lettingId));
    return { ok: true };
  });
}

/** An offer that wasn't accepted goes to the backup, if a person approved that (Q20). */
async function afterOfferLapsed(tx: Tx, offer: typeof offers.$inferSelect): Promise<void> {
  if (!offer.thenOfferToId) return;
  const [backup] = await tx
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.id, offer.thenOfferToId));
  if (backup?.status !== 'backup') return;
  const [letting] = await tx.select().from(lettings).where(eq(lettings.id, offer.lettingId));
  const [organisation] = await tx
    .select({ name: organisations.name })
    .from(organisations)
    .where(eq(organisations.id, offer.organisationId));
  await createOffer(tx, {
    organisationId: offer.organisationId,
    letting: letting!,
    operatorName: organisation!.name,
    applicationId: offer.thenOfferToId,
    role: 'backup',
    depositCents: offer.depositCents,
    startDate: offer.startDate,
    deadlineHours: offer.deadlineHours,
    decisionId: offer.decisionId,
    thenOfferToId: null,
    // Pre-approved by the person's make_offer decision (Q20); Gaff only carries it out.
    actor: { type: 'system' },
  });
}

/**
 * R21: once the home is let, everyone else hears promptly, in fixed wording, with the date
 * their details go. People who applied are told it went to another applicant.
 */
async function sendOutcomes(
  tx: Tx,
  input: { organisationId: string; letting: Letting; acceptedId: string },
): Promise<void> {
  const deleteAfter = deleteOn();
  const [organisation] = await tx
    .select({ name: organisations.name })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));
  const others = await tx
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.lettingId, input.letting.id),
        ne(applications.id, input.acceptedId),
        isNull(applications.personalDataDeletedAt),
        notInArray(applications.status, ['withdrawn', 'declined']),
      ),
    );
  for (const person of others) {
    const applied = ['applied', 'preferred', 'backup', 'offered'].includes(person.status);
    await queueMessage(tx, {
      organisationId: input.organisationId,
      lettingId: input.letting.id,
      applicationId: person.id,
      kind: 'outcome',
      author: 'template',
      templateKey: OUTCOME_TEMPLATE,
      toAddress: person.email,
      ...outcomeEmail({
        renterName: person.fullName,
        operatorName: organisation!.name,
        address: input.letting.addressLine1,
        area: input.letting.area,
        applied,
        deleteOn: deleteAfter,
      }),
    });
    await tx
      .update(applications)
      .set({ deleteAfter, ...(applied ? { status: 'not_chosen' as const } : {}) })
      .where(eq(applications.id, person.id));
  }
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.letting.id,
    actor: { type: 'system' },
    type: 'outcomes.sent',
    data: { told: others.length, deleteAfter },
  });
}

export type RespondResult =
  { ok: true; accepted: boolean } | { ok: false; reason: 'link' | 'not_open' | 'expired' };

/** R20: the renter accepts or declines from their private link, before the deadline. */
export async function respondToOffer(
  token: string,
  answer: 'accept' | 'decline',
): Promise<RespondResult> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, reason: 'link' };
  return withOrg(link.organisationId, async (tx) => {
    const [offer] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.applicationId, link.subjectId), eq(offers.status, 'open')))
      .for('update');
    if (!offer) return { ok: false, reason: 'not_open' };
    const [home] = await tx
      .select({ status: lettings.status })
      .from(lettings)
      .where(eq(lettings.id, offer.lettingId));
    if (home?.status !== 'live') return { ok: false, reason: 'not_open' };
    if (offer.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
    const now = new Date();
    if (answer === 'decline') {
      await tx
        .update(offers)
        .set({ status: 'declined', respondedAt: now })
        .where(eq(offers.id, offer.id));
      await tx
        .update(applications)
        .set({ status: 'declined', deleteAfter: deleteOn() })
        .where(eq(applications.id, offer.applicationId));
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: offer.lettingId,
        actor: { type: 'renter', applicationId: offer.applicationId },
        type: 'offer.declined',
        subject: { type: 'offer', id: offer.id },
        data: { offerId: offer.id },
      });
      await afterOfferLapsed(tx, offer);
      return { ok: true, accepted: false };
    }

    await tx
      .update(offers)
      .set({ status: 'accepted', respondedAt: now })
      .where(eq(offers.id, offer.id));
    await tx
      .update(applications)
      .set({ status: 'accepted' })
      .where(eq(applications.id, offer.applicationId));
    const [letting] = await tx
      .update(lettings)
      .set({ status: 'let', stage: 'tenancy' })
      .where(eq(lettings.id, offer.lettingId))
      .returning();
    // Nothing more goes out about viewings or places for anyone else.
    const future = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .where(
        and(
          eq(bookings.lettingId, offer.lettingId),
          eq(bookings.status, 'booked'),
          gt(viewingSlots.startsAt, now),
        ),
      );
    if (future.length > 0) {
      await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: now })
        .where(
          inArray(
            bookings.id,
            future.map((b) => b.id),
          ),
        );
    }
    await tx
      .update(messages)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(messages.lettingId, offer.lettingId),
          ne(messages.applicationId, offer.applicationId),
          inArray(messages.status, ['scheduled', 'awaiting_approval']),
        ),
      );
    await tx
      .update(waitlistOffers)
      .set({ status: 'closed' })
      .where(and(eq(waitlistOffers.lettingId, offer.lettingId), eq(waitlistOffers.status, 'open')));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: offer.lettingId,
      actor: { type: 'renter', applicationId: offer.applicationId },
      type: 'offer.accepted',
      subject: { type: 'offer', id: offer.id },
      data: { offerId: offer.id },
    });
    await sendOutcomes(tx, {
      organisationId: link.organisationId,
      letting: letting!,
      acceptedId: offer.applicationId,
    });
    return { ok: true, accepted: true };
  });
}

/** R20: at the deadline, an unanswered offer closes, the renter is told, and Q20 applies. */
export async function expireHomeOffer(input: {
  organisationId: string;
  offerId: string;
}): Promise<void> {
  await withOrg(input.organisationId, async (tx) => {
    const [offer] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.id, input.offerId), eq(offers.status, 'open')))
      .for('update');
    if (!offer || offer.expiresAt.getTime() > Date.now() + 60_000) return;
    await tx.update(offers).set({ status: 'expired' }).where(eq(offers.id, offer.id));
    const deleteAfter = deleteOn();
    const [person] = await tx
      .update(applications)
      .set({ status: 'declined', deleteAfter })
      .where(eq(applications.id, offer.applicationId))
      .returning();
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, offer.lettingId));
    const [organisation] = await tx
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, offer.organisationId));
    await queueMessage(tx, {
      organisationId: offer.organisationId,
      lettingId: offer.lettingId,
      applicationId: offer.applicationId,
      kind: 'offer_expired',
      author: 'template',
      templateKey: OFFER_EXPIRED_TEMPLATE,
      toAddress: person!.email,
      ...offerExpiredEmail({
        renterName: person!.fullName,
        operatorName: organisation!.name,
        address: letting!.addressLine1,
        area: letting!.area,
        deadline: formatDateTime(offer.expiresAt),
        deleteOn: deleteAfter,
      }),
    });
    await recordEvent(tx, {
      organisationId: offer.organisationId,
      lettingId: offer.lettingId,
      actor: { type: 'system' },
      type: 'offer.expired',
      subject: { type: 'offer', id: offer.id },
      data: { offerId: offer.id },
    });
    await afterOfferLapsed(tx, offer);
  });
}

/** R20: the letting's offers, newest first, for the operator. */
export async function offersFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ offer: offers, name: applications.fullName })
      .from(offers)
      .innerJoin(applications, eq(applications.id, offers.applicationId))
      .where(eq(offers.lettingId, lettingId))
      .orderBy(offers.createdAt),
  );
}

/** R20: a renter's own open (or answered) offer, for their page. */
export async function offerOf(tx: Tx, applicationId: string) {
  const [offer] = await tx
    .select()
    .from(offers)
    .where(eq(offers.applicationId, applicationId))
    .orderBy(desc(offers.createdAt))
    .limit(1);
  return offer ?? null;
}

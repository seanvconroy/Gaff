import { asc, eq, inArray } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings, organisations, viewingSessions } from '@/db/schema';
import {
  HOLDING_TEMPLATE,
  INVITATION_TEMPLATE,
  WAITLISTED_TEMPLATE,
  holdingEmail,
  invitationEmail,
  waitlistedEmail,
} from '@/copy/templates/invitations';
import { PlanError, planInvitations } from '@/domain/shortlist/plan';
import { env } from '@/lib/env';
import { createAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { shortlistFor } from './shortlist';
import { renterAddress } from '@/server/lettings/address';

/**
 * R11: a person approves who is invited to view, and the waiting list, in one action. The
 * decision records the criteria and the ranking they saw (IDs and codes only). Nobody is
 * turned away without it, and everyone hears back.
 */
export async function inviteToView(
  member: Member,
  lettingId: string,
  input: { chosenIds: string[]; waitlistSize: number },
): Promise<{ invited: number; waitlisted: number; notInvited: number }> {
  const ranking = await shortlistFor(member, lettingId);
  let plan;
  try {
    plan = planInvitations({
      rankedIds: ranking.map((r) => r.id),
      undecidedIds: new Set(ranking.filter((r) => r.status === 'enquired').map((r) => r.id)),
      chosenIds: new Set(input.chosenIds),
      waitlistSize: input.waitlistSize,
    });
  } catch (error) {
    if (error instanceof PlanError) throw new UserFacingError(error.message);
    throw error;
  }

  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting || letting.status !== 'live')
      throw new UserFacingError('This home isn’t taking enquiries.');
    const [organisation] = await tx
      .select()
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const sessions = await tx
      .select({ startsAt: viewingSessions.startsAt, endsAt: viewingSessions.endsAt })
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, lettingId))
      .orderBy(asc(viewingSessions.startsAt));

    const decision = await recordDecision(tx, {
      member,
      kind: 'invite_to_view',
      lettingId,
      basis: {
        criteria: letting.criteria ?? { noPets: false },
        ranking: ranking.map((r) => ({
          applicationId: r.id,
          position: r.position,
          met: r.met,
          total: r.total,
          answered: r.answered,
          notMet: r.notMet,
        })),
        invited: plan.invited,
        waitlisted: plan.waitlisted,
      },
    });

    const people = await tx
      .select()
      .from(applications)
      .where(inArray(applications.id, [...plan.invited, ...plan.waitlisted, ...plan.notInvited]));
    const byId = new Map(people.map((p) => [p.id, p]));
    // M38: only the people invited to view get the exact address, if the letter hid it.
    const exactAddress = await renterAddress(tx, letting, 'invited');
    const streetAddress = await renterAddress(tx, letting, 'not_invited');
    const base = (id: string, invited = false) => ({
      renterName: byId.get(id)!.fullName,
      operatorName: organisation!.name,
      address: invited ? exactAddress : streetAddress,
      area: letting.area,
    });
    const send = (
      id: string,
      kind: 'invitation' | 'waitlisted' | 'holding',
      templateKey: string,
      email: { subject: string; body: string },
    ) =>
      queueMessage(tx, {
        organisationId: member.organisationId,
        lettingId,
        applicationId: id,
        kind,
        author: 'template',
        templateKey,
        toAddress: byId.get(id)!.email,
        ...email,
      });

    for (const id of plan.invited) {
      const token = await createAccessLink(tx, {
        organisationId: member.organisationId,
        purpose: 'renter',
        subjectId: id,
      });
      await tx.update(applications).set({ status: 'invited' }).where(eq(applications.id, id));
      await send(
        id,
        'invitation',
        INVITATION_TEMPLATE,
        invitationEmail({
          ...base(id, true),
          bookingUrl: `${env().APP_URL}/r/${token}`,
          sessions,
        }),
      );
    }
    for (const [index, id] of plan.waitlisted.entries()) {
      await tx
        .update(applications)
        .set({ status: 'waitlisted', waitlistPosition: index + 1 })
        .where(eq(applications.id, id));
      await send(id, 'waitlisted', WAITLISTED_TEMPLATE, waitlistedEmail(base(id)));
    }
    for (const id of plan.notInvited) {
      await tx.update(applications).set({ status: 'not_invited' }).where(eq(applications.id, id));
      await send(
        id,
        'holding',
        HOLDING_TEMPLATE,
        holdingEmail({ ...base(id), viewingDays: sessions.map((s) => s.startsAt) }),
      );
    }

    await tx.update(lettings).set({ stage: 'viewings' }).where(eq(lettings.id, lettingId));
    const counts = {
      invited: plan.invited.length,
      waitlisted: plan.waitlisted.length,
      notInvited: plan.notInvited.length,
    };
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'shortlist.decided',
      subject: { type: 'decision', id: decision.id },
      data: { decisionId: decision.id, ...counts },
    });
    return counts;
  });
}

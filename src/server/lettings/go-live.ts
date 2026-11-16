import { and, eq, isNotNull } from 'drizzle-orm';
import { goLiveCopy } from '@/copy/go-live';
import { db, type Tx, withOrg } from '@/db/client';
import { lettings, organisations } from '@/db/schema';
import { countCriteria } from '@/domain/criteria/criteria';
import { readyToTakeEnquiries } from '@/domain/lettings/setup';
import { type GoLiveGate, goLiveGate } from '@/domain/organisations/go-live-gate';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { recordEvent } from '@/server/record/events';
import { lettingDetailIn } from './queries';

const gateColumns = {
  name: organisations.name,
  kind: organisations.kind,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  licenceLapsedAt: organisations.licenceLapsedAt,
};

/** UX-AG-4, UX-AG-6: whether this member's organisation can put a home live, and its name. */
export async function goLiveGateFor(
  member: Member,
): Promise<{ gate: GoLiveGate; organisationName: string }> {
  const [organisation] = await db()
    .select(gateColumns)
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  if (!organisation) throw new Error('The organisation is gone');
  return { gate: goLiveGate(organisation), organisationName: organisation.name };
}

/**
 * Stage 1: the operator confirms the facts, rent and criteria (PRD workflow). Only then does
 * Gaff start answering enquiries for the home. Recorded as a person's decision (ADR-0007).
 *
 * UX-AG-4: while an agency is being confirmed, going live is the one thing held. The person's
 * decision is recorded now, as theirs; the home goes live when someone at Gaff confirms the
 * agency (`releaseHeldLettings`). Returns `held` then, and `live` when the home went live.
 */
export async function startTakingEnquiries(
  member: Member,
  lettingId: string,
): Promise<'live' | 'held'> {
  return withOrg(member.organisationId, async (tx) => {
    const detail = await lettingDetailIn(tx, lettingId);
    if (!detail) throw new UserFacingError('We couldn’t find that letting.');
    if (detail.letting.stage !== 'setup') return 'live';
    if (detail.letting.goLiveHeldAt) return 'held';
    if (!readyToTakeEnquiries(detail.setup)) {
      throw new UserFacingError(
        'Finish setting up first: viewing times, criteria and the rent check.',
      );
    }
    const [organisation] = await tx
      .select(gateColumns)
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const gate = goLiveGate(organisation!);
    if (!gate.open && !gate.waits) {
      throw new UserFacingError(goLiveCopy.held[gate.reason](organisation!.name));
    }

    const decision = await recordDecision(tx, {
      member,
      kind: 'confirm_setup',
      lettingId,
      basis: {
        criteria: countCriteria(detail.letting.criteria ?? { noPets: false }),
        rentCheck: detail.rentCheck?.result ?? null,
        viewingSlots: detail.setup.viewingSlots,
        comparables: detail.setup.comparables,
      },
    });
    if (!gate.open) {
      await tx
        .update(lettings)
        .set({ goLiveHeldAt: new Date(), goLiveDecisionId: decision.id })
        .where(eq(lettings.id, lettingId));
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'letting.go_live_held',
        subject: { type: 'decision', id: decision.id },
        data: { decisionId: decision.id, reason: 'being_confirmed' },
      });
      return 'held';
    }
    await goLive(tx, {
      organisationId: member.organisationId,
      lettingId,
      decisionId: decision.id,
      actor: { type: 'person', userId: member.userId },
    });
    return 'live';
  });
}

async function goLive(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    decisionId: string;
    actor: { type: 'person'; userId: string } | { type: 'system' };
  },
): Promise<void> {
  const updated = await tx
    .update(lettings)
    .set({ stage: 'enquiries', status: 'live', liveAt: new Date(), goLiveHeldAt: null })
    .where(eq(lettings.id, input.lettingId))
    .returning({ id: lettings.id });
  if (updated.length === 0) throw new UserFacingError('We couldn’t find that letting.');
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    actor: input.actor,
    type: 'letting.went_live',
    subject: { type: 'decision', id: input.decisionId },
    data: { decisionId: input.decisionId },
  });
  // R7: anyone who enquired during set-up gets their first reply now.
  await queueWaitingFirstReplies(tx, input.organisationId, input.lettingId);
}

/**
 * UX-AG-4: the agency has just been confirmed, in this transaction, which is scoped to it. Each
 * home a member decided to put live while it waited goes live now, on that member's decision:
 * nobody at Gaff decides anything about a letting (Q13). A home whose set-up was undone while
 * it waited doesn't go live; its hold ends, and the member is back at the go-live step.
 */
export async function releaseHeldLettings(
  tx: Tx,
  organisationId: string,
): Promise<{ live: number; notReady: number }> {
  const held = await tx
    .select({ id: lettings.id, decisionId: lettings.goLiveDecisionId })
    .from(lettings)
    .where(
      and(
        eq(lettings.organisationId, organisationId),
        eq(lettings.stage, 'setup'),
        isNotNull(lettings.goLiveHeldAt),
      ),
    );
  let live = 0;
  let notReady = 0;
  for (const letting of held) {
    const detail = await lettingDetailIn(tx, letting.id);
    if (detail && letting.decisionId && readyToTakeEnquiries(detail.setup)) {
      await goLive(tx, {
        organisationId,
        lettingId: letting.id,
        decisionId: letting.decisionId,
        actor: { type: 'system' },
      });
      live += 1;
    } else {
      await tx.update(lettings).set({ goLiveHeldAt: null }).where(eq(lettings.id, letting.id));
      await recordEvent(tx, {
        organisationId,
        lettingId: letting.id,
        actor: { type: 'system' },
        type: 'letting.go_live_hold_ended',
        data: { reason: 'not_ready' },
      });
      notReady += 1;
    }
  }
  return { live, notReady };
}

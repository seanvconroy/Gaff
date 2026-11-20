import { and, eq, isNotNull } from 'drizzle-orm';
import { goLiveCopy } from '@/copy/go-live';
import { db, type Tx, withOrg } from '@/db/client';
import { lettings, organisations } from '@/db/schema';
import { countCriteria } from '@/domain/criteria/criteria';
import {
  type GoLiveAsks,
  type OnGaffNeed,
  type Portal,
  goLiveAsks,
  goLiveNeeds,
  onGaffNeeds,
  portals,
  readyToTakeEnquiries,
} from '@/domain/lettings/setup';
import type { berRatings } from '@/domain/lettings/new-letting';
import { type GoLiveGate, goLiveGate } from '@/domain/organisations/go-live-gate';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { recordFunnelStep } from '@/server/funnels/steps';
import { setListerPhoneIn } from '@/server/organisations/phone';
import { recordEvent } from '@/server/record/events';
import { queueInstantAlerts } from '@/server/saved/alerts';
import { type LettingDetail, lettingDetailIn } from './queries';
import { assertMayActOn } from '@/server/team/permissions';

const gateColumns = {
  name: organisations.name,
  kind: organisations.kind,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  licenceLapsedAt: organisations.licenceLapsedAt,
  identityVerifiedAt: organisations.identityVerifiedAt,
  phone: organisations.phone,
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

async function hasGoneLiveIn(tx: Tx, organisationId: string): Promise<boolean> {
  const [live] = await tx
    .select({ id: lettings.id })
    .from(lettings)
    .where(and(eq(lettings.organisationId, organisationId), isNotNull(lettings.liveAt)))
    .limit(1);
  return Boolean(live);
}

export interface GoLiveStep {
  gate: GoLiveGate;
  organisationName: string;
  organisationKind: OrganisationKind;
  /** UX-LT-14: what is still missing before the home can go live. Empty: it can. */
  needs: ReturnType<typeof goLiveNeeds>;
  /** UX-LT-22: what the home still needs to be shown on gaff.ie. It never stops go-live. */
  onGaffNeeds: OnGaffNeed[];
  /** Step 9: what the screen asks for, each once. */
  asks: GoLiveAsks;
}

/** Everything the "Ready to go live" screen needs to know that isn't the letting itself. */
export async function goLiveStepFor(member: Member, detail: LettingDetail): Promise<GoLiveStep> {
  return withOrg(member.organisationId, async (tx) => {
    const [organisation] = await tx
      .select(gateColumns)
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    if (!organisation) throw new Error('The organisation is gone');
    const gate = goLiveGate(organisation);
    return {
      gate,
      organisationName: organisation.name,
      organisationKind: organisation.kind,
      needs: goLiveNeeds({ ...detail.letting, rentCheckDone: detail.setup.rentCheckDone, gate }),
      onGaffNeeds: onGaffNeeds({
        berRating: detail.letting.berRating,
        photos: detail.photos.length,
      }),
      asks: goLiveAsks({
        kind: organisation.kind,
        phone: organisation.phone,
        hasGoneLive: await hasGoneLiveIn(tx, member.organisationId),
      }),
    };
  });
}

/** What the go-live screen can send along with the decision. Each is saved first, as its own step. */
export interface GoLiveChoices {
  /** UX-LT-21: "On gaff.ie". Left out: as it is (on, unless it was switched off). */
  onGaff?: boolean;
  /** UX-LT-22: a BER given on this screen, for a home that had none. */
  berRating?: (typeof berRatings)[number];
  /** Q43: a number renters can call, given at the first go-live. */
  phone?: string;
}

/**
 * Stage 1: the operator confirms the home, and Gaff starts answering its enquiries. Going live
 * is a person's decision, recorded as theirs (UX-LT-15; ADR-0007).
 *
 * UX-LT-14: only the rent check and the lister's standing can stop it: a letting has had its
 * address, rent, date, type and bedrooms since it was made. Viewing times, letting details,
 * photos, comparable rents and a phone number never do.
 *
 * UX-AG-4: while an agency is being confirmed, going live is the one thing held. The person's
 * decision is recorded now, as theirs; the home goes live when someone at Gaff confirms the
 * agency (`releaseHeldLettings`). Returns `held` then, and `live` when the home went live.
 */
export async function startTakingEnquiries(
  member: Member,
  lettingId: string,
  choices: GoLiveChoices = {},
): Promise<'live' | 'held'> {
  return withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    let detail = await lettingDetailIn(tx, lettingId);
    if (!detail) throw new UserFacingError('We couldn’t find that letting.');
    if (detail.letting.stage !== 'setup') return 'live';
    if (detail.letting.goLiveHeldAt) return 'held';
    const [organisation] = await tx
      .select(gateColumns)
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const gate = goLiveGate(organisation!);
    const needs = goLiveNeeds({
      ...detail.letting,
      rentCheckDone: detail.setup.rentCheckDone,
      gate,
    });
    if (needs.some((need) => need !== 'lister')) {
      throw new UserFacingError('Finish setting up first: the rent check.');
    }
    if (!gate.open && !gate.waits) {
      throw new UserFacingError(goLiveCopy.held[gate.reason](organisation!.name));
    }

    const actor = { type: 'person', userId: member.userId } as const;
    const changes: Partial<typeof lettings.$inferInsert> = {};
    if (choices.berRating && !detail.letting.berRating) {
      changes.berRating = choices.berRating;
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor,
        type: 'letting.details_changed',
        data: { step: 'home' },
      });
    }
    if (choices.onGaff !== undefined && choices.onGaff !== detail.letting.onGaff) {
      changes.onGaff = choices.onGaff;
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor,
        type: 'letting.on_gaff_set',
        data: { on: choices.onGaff },
      });
    }
    if (Object.keys(changes).length > 0) {
      await tx.update(lettings).set(changes).where(eq(lettings.id, lettingId));
      detail = (await lettingDetailIn(tx, lettingId))!;
    }
    if (choices.phone && !organisation!.phone) await setListerPhoneIn(tx, member, choices.phone);

    const decision = await recordDecision(tx, {
      member,
      kind: 'confirm_setup',
      lettingId,
      basis: {
        criteria: countCriteria(detail.letting.criteria ?? { noPets: false }),
        rentCheck: detail.rentCheck?.result ?? null,
        viewingSlots: detail.setup.viewingSlots,
        comparables: detail.setup.comparables,
        photos: detail.photos.length,
        onGaff: detail.letting.onGaff,
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
        actor,
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
      actor,
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
    .set({
      stage: 'enquiries',
      status: 'live',
      liveAt: new Date(),
      goLiveHeldAt: null,
      setupStep: 'go_live',
    })
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
  // UX-ME: "On Gaff" counts a live letting that is shown, which needs a BER and a photo too.
  const detail = await lettingDetailIn(tx, input.lettingId);
  if (detail && isShownOnGaff(detail)) {
    await recordFunnelStep(tx, { step: 'on_gaff.shown', subjectId: input.lettingId });
  }
  // R7: anyone who enquired during set-up gets their first reply now.
  await queueWaitingFirstReplies(tx, input.organisationId, input.lettingId);
  // M86, M87: saved searches it fits hear within minutes.
  await queueInstantAlerts(tx);
}

/**
 * UX-LT-21, UX-LT-14: whether a home is shown on gaff.ie. THE SEAM for work package WP-20, which
 * builds the public page and search: a home is shown when it is live, "On gaff.ie" is on, and
 * it has a BER and a photo. Nothing else decides it.
 */
export function isShownOnGaff(detail: Pick<LettingDetail, 'letting' | 'photos'>): boolean {
  return (
    detail.letting.status === 'live' &&
    detail.letting.onGaff &&
    onGaffNeeds({ berRating: detail.letting.berRating, photos: detail.photos.length }).length === 0
  );
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

/**
 * UX-LT-21: "On gaff.ie", switched on or off from the go-live step, or later from the home's
 * page. A home that isn't shown still runs on Gaff, taking enquiries from Daft and MyHome.
 */
export async function setOnGaff(member: Member, lettingId: string, on: boolean): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx
      .select({ onGaff: lettings.onGaff })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (letting.onGaff === on) return;
    await tx.update(lettings).set({ onGaff: on }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.on_gaff_set',
      data: { on },
    });
  });
}

/**
 * "Is it advertised anywhere else?", asked once after go-live: Daft, MyHome, or No. The answer
 * is kept on the letting. A home advertised elsewhere needs its enquiries forwarded to Gaff:
 * the forwarding flow (`src/server/enquiries/forwarding.ts`), and `needsForwarding` makes it the
 * home's task until mail comes through.
 */
export async function setAdvertisedOn(
  member: Member,
  lettingId: string,
  on: readonly Portal[],
): Promise<void> {
  const chosen = (Object.keys(portals) as Portal[]).filter((portal) => on.includes(portal));
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const updated = await tx
      .update(lettings)
      .set({ advertisedOn: chosen })
      .where(eq(lettings.id, lettingId))
      .returning({ id: lettings.id });
    if (updated.length === 0) throw new UserFacingError('We couldn’t find that letting.');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.advertised_set',
      data: { daft: chosen.includes('daft'), myhome: chosen.includes('myhome') },
    });
  });
}

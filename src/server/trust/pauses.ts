import { and, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg, withSystem } from '@/db/client';
import { lettings, listerPauses, listingCases, organisations } from '@/db/schema';
import { reportDeleteAfter, reportReasons, type ReportReason } from '@/domain/homes/report';
import { canDecideAppeal, caseDueBy, caseFacts, type CaseFact } from '@/domain/trust/cases';
import type { Member } from '@/server/auth/member';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/**
 * BA-10 (the live line's M107, M98; Q53): a person on Gaff's team may pause a lister's listings
 * after a case about one of their homes was decided against it, with a statement of reasons
 * from the fixed lists. While it's paused, `goLiveGate` is closed for the lister: none of its
 * homes is on gaff.ie and no new one goes live. Its live lettings carry on with the renters
 * already in them: nothing here touches a renter, an enquiry, a message or a decision about
 * anyone. The lister may ask Gaff to look again, once; someone other than the person who paused
 * decides. A person on Gaff's team may lift a pause at any time.
 *
 * The pause is Gaff's own record (`lister_pauses`), reached only as the system; the lister's
 * side is `organisations.listings_paused_at`. Events hold IDs and codes. Suspending an account
 * outright is not built.
 */

export const pauseSchema = z.object({
  caseId: z.uuid(),
  reason: z.enum(reportReasons, { error: 'Choose why the listings are paused' }),
  facts: z
    .array(z.enum(caseFacts))
    .min(1, 'Choose what the decision relies on')
    .transform((facts) => caseFacts.filter((fact) => facts.includes(fact))),
});

/** M107: pauses a lister's listings, after a decision to keep one of their homes off gaff.ie. */
export async function pauseListings(
  staff: Staff,
  input: unknown,
  now: Date = new Date(),
): Promise<{ pauseId: string }> {
  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError('Choose a reason and what it relies on.');
  const { caseId, reason, facts } = parsed.data;
  return withSystem(async (tx) => {
    const [decided] = await tx
      .select({ decision: listingCases.decision, organisationId: lettings.organisationId })
      .from(listingCases)
      .innerJoin(lettings, eq(lettings.id, listingCases.lettingId))
      .where(eq(listingCases.id, caseId));
    // Only after a person decided a case against one of the lister's homes.
    if (decided?.decision !== 'hide_listing') {
      throw new UserFacingError('A lister’s listings can be paused only after a decided case.');
    }
    const [organisation] = await tx
      .select({ pausedAt: organisations.listingsPausedAt })
      .from(organisations)
      .where(eq(organisations.id, decided.organisationId))
      .for('update');
    if (organisation?.pausedAt) throw new UserFacingError('That lister’s listings are paused.');
    const [pause] = await tx
      .insert(listerPauses)
      .values({
        organisationId: decided.organisationId,
        caseId,
        reason,
        facts,
        pausedAt: now,
        pausedBy: staff.userId,
        deleteAfter: reportDeleteAfter(now),
      })
      .returning({ id: listerPauses.id });
    await tx
      .update(organisations)
      .set({ listingsPausedAt: now })
      .where(eq(organisations.id, decided.organisationId));
    await recordEvent(tx, {
      organisationId: decided.organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'organisation.listings_paused',
      subject: { type: 'lister_pause', id: pause!.id },
      data: { pauseId: pause!.id, caseId, reason, facts },
      occurredAt: now,
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'listings_paused',
      organisationId: decided.organisationId,
      pauseId: pause!.id,
    });
    return { pauseId: pause!.id };
  });
}

/** Ends a pause: lifted by a person, or on appeal. Its record is kept six months from now. */
async function endPause(
  tx: Parameters<Parameters<typeof withSystem>[0]>[0],
  pause: { id: string; organisationId: string },
  staff: Staff,
  how: 'lifted' | 'appeal',
  now: Date,
): Promise<void> {
  await tx
    .update(listerPauses)
    .set({ endedAt: now, endedBy: staff.userId, deleteAfter: reportDeleteAfter(now) })
    .where(eq(listerPauses.id, pause.id));
  await tx
    .update(organisations)
    .set({ listingsPausedAt: null })
    .where(eq(organisations.id, pause.organisationId));
  await recordEvent(tx, {
    organisationId: pause.organisationId,
    actor: { type: 'staff', userId: staff.userId },
    type: 'organisation.listings_unpaused',
    subject: { type: 'lister_pause', id: pause.id },
    data: { pauseId: pause.id, how },
    occurredAt: now,
  });
  await enqueue(tx, 'send_account_email', {
    kind: 'pause_lifted',
    organisationId: pause.organisationId,
    pauseId: pause.id,
  });
}

async function openPause(tx: Parameters<Parameters<typeof withSystem>[0]>[0], pauseId: string) {
  const [pause] = await tx
    .select()
    .from(listerPauses)
    .where(and(eq(listerPauses.id, pauseId), isNull(listerPauses.endedAt)))
    .for('update');
  if (!pause) throw new UserFacingError('That pause has ended already.');
  return pause;
}

/** M107: a person on Gaff's team lifts a pause. */
export async function liftPause(
  staff: Staff,
  pauseId: string,
  now: Date = new Date(),
): Promise<void> {
  if (!z.uuid().safeParse(pauseId).success) throw new UserFacingError('That pause isn’t there.');
  await withSystem(async (tx) => {
    const pause = await openPause(tx, pauseId);
    await endPause(tx, pause, staff, 'lifted', now);
  });
}

/**
 * M98: the answer to a lister's appeal, by someone other than the person who paused: lift it
 * (`no_action`), or keep it (`hide_listing`), with the same statement. Either way it's final.
 */
export async function decidePauseAppeal(
  staff: Staff,
  pauseId: string,
  decision: 'no_action' | 'hide_listing',
  now: Date = new Date(),
): Promise<void> {
  if (!z.uuid().safeParse(pauseId).success) throw new UserFacingError('That pause isn’t there.');
  await withSystem(async (tx) => {
    const pause = await openPause(tx, pauseId);
    if (!pause.appealAskedAt || pause.appealDecision) {
      throw new UserFacingError('Nobody has asked Gaff to look again at that pause.');
    }
    if (!canDecideAppeal(staff.userId, pause.pausedBy)) {
      throw new UserFacingError(
        'Someone else on Gaff’s team must decide this: you made the first decision.',
      );
    }
    await tx
      .update(listerPauses)
      .set({ appealDecision: decision, appealDecidedAt: now, appealDecidedBy: staff.userId })
      .where(eq(listerPauses.id, pause.id));
    await recordEvent(tx, {
      organisationId: pause.organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'organisation.pause_appeal_decided',
      subject: { type: 'lister_pause', id: pause.id },
      data: { pauseId: pause.id, decision },
      occurredAt: now,
    });
    if (decision === 'no_action') {
      await endPause(tx, pause, staff, 'appeal', now);
    } else {
      await enqueue(tx, 'send_account_email', {
        kind: 'pause_kept',
        organisationId: pause.organisationId,
        pauseId: pause.id,
      });
    }
  });
}

/** A pause, as its lister reads it: the statement of reasons, and where the appeal stands. */
export interface PauseRead {
  pausedAt: Date;
  reason: ReportReason;
  facts: CaseFact[];
  appeal: 'none' | 'asked' | 'kept';
}

/** The lister's own pause, if their listings are paused. */
export async function pauseFor(member: Member): Promise<PauseRead | null> {
  const [organisation] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ pausedAt: organisations.listingsPausedAt })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId)),
  );
  if (!organisation?.pausedAt) return null;
  // Theirs, so the statement of reasons they were sent can be read back to them.
  const [pause] = await withSystem((tx) =>
    tx
      .select()
      .from(listerPauses)
      .where(
        and(eq(listerPauses.organisationId, member.organisationId), isNull(listerPauses.endedAt)),
      )
      .orderBy(desc(listerPauses.pausedAt))
      .limit(1),
  );
  if (!pause) return null;
  return {
    pausedAt: pause.pausedAt,
    reason: pause.reason,
    facts: pause.facts,
    appeal: pause.appealDecision ? 'kept' : pause.appealAskedAt ? 'asked' : 'none',
  };
}

/** M98: "Ask Gaff to look again" at a pause, once. Due within one working day. */
export async function askToLookAgainAtPause(
  member: Member,
  now: Date = new Date(),
): Promise<{ asked: boolean }> {
  return withSystem(async (tx) => {
    const [pause] = await tx
      .select()
      .from(listerPauses)
      .where(
        and(eq(listerPauses.organisationId, member.organisationId), isNull(listerPauses.endedAt)),
      )
      .orderBy(desc(listerPauses.pausedAt))
      .limit(1)
      .for('update');
    if (!pause || pause.appealAskedAt) return { asked: false };
    await tx
      .update(listerPauses)
      .set({ appealAskedAt: now, appealDueBy: caseDueBy(['appeal'], now) })
      .where(eq(listerPauses.id, pause.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'organisation.pause_appeal_asked',
      subject: { type: 'lister_pause', id: pause.id },
      data: { pauseId: pause.id },
      occurredAt: now,
    });
    return { asked: true };
  });
}

/** A pause, as Gaff's team read it on the internal page. The lister's name, codes and dates. */
export interface PauseForStaff {
  id: string;
  listerName: string;
  reason: ReportReason;
  facts: CaseFact[];
  pausedAt: Date;
  appealAskedAt: Date | null;
  appealDueBy: Date | null;
  appealDecided: boolean;
  /** M98: false where this person paused it: someone else decides the appeal. */
  mayDecideAppeal: boolean;
}

/** M107: the pauses in force, appeals due soonest first. */
export async function pausesFor(staff: Staff): Promise<PauseForStaff[]> {
  const rows = await withSystem((tx) =>
    tx
      .select({
        id: listerPauses.id,
        listerName: organisations.name,
        reason: listerPauses.reason,
        facts: listerPauses.facts,
        pausedAt: listerPauses.pausedAt,
        pausedBy: listerPauses.pausedBy,
        appealAskedAt: listerPauses.appealAskedAt,
        appealDueBy: listerPauses.appealDueBy,
        appealDecision: listerPauses.appealDecision,
      })
      .from(listerPauses)
      .innerJoin(organisations, eq(organisations.id, listerPauses.organisationId))
      .where(isNull(listerPauses.endedAt))
      .orderBy(listerPauses.appealDueBy, desc(listerPauses.pausedAt)),
  );
  return rows.map(({ pausedBy, appealDecision, ...row }) => ({
    ...row,
    appealDecided: appealDecision !== null,
    mayDecideAppeal: canDecideAppeal(staff.userId, pausedBy),
  }));
}

/** Rule 9: an ended pause is deleted six months after it ended. Counts only. */
export async function purgeListerPauses(now: Date = new Date()): Promise<number> {
  return withSystem(async (tx) => {
    const gone = await tx
      .delete(listerPauses)
      .where(and(isNotNull(listerPauses.endedAt), lte(listerPauses.deleteAfter, now)))
      .returning({ id: listerPauses.id });
    return gone.length;
  });
}

import { and, desc, eq, isNull } from 'drizzle-orm';
import { withOrg, withSystem } from '@/db/client';
import { lettings, listingCases } from '@/db/schema';
import { reportDeleteAfter, type ReportReason } from '@/domain/homes/report';
import { caseDueBy, type CaseFact, type HiddenStage } from '@/domain/trust/cases';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * UX-TS-4, BA-9: a hidden home as its lister sees it: why, since when, where it stands, and the
 * facts the decision relied on (the statement of reasons they were emailed).
 */
export interface HiddenHome {
  lettingId: string;
  address: string;
  reason: ReportReason;
  hiddenAt: Date;
  stage: HiddenStage;
  lookAgainAskedAt: Date | null;
  facts: CaseFact[];
}

const isId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

/** The latest decision to hide this listing that hasn't been appealed: what may be appealed. */
async function appealableCase(lettingId: string) {
  return withSystem(async (tx) => {
    const [decided] = await tx
      .select({
        id: listingCases.id,
        reasons: listingCases.reasons,
        facts: listingCases.decisionFacts,
      })
      .from(listingCases)
      .where(
        and(
          eq(listingCases.lettingId, lettingId),
          eq(listingCases.kind, 'report'),
          eq(listingCases.decision, 'hide_listing'),
        ),
      )
      .orderBy(desc(listingCases.decidedAt))
      .limit(1);
    return decided ?? null;
  });
}

/** The lister's own hidden home, or null if it isn't hidden (or isn't theirs). */
export async function hiddenHomeFor(member: Member, lettingId: string): Promise<HiddenHome | null> {
  if (!isId(lettingId)) return null;
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        lettingId: lettings.id,
        address: lettings.addressLine1,
        reason: lettings.hiddenReason,
        hiddenAt: lettings.hiddenAt,
        stage: lettings.hiddenStage,
        lookAgainAskedAt: lettings.lookAgainAskedAt,
      })
      .from(lettings)
      .where(eq(lettings.id, lettingId)),
  );
  if (!row?.hiddenAt) return null;
  // Theirs, so the statement of reasons they were sent can be read back to them.
  const decided = row.stage === 'held' ? null : await appealableCase(lettingId);
  return {
    ...row,
    hiddenAt: row.hiddenAt,
    reason: row.reason ?? 'something_else',
    stage: row.stage ?? 'decided',
    facts: decided?.facts ?? [],
  };
}

/**
 * UX-TS-4, BA-9 (M98): "Ask Gaff to look again": the lister appeals a person's decision to hide
 * their home, once. It opens an appeal case, due within one working day, which someone other
 * than the person who decided must decide; the home's Needs you says Gaff is looking. Asking
 * again, or about a home the rules took off for a person to check, changes nothing.
 *
 * The case is Gaff's own record, so it's written as the system, on the lister's behalf, and
 * only for a home in their own organisation. They never read the reports behind it.
 */
export async function askToLookAgain(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<{ asked: boolean }> {
  if (!isId(lettingId)) throw new UserFacingError('We couldn’t find that letting.');
  return withSystem(async (tx) => {
    const [letting] = await tx
      .select({ hiddenStage: lettings.hiddenStage })
      .from(lettings)
      .where(and(eq(lettings.id, lettingId), eq(lettings.organisationId, member.organisationId)))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (letting.hiddenStage !== 'decided') return { asked: false };
    const [decided] = await tx
      .select({ id: listingCases.id, reasons: listingCases.reasons })
      .from(listingCases)
      .where(
        and(
          eq(listingCases.lettingId, lettingId),
          eq(listingCases.kind, 'report'),
          eq(listingCases.decision, 'hide_listing'),
        ),
      )
      .orderBy(desc(listingCases.decidedAt))
      .limit(1);
    // Its case has gone with time (six months): there's nothing left to look again at.
    if (!decided) return { asked: false };
    const [already] = await tx
      .select({ id: listingCases.id })
      .from(listingCases)
      .where(and(eq(listingCases.appealOf, decided.id), isNull(listingCases.decidedBy)))
      .limit(1);
    if (already) return { asked: false };
    const [appeal] = await tx
      .insert(listingCases)
      .values({
        lettingId,
        kind: 'appeal',
        reasons: decided.reasons,
        openedAt: now,
        dueBy: caseDueBy(['appeal'], now),
        appealOf: decided.id,
        deleteAfter: reportDeleteAfter(now),
      })
      .returning({ id: listingCases.id });
    await tx
      .update(lettings)
      .set({ lookAgainAskedAt: now, hiddenStage: 'appealed' })
      .where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'listing.look_again_asked',
      subject: { type: 'listing_case', id: appeal!.id },
      data: { caseId: appeal!.id },
      occurredAt: now,
    });
    return { asked: true };
  });
}

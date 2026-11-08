import { and, asc, eq, isNull } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { listingRemovedEmail, REMOVAL_STATEMENT, type removalReasonWords } from '@/copy/listings';
import { db, scopeToOrg, withStaff } from '@/db/client';
import {
  listingHolds,
  listings,
  memberships,
  moderationActions,
  organisations,
  users,
} from '@/db/schema';
import { listingTitle } from '@/domain/listings/projection';
import { decisionGrounds } from '@/domain/moderation/reports';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { loadListing } from './context';
import { goLive, moveListing } from './publish';

export interface HeldListing {
  holdId: string;
  organisationId: string;
  organisationName: string;
  lettingId: string;
  title: string;
  description: string;
  rentCents: number;
  reasons: string[];
  /** ADR-0023: what the AI flagged, for an unfair-wording hold. */
  wordingFindings: Array<{ phrase: string; ground: string; why: string; rewording: string }>;
  openedAt: Date;
}

/**
 * M29, M97: listings held for a person at Gaff, oldest first. Staff read each listing inside its
 * own organisation's scope, and only the listing: never applications or renters.
 */
export async function heldListings(staff: Staff): Promise<HeldListing[]> {
  return withStaff(staff.userId, async (tx) => {
    const holds = await tx
      .select({
        holdId: listingHolds.id,
        organisationId: listingHolds.organisationId,
        listingId: listingHolds.listingId,
        reasons: listingHolds.reasons,
        wordingFindings: listingHolds.wordingFindings,
        openedAt: listingHolds.openedAt,
        organisationName: organisations.name,
      })
      .from(listingHolds)
      .innerJoin(organisations, eq(organisations.id, listingHolds.organisationId))
      .where(isNull(listingHolds.resolvedAt))
      .orderBy(asc(listingHolds.openedAt));
    const out: HeldListing[] = [];
    for (const hold of holds) {
      await scopeToOrg(tx, hold.organisationId);
      const [row] = await tx
        .select({ lettingId: listings.lettingId })
        .from(listings)
        .where(eq(listings.id, hold.listingId));
      const context = row ? await loadListing(tx, row.lettingId) : null;
      if (!context) continue;
      out.push({
        holdId: hold.holdId,
        organisationId: hold.organisationId,
        organisationName: hold.organisationName,
        lettingId: context.letting.id,
        title: listingTitle(context.home),
        description: context.listing.description ?? '',
        rentCents: context.letting.monthlyRentCents,
        reasons: hold.reasons,
        wordingFindings: hold.wordingFindings ?? [],
        openedAt: hold.openedAt,
      });
    }
    return out;
  });
}

/** M98: a person at Gaff decides. Releasing puts the listing live; removing withdraws it. */
export async function resolveHold(
  staff: Staff,
  holdId: string,
  decision:
    { outcome: 'released' } | { outcome: 'removed'; reason: keyof typeof removalReasonWords },
  now = new Date(),
): Promise<void> {
  const removed = await withStaff(staff.userId, async (tx) => {
    const [hold] = await tx
      .update(listingHolds)
      .set({ resolvedAt: now, resolvedBy: staff.userId, outcome: decision.outcome })
      .where(and(eq(listingHolds.id, holdId), isNull(listingHolds.resolvedAt)))
      .returning();
    if (!hold) throw new UserFacingError('Someone has already decided that listing');
    await scopeToOrg(tx, hold.organisationId);
    const [row] = await tx
      .select({ lettingId: listings.lettingId })
      .from(listings)
      .where(eq(listings.id, hold.listingId));
    const context = (await loadListing(tx, row!.lettingId))!;
    if (decision.outcome === 'released') {
      await goLive(tx, context, {
        assignedTo: context.listing.assignedTo ?? context.listing.createdBy,
        by: null,
        now,
      });
    } else {
      await moveListing(tx, context, 'withdrawn', 'review', null, now);
    }
    await recordEvent(tx, {
      organisationId: hold.organisationId,
      lettingId: context.letting.id,
      actor: { type: 'staff', userId: staff.userId },
      type: 'listing.hold_resolved',
      subject: { type: 'listing', id: hold.listingId },
      data:
        decision.outcome === 'released'
          ? { listingId: hold.listingId, outcome: 'released' }
          : { listingId: hold.listingId, outcome: 'removed', reason: decision.reason },
    });
    // M106: the audit trail, with the ground for a removal (M98).
    await tx.insert(moderationActions).values({
      listingId: hold.listingId,
      subjectOrganisationId: hold.organisationId,
      action: decision.outcome === 'released' ? 'restore_listing' : 'remove_listing',
      reason: decision.outcome === 'released' ? 'hold_released' : decision.reason,
      ground: decision.outcome === 'released' ? null : decisionGrounds[decision.reason].ground,
      statementTemplate: decision.outcome === 'released' ? null : REMOVAL_STATEMENT,
      decidedBy: staff.userId,
    });
    return decision.outcome === 'removed'
      ? {
          organisationId: hold.organisationId,
          assignedTo: context.listing.assignedTo,
          address: context.home.addressLine1,
          listingId: hold.listingId,
        }
      : null;
  });
  if (removed && decision.outcome === 'removed') {
    const people = await db()
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organisationId, removed.organisationId),
          removed.assignedTo
            ? eq(memberships.userId, removed.assignedTo)
            : eq(memberships.role, 'admin'),
        ),
      );
    for (const person of people) {
      await emailSender().send({
        to: person.email,
        from: gaffSender(),
        ...listingRemovedEmail({
          address: removed.address,
          reason: decision.reason,
          source: decisionGrounds[decision.reason].source,
          decidedOn: formatDate(now),
          appealUrl: `${env().APP_URL}/listings/appeal/${removed.listingId}`,
        }),
      });
    }
  }
}

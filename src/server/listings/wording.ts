import { and, eq, isNull } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { listingHeldForWordingEmail } from '@/copy/listings';
import { withOrg } from '@/db/client';
import { listingHolds, memberships, users } from '@/db/schema';
import { listingTitle } from '@/domain/listings/projection';
import { loadListing } from './context';
import { moveListing } from './publish';
import { unfairWording } from './wording-check';
import { recordWordingEvents } from './wording-events';

/**
 * P12: when the words of a live listing change, the check runs straight after the edit. A
 * finding takes the listing off the public pages and holds it for a person at Gaff, who
 * releases or removes it (M97). The letter is told what was flagged and why.
 */
export async function checkLiveListingWording(job: {
  organisationId: string;
  lettingId: string;
}): Promise<'held' | 'clear' | 'skipped'> {
  const context = await withOrg(job.organisationId, (tx) => loadListing(tx, job.lettingId));
  if (!context || context.listing.status !== 'live') return 'skipped';
  const findings = await unfairWording(job.organisationId, context.listing.description ?? '');
  if (!findings || findings.length === 0) return 'clear';
  const held = await withOrg(job.organisationId, async (tx) => {
    const fresh = await loadListing(tx, job.lettingId);
    // The words may have changed again, or the listing moved on, while the check ran.
    if (!fresh || fresh.listing.status !== 'live') return null;
    if (fresh.listing.description !== context.listing.description) return null;
    const [open] = await tx
      .select({ id: listingHolds.id })
      .from(listingHolds)
      .where(and(eq(listingHolds.listingId, fresh.listing.id), isNull(listingHolds.resolvedAt)));
    if (open) return null;
    await moveListing(tx, fresh, 'in_review', 'review', null);
    await tx.insert(listingHolds).values({
      organisationId: job.organisationId,
      listingId: fresh.listing.id,
      reasons: ['unfair_wording'],
      wordingFindings: findings,
    });
    await recordWordingEvents(tx, fresh, findings);
    const [agent] = await tx
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organisationId, job.organisationId),
          eq(memberships.userId, fresh.listing.assignedTo ?? ''),
        ),
      );
    return { title: listingTitle(fresh.home), email: agent?.email ?? null };
  });
  if (!held) return 'skipped';
  if (held.email) {
    await emailSender().send({
      to: held.email,
      from: gaffSender(),
      ...listingHeldForWordingEmail({ title: held.title, findings }),
    });
  }
  return 'held';
}

/** P13: what the AI flagged on a listing waiting for a person at Gaff, for the letter's page. */
export async function openWordingFindings(organisationId: string, listingId: string) {
  const [hold] = await withOrg(organisationId, (tx) =>
    tx
      .select({ findings: listingHolds.wordingFindings, reasons: listingHolds.reasons })
      .from(listingHolds)
      .where(and(eq(listingHolds.listingId, listingId), isNull(listingHolds.resolvedAt))),
  );
  return hold?.reasons.includes('unfair_wording') ? (hold.findings ?? []) : [];
}

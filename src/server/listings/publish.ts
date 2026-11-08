import { eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { declarations, listingHolds, listings, organisations } from '@/db/schema';
import { assertMove, type ListingStatus } from '@/domain/listings/lifecycle';
import { listingTitle, listingSlug } from '@/domain/listings/projection';
import {
  DECLARATION,
  publishProblems,
  type PublishProblem,
} from '@/domain/listings/publish-checks';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { letterReadiness } from '@/server/verification/readiness';
import { loadListing, readyPhotos, type ListingContext } from './context';
import { removePublicListing, saveRevision, writePublicListing } from './project';
import { riskSignals, type RiskReason } from './risk';
import { recordWordingEvents } from './wording-events';
import { unfairWording } from './wording-check';

export type PublishResult =
  | { outcome: 'live'; slug: string }
  | { outcome: 'held'; reasons: RiskReason[] }
  | { outcome: 'problems'; problems: PublishProblem[] };

function readyPhotoCount(context: ListingContext): number {
  // M33: a home in a development can use the development's photos.
  return readyPhotos(context).filter((p) => p.kind === 'photo').length;
}

/** What still stops this listing going live (M48), for the editor's checklist. */
export function problemsFor(
  context: ListingContext,
  missingChecks: Parameters<typeof publishProblems>[0]['missingChecks'],
  declaring = false,
): PublishProblem[] {
  const { letting, home, listing } = context;
  return publishProblems({
    lettingStatus: letting.status,
    rentCents: letting.monthlyRentCents,
    depositCents: letting.depositCents,
    criteriaSet: letting.criteria !== null,
    home,
    photosReady: readyPhotoCount(context),
    description: listing.description,
    missingChecks,
    declared: context.declared || declaring,
  });
}

/**
 * M48: publishes a listing. Every check runs first; a listing with problems stays as it is.
 * Risk signals (M29) hold it for a person at Gaff. Otherwise it goes live at once, with its
 * public copy, a revision and an event, in one transaction.
 */
export async function publishListing(
  member: Member,
  lettingId: string,
  options: { declare: boolean },
  now = new Date(),
): Promise<PublishResult> {
  const readiness = await letterReadiness(member);
  const context = await withOrg(member.organisationId, (tx) => loadListing(tx, lettingId));
  if (!context) throw new UserFacingError('We couldn’t find that listing.');
  if (!['draft', 'in_review'].includes(context.listing.status)) {
    throw new UserFacingError('This listing is already published.');
  }
  const problems = problemsFor(context, readiness.missing, options.declare);
  if (problems.length > 0) return { outcome: 'problems', problems };

  const reasons = await riskSignals(context, now);
  // ADR-0023, P12: the AI's wording check, after the word list. Null means it couldn't run.
  const wording = await unfairWording(member.organisationId, context.listing.description ?? '');
  if (wording && wording.length > 0) reasons.push('unfair_wording');
  return withOrg(member.organisationId, async (tx) => {
    const fresh = (await loadListing(tx, lettingId))!;
    if (!fresh.declared) await declare(tx, member, fresh);
    const assignedTo = fresh.listing.assignedTo ?? member.userId;

    if (reasons.length > 0) {
      await moveListing(tx, fresh, 'in_review', 'review', member.userId);
      await tx.update(listings).set({ assignedTo }).where(eq(listings.id, fresh.listing.id));
      await tx.insert(listingHolds).values({
        organisationId: member.organisationId,
        listingId: fresh.listing.id,
        reasons,
        wordingFindings: wording && wording.length > 0 ? wording : null,
      });
      if (wording && wording.length > 0) await recordWordingEvents(tx, fresh, wording, reasons);
      else {
        await recordEvent(tx, {
          organisationId: member.organisationId,
          lettingId,
          actor: { type: 'system' },
          type: 'listing.held',
          subject: { type: 'listing', id: fresh.listing.id },
          data: { listingId: fresh.listing.id, reasons },
        });
      }
      return { outcome: 'held', reasons };
    }

    const slug = await goLive(tx, fresh, { assignedTo, by: member.userId, now });
    return { outcome: 'live', slug };
  });
}

/** M107: while a person at Gaff has paused or suspended an account, none of its homes go live. */
async function assertAccountActive(tx: Tx, organisationId: string): Promise<void> {
  const [organisation] = await tx
    .select({ status: organisations.marketplaceStatus })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  if (organisation && organisation.status !== 'active') {
    throw new UserFacingError(
      'Gaff has paused your account’s listings while a person looks into a report. We’ve emailed you the reasons and how to appeal.',
    );
  }
}

/** Puts a checked listing live: slug, dates, public copy, revision and event. */
export async function goLive(
  tx: Tx,
  context: ListingContext,
  options: { assignedTo: string; by: string | null; now: Date },
): Promise<string> {
  const { listing, home } = context;
  const slug = listing.slug ?? listingSlug(listingTitle(home), listing.id);
  assertMove(listing.status, 'live');
  await assertAccountActive(tx, listing.organisationId);
  const [updated] = await tx
    .update(listings)
    .set({
      status: 'live',
      slug,
      assignedTo: options.assignedTo,
      publishedAt: listing.publishedAt ?? options.now,
      confirmedAt: options.now,
      reminderSentAt: null,
      pausedAt: null,
      pauseReason: null,
    })
    .where(eq(listings.id, listing.id))
    .returning();
  const live = { ...context, listing: updated! };
  const published = await writePublicListing(tx, live, 'live', options.now);
  const revision = await saveRevision(tx, live, published, options.by);
  await recordEvent(tx, {
    organisationId: listing.organisationId,
    lettingId: context.letting.id,
    actor: options.by ? { type: 'person', userId: options.by } : { type: 'system' },
    type: 'listing.published',
    subject: { type: 'listing', id: listing.id },
    data: { listingId: listing.id, revision },
  });
  return slug;
}

async function declare(tx: Tx, member: Member, context: ListingContext): Promise<void> {
  await tx.insert(declarations).values({
    organisationId: member.organisationId,
    homeId: context.home.id,
    declaredBy: member.userId,
    wordingVersion: DECLARATION.version,
  });
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId: context.letting.id,
    actor: { type: 'person', userId: member.userId },
    type: 'listing.declared',
    subject: { type: 'home', id: context.home.id },
    data: { homeId: context.home.id, wordingVersion: DECLARATION.version },
  });
}

/** Moves a listing to another status, keeping its public copy in step, and logs why. */
export async function moveListing(
  tx: Tx,
  context: ListingContext,
  to: ListingStatus,
  because: 'letter' | 'letting' | 'freshness' | 'review' | 'enquiry_limit',
  by: string | null,
  now = new Date(),
): Promise<void> {
  const from = context.listing.status;
  if (from === to) return;
  assertMove(from, to);
  if (to === 'live') await assertAccountActive(tx, context.listing.organisationId);
  const closing = to === 'let' || to === 'withdrawn';
  const [updated] = await tx
    .update(listings)
    .set({
      status: to,
      ...(to === 'paused'
        ? {
            pausedAt: now,
            pauseReason:
              because === 'freshness' ? 'freshness' : because === 'review' ? 'review' : 'letter',
          }
        : {}),
      ...(closing ? { closedAt: now } : {}),
    })
    .where(eq(listings.id, context.listing.id))
    .returning();
  const moved = { ...context, listing: updated! };
  if (to === 'paused' || to === 'in_review' || to === 'draft') {
    await removePublicListing(tx, context.listing.id);
  } else if (moved.listing.slug && moved.listing.publishedAt) {
    await writePublicListing(
      tx,
      moved,
      to as Exclude<ListingStatus, 'draft' | 'in_review' | 'paused'>,
      now,
    );
  }
  await recordEvent(tx, {
    organisationId: context.listing.organisationId,
    lettingId: context.letting.id,
    actor: by ? { type: 'person', userId: by } : { type: 'system' },
    type: 'listing.status_changed',
    subject: { type: 'listing', id: context.listing.id },
    data: { listingId: context.listing.id, from, to, because },
  });
}

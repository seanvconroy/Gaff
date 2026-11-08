import { and, asc, eq } from 'drizzle-orm';
import { objectStorage } from '@/adapters/storage';
import { withOrg, type Tx } from '@/db/client';
import { homes, lettings, listings, media } from '@/db/schema';
import {
  descriptionSchema,
  homeDetailsSchema,
  lettingDetailsSchema,
} from '@/domain/listings/details';
import { isPublic } from '@/domain/listings/lifecycle';
import { mediaKeys } from '@/domain/media/photos';
import { blockingFindings, checkListingText } from '@/domain/moderation/listing-text';
import { approximateLocation } from '@/domain/places/locate';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';
import { loadListing, type ListingContext } from './context';
import { saveRevision, writePublicListing } from './project';

type Saved = { ok: true } | { ok: false; errors: Record<string, string> };

function errorsOf(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

async function context(tx: Tx, lettingId: string): Promise<ListingContext> {
  const found = await loadListing(tx, lettingId);
  if (!found) throw new UserFacingError('We couldn’t find that listing.');
  return found;
}

/**
 * M51: an edit to a published listing goes live at once, with a new revision. Called inside
 * the edit's own transaction, after the change.
 */
export async function republishIfPublic(tx: Tx, lettingId: string, by: string | null) {
  const fresh = await loadListing(tx, lettingId);
  if (!fresh) return;
  const status = fresh.listing.status;
  if (!isPublic(status) || status === 'let' || status === 'withdrawn') return;
  const published = await writePublicListing(tx, fresh, status);
  const revision = await saveRevision(tx, fresh, published, by);
  await recordEvent(tx, {
    organisationId: fresh.listing.organisationId,
    lettingId,
    actor: by ? { type: 'person', userId: by } : { type: 'system' },
    type: 'listing.edited',
    subject: { type: 'listing', id: fresh.listing.id },
    data: { listingId: fresh.listing.id, revision },
  });
}

/** M38 to M40: the facts about the home itself. */
export async function saveHomeDetails(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
): Promise<Saved> {
  const parsed = homeDetailsSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error.issues) };
  const details = parsed.data;
  await withOrg(member.organisationId, async (tx) => {
    const { home } = await context(tx, lettingId);
    // M38: until the letter places a pin (milestone 4), the area gives an approximate point.
    const located =
      home.latitude === null || home.longitude === null ? approximateLocation(home).point : null;
    await tx
      .update(homes)
      .set({
        showExactAddress: details.showExactAddress === 'yes',
        heating: details.heating,
        outdoorSpace: details.outdoorSpace,
        floorAreaSqm: details.floorAreaSqm,
        floor: details.floor,
        hasLift: details.hasLift,
        ensuites: details.ensuites,
        accessibility: details.accessibility,
        appliances: details.appliances,
        broadband: details.broadband,
        berNumber: details.berNumber,
        berCertificateDate: details.berCertificateDate,
        ...(located ? { latitude: located.lat, longitude: located.lng } : {}),
      })
      .where(eq(homes.id, home.id));
    await republishIfPublic(tx, lettingId, member.userId);
  });
  return { ok: true };
}

/** M39, M44, M52: the deposit, a tour link and when enquiries close. */
export async function saveLettingDetails(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
  now = new Date(),
): Promise<Saved> {
  return withOrg(member.organisationId, async (tx) => {
    const { letting, listing } = await context(tx, lettingId);
    const parsed = lettingDetailsSchema(letting.monthlyRentCents, now).safeParse(values);
    if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error.issues) };
    const details = parsed.data;
    await tx
      .update(lettings)
      .set({
        depositCents: details.deposit,
        enquiryLimit: details.enquiryLimit,
        enquiriesCloseAt: details.enquiriesCloseAt,
      })
      .where(eq(lettings.id, letting.id));
    await tx.update(listings).set({ tourUrl: details.tourUrl }).where(eq(listings.id, listing.id));
    if (details.enquiriesCloseAt) {
      await enqueue(
        tx,
        'close_enquiries',
        { organisationId: member.organisationId, lettingId },
        { runAt: details.enquiriesCloseAt, jobKey: `close_enquiries:${lettingId}` },
      );
    }
    await republishIfPublic(tx, lettingId, member.userId);
    return { ok: true } as const;
  });
}

/**
 * M45, M46: the description. Protected-ground wording and contact details are shown straight
 * away; a draft can be saved with them, but a published listing can't take them.
 */
export async function saveDescription(
  member: Member,
  lettingId: string,
  text: string,
  /** P11: the AI's draft, if the letter started from one: unchanged, it stays marked as drafted. */
  drafted?: string,
): Promise<Saved> {
  const parsed = descriptionSchema.safeParse(text);
  if (!parsed.success)
    return { ok: false, errors: { description: parsed.error.issues[0]!.message } };
  const blocking = blockingFindings(checkListingText(parsed.data));
  return withOrg(member.organisationId, async (tx) => {
    const { listing } = await context(tx, lettingId);
    if (blocking.length > 0 && isPublic(listing.status)) {
      return { ok: false, errors: { description: blocking[0]!.message } } as const;
    }
    const source = drafted !== undefined && drafted.trim() === parsed.data ? 'ai_draft' : 'letter';
    const changed = (listing.description ?? '') !== parsed.data;
    await tx
      .update(listings)
      .set({ description: parsed.data, descriptionSource: source })
      .where(eq(listings.id, listing.id));
    await republishIfPublic(tx, lettingId, member.userId);
    // P12: new words on a live listing get the AI's wording check straight after the save.
    if (changed && listing.status === 'live' && parsed.data.length > 0) {
      await enqueue(tx, 'check_listing_wording', {
        organisationId: member.organisationId,
        lettingId,
      });
    }
    if (blocking.length > 0)
      return { ok: false, errors: { description: blocking[0]!.message } } as const;
    return { ok: true } as const;
  });
}

/** M43: moves a photo one place earlier or later; the first photo is the cover. */
export async function movePhoto(
  member: Member,
  lettingId: string,
  mediaId: string,
  direction: 'earlier' | 'later',
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const { home } = await context(tx, lettingId);
    const [photo] = await tx
      .select({ kind: media.kind })
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.homeId, home.id)));
    if (!photo) throw new UserFacingError('We couldn’t find that photo.');
    const ordered = await tx
      .select({ id: media.id, position: media.position })
      .from(media)
      .where(and(eq(media.homeId, home.id), eq(media.kind, photo.kind)))
      .orderBy(asc(media.position));
    const at = ordered.findIndex((p) => p.id === mediaId);
    const other = ordered[direction === 'earlier' ? at - 1 : at + 1];
    if (!other) return;
    const mine = ordered[at]!;
    await tx.update(media).set({ position: other.position }).where(eq(media.id, mine.id));
    await tx.update(media).set({ position: mine.position }).where(eq(media.id, other.id));
    await republishIfPublic(tx, lettingId, member.userId);
  });
}

/** M43: removes a photo; its public sizes are deleted too. */
export async function removePhoto(
  member: Member,
  lettingId: string,
  mediaId: string,
): Promise<void> {
  const removed = await withOrg(member.organisationId, async (tx) => {
    const { home } = await context(tx, lettingId);
    const [row] = await tx
      .delete(media)
      .where(and(eq(media.id, mediaId), eq(media.homeId, home.id)))
      .returning({ widths: media.widths });
    await republishIfPublic(tx, lettingId, member.userId);
    return row ?? null;
  });
  if (!removed) return;
  const keys = mediaKeys(member.organisationId, mediaId);
  await objectStorage().remove('media', [...(removed.widths ?? []).map(keys.sized), keys.preview]);
}

/** M43, M109: a photo's description for screen readers, and whether it's computer-generated. */
export async function describePhoto(
  member: Member,
  lettingId: string,
  mediaId: string,
  input: { altText: string; isCgi: boolean },
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const { home } = await context(tx, lettingId);
    const alt = input.altText.trim().slice(0, 200);
    const problem = blockingFindings(checkListingText(alt))[0];
    if (problem) throw new UserFacingError(problem.message);
    await tx
      .update(media)
      .set({ altText: alt || null, isCgi: input.isCgi })
      .where(and(eq(media.id, mediaId), eq(media.homeId, home.id)));
    await republishIfPublic(tx, lettingId, member.userId);
  });
}

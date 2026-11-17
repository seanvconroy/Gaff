import { asc, eq, type SQL } from 'drizzle-orm';
import { photoStore } from '@/adapters/photos';
import { type Tx, withOrg } from '@/db/client';
import { lettingDrafts, lettingPhotos, lettings } from '@/db/schema';
import { cleanPhoto } from '@/domain/lettings/photo-clean';
import {
  MAX_HOME_PHOTOS,
  movedPhoto,
  photoKey,
  reorderedPhotos,
  type PhotoType,
} from '@/domain/lettings/photos';
import { MAX_PHOTO_BYTES } from '@/domain/tenancy/photos';
import { photoHref, type PhotoStore } from '@/ports/photo-store';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import type { HomePhoto } from './queries';

/**
 * UX-LT-10: a home's photos. Gaff keeps its own copy of each, checked by its real type and with
 * no location or camera data, in the photo store. Photos of homes only: nothing here is ever
 * used for a person's document.
 */

/** Why a photo wasn't kept, in words for its tile. The others carry on. */
export const photoProblems = {
  too_big: 'That photo is too big. Try one under 4 MB.',
  not_a_photo: 'That isn’t a photo Gaff can use. Try a JPEG, PNG or WebP.',
  unreadable: 'We couldn’t read that photo. Try another.',
  full: `A home can have up to ${MAX_HOME_PHOTOS} photos. Remove one to add another.`,
  closed: 'This letting is closed, so its photos can’t change.',
} as const;
export type PhotoProblem = keyof typeof photoProblems;

type Home = { kind: 'letting' | 'draft'; id: string };

/** Which the home is, locked so two uploads can't both take the last place. */
async function homeFor(tx: Tx, id: string): Promise<(Home & { closed: boolean }) | null> {
  const [draft] = await tx
    .select({ id: lettingDrafts.id })
    .from(lettingDrafts)
    .where(eq(lettingDrafts.id, id))
    .for('update');
  if (draft) return { kind: 'draft', id, closed: false };
  const [letting] = await tx
    .select({ id: lettings.id, status: lettings.status })
    .from(lettings)
    .where(eq(lettings.id, id))
    .for('update');
  if (!letting) return null;
  return {
    kind: 'letting',
    id,
    closed: letting.status === 'let' || letting.status === 'withdrawn',
  };
}

const of = (home: Home): SQL =>
  home.kind === 'letting'
    ? eq(lettingPhotos.lettingId, home.id)
    : eq(lettingPhotos.draftId, home.id);

async function rowsOf(tx: Tx, home: Home) {
  return tx
    .select({ id: lettingPhotos.id, storageKey: lettingPhotos.storageKey })
    .from(lettingPhotos)
    .where(of(home))
    .orderBy(asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
}

async function changed(
  tx: Tx,
  member: Member,
  home: Home,
  change: { added?: number; removed?: number; reordered?: boolean; count: number },
): Promise<void> {
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId: home.id,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.photos_changed',
    data: {
      added: change.added ?? 0,
      removed: change.removed ?? 0,
      reordered: change.reordered ?? false,
      count: change.count,
    },
  });
}

/**
 * Adds one photo to the end. Each photo is sent on its own, so one that fails doesn't stop the
 * rest (section 4, "A photo fails to upload").
 */
export async function addPhoto(
  member: Member,
  homeId: string,
  file: Buffer,
  store: PhotoStore = photoStore(),
): Promise<{ ok: true; photo: HomePhoto } | { ok: false; problem: PhotoProblem }> {
  if (file.length > MAX_PHOTO_BYTES) return { ok: false, problem: 'too_big' };
  const cleaned = cleanPhoto(file);
  if (!cleaned.ok) return { ok: false, problem: cleaned.problem };

  const id = crypto.randomUUID();
  const key = photoKey(member.organisationId, id, cleaned.type);
  const result = await withOrg(member.organisationId, async (tx) => {
    const home = await homeFor(tx, homeId);
    if (!home) throw new UserFacingError('We couldn’t find that home.');
    if (home.closed) return { ok: false as const, problem: 'closed' as const };
    const existing = await rowsOf(tx, home);
    if (existing.length >= MAX_HOME_PHOTOS) return { ok: false as const, problem: 'full' as const };
    // The picture is kept before its row is written: a row never points at nothing.
    await store.put(key, { bytes: cleaned.bytes, contentType: cleaned.type });
    await tx.insert(lettingPhotos).values({
      id,
      organisationId: member.organisationId,
      ...(home.kind === 'letting' ? { lettingId: home.id } : { draftId: home.id }),
      position: existing.length,
      storageKey: key,
      contentType: cleaned.type,
      bytes: cleaned.bytes.length,
      createdBy: member.userId,
    });
    await changed(tx, member, home, { added: 1, count: existing.length + 1 });
    return { ok: true as const, photo: { id, href: photoHref(key) } };
  });
  return result;
}

async function setOrder(tx: Tx, order: readonly string[]): Promise<void> {
  for (const [position, id] of order.entries()) {
    await tx.update(lettingPhotos).set({ position }).where(eq(lettingPhotos.id, id));
  }
}

/** Removes a photo, and Gaff's copy of it. The rest close up, so the next becomes the cover. */
export async function removePhoto(
  member: Member,
  homeId: string,
  photoId: string,
  store: PhotoStore = photoStore(),
): Promise<void> {
  const key = await withOrg(member.organisationId, async (tx) => {
    const home = await homeFor(tx, homeId);
    if (!home) throw new UserFacingError('We couldn’t find that home.');
    if (home.closed) throw new UserFacingError(photoProblems.closed);
    const rows = await rowsOf(tx, home);
    const row = rows.find((photo) => photo.id === photoId);
    if (!row) return null;
    await tx.delete(lettingPhotos).where(eq(lettingPhotos.id, photoId));
    const rest = rows.filter((photo) => photo.id !== photoId).map((photo) => photo.id);
    await setOrder(tx, rest);
    await changed(tx, member, home, { removed: 1, count: rest.length });
    return row.storageKey;
  });
  if (key) await store.remove([key]);
}

/**
 * Puts the photos in a new order: by dragging (`order`, every photo's ID), or one place at a
 * time from a photo's menu (`move`). The first is the cover.
 */
export async function reorderPhotos(
  member: Member,
  homeId: string,
  change: { order: readonly string[] } | { move: string; direction: 'earlier' | 'later' },
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const home = await homeFor(tx, homeId);
    if (!home) throw new UserFacingError('We couldn’t find that home.');
    if (home.closed) throw new UserFacingError(photoProblems.closed);
    const current = (await rowsOf(tx, home)).map((photo) => photo.id);
    const next =
      'order' in change
        ? reorderedPhotos(current, change.order)
        : movedPhoto(current, change.move, change.direction);
    if (!next) throw new UserFacingError('Those aren’t this home’s photos. Refresh and try again.');
    if (next.join() === current.join()) return;
    await setOrder(tx, next);
    await changed(tx, member, home, { reordered: true, count: next.length });
  });
}

/**
 * UX-LT-23: gives a new draft its own copies of another letting's photos, in the same order.
 * In the caller's transaction, which is already scoped to the organisation.
 */
export async function copyPhotosIn(
  tx: Tx,
  member: Member,
  from: { lettingId: string },
  to: { draftId: string },
  store: PhotoStore = photoStore(),
): Promise<number> {
  const rows = await tx
    .select()
    .from(lettingPhotos)
    .where(eq(lettingPhotos.lettingId, from.lettingId))
    .orderBy(asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  let copied = 0;
  for (const row of rows) {
    const id = crypto.randomUUID();
    const key = photoKey(member.organisationId, id, row.contentType as PhotoType);
    try {
      await store.copy(row.storageKey, key);
    } catch {
      // A picture that has gone missing isn't carried over. The rest still are.
      continue;
    }
    await tx.insert(lettingPhotos).values({
      id,
      organisationId: member.organisationId,
      draftId: to.draftId,
      position: copied,
      storageKey: key,
      contentType: row.contentType,
      bytes: row.bytes,
      createdBy: member.userId,
    });
    copied += 1;
  }
  return copied;
}

import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { photoStore } from '@/adapters/photos';
import { type Tx, withOrg } from '@/db/client';
import { lettingDrafts, lettingPhotos, lettings } from '@/db/schema';
import { MAX_DIRECT_UPLOAD_BYTES, toSigned64, type PhotoKind } from '@/domain/lettings/photo-files';
import {
  MAX_HOME_PHOTOS,
  movedPhoto,
  photoFolder,
  photoKey,
  photosThenPlans,
  previewPhotoKey,
  reorderedPhotos,
  sizedPhotoKey,
  storedPhotoKeys,
  uploadKey,
  type PhotoType,
} from '@/domain/lettings/photos';
import { MAX_PHOTO_BYTES } from '@/domain/tenancy/photos';
import type { PhotoStore, UploadTarget } from '@/ports/photo-store';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';
import { queueListingCheck } from '@/server/trust/checks';
import { preparePhoto } from './photo-pipeline';
import { homePhotoOf, showingOrder, type HomePhoto } from './queries';

/**
 * UX-LT-10, M43 (ADR-0023): a home's photos. Gaff keeps its own copy of each, made again from
 * its pixels: checked by its real type, upright, with no location or camera data, at fixed
 * sizes, with a perceptual hash. Photos of homes only: nothing here is ever used for a person's
 * document.
 */

/** Why a photo wasn't kept, in words for its tile. The others carry on. */
export const photoProblems = {
  too_big: 'That photo is too big. Try one under 4 MB.',
  not_a_photo: 'That isn’t a photo Gaff can use. Try a JPEG, PNG or WebP.',
  heic: 'This browser can’t open that iPhone photo. Add it from your phone, or save it as a JPEG first.',
  too_small: 'That photo is too small to show well. Try one at least 400 pixels across.',
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

/** The home, checked: it is this organisation's, this person may act on it, and it is open. */
async function openHome(tx: Tx, member: Member, homeId: string): Promise<Home | PhotoProblem> {
  const home = await homeFor(tx, homeId);
  if (!home) throw new UserFacingError('We couldn’t find that home.');
  if (home.kind === 'letting') await assertMayActOn(tx, member, home.id);
  return home.closed ? 'closed' : home;
}

const of = (home: Home): SQL =>
  home.kind === 'letting'
    ? eq(lettingPhotos.lettingId, home.id)
    : eq(lettingPhotos.draftId, home.id);

async function rowsOf(tx: Tx, home: Home) {
  return tx
    .select({
      id: lettingPhotos.id,
      storageKey: lettingPhotos.storageKey,
      widths: lettingPhotos.widths,
      kind: lettingPhotos.kind,
    })
    .from(lettingPhotos)
    .where(of(home))
    .orderBy(...showingOrder);
}

async function changed(
  tx: Tx,
  member: Member,
  home: Home,
  change: {
    added?: number;
    removed?: number;
    reordered?: boolean;
    count: number;
    floorPlan?: 'marked' | 'unmarked';
  },
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
      ...(change.floorPlan ? { floorPlan: change.floorPlan } : {}),
    },
  });
}

type Added = { ok: true; photo: HomePhoto } | { ok: false; problem: PhotoProblem };

/**
 * The pipeline, then the keeping: the picture is made again at its fixed sizes and kept before
 * its row is written, so a row never points at nothing.
 */
async function keepPhoto(
  member: Member,
  homeId: string,
  original: Buffer,
  store: PhotoStore,
): Promise<Added> {
  const prepared = await preparePhoto(original);
  if (!prepared.ok) return prepared;
  const { photo } = prepared;

  const id = crypto.randomUUID();
  const folder = photoFolder(member.organisationId, id);
  return withOrg(member.organisationId, async (tx) => {
    const home = await openHome(tx, member, homeId);
    if (typeof home === 'string') return { ok: false as const, problem: home };
    const existing = await rowsOf(tx, home);
    if (existing.length >= MAX_HOME_PHOTOS) return { ok: false as const, problem: 'full' as const };
    for (const size of photo.sizes) {
      await store.put(sizedPhotoKey(folder, size.width), {
        bytes: size.bytes,
        contentType: 'image/webp',
      });
    }
    await store.put(previewPhotoKey(folder), { bytes: photo.preview, contentType: 'image/jpeg' });
    const [last] = await tx
      .select({ position: sql<number>`coalesce(max(${lettingPhotos.position}), -1)::int` })
      .from(lettingPhotos)
      .where(of(home));
    const row = {
      id,
      storageKey: folder,
      widths: photo.sizes.map((size) => size.width),
      kind: 'photo' as const,
    };
    await tx.insert(lettingPhotos).values({
      ...row,
      organisationId: member.organisationId,
      ...(home.kind === 'letting' ? { lettingId: home.id } : { draftId: home.id }),
      position: (last?.position ?? -1) + 1,
      contentType: 'image/webp',
      bytes: photo.sizes[photo.sizes.length - 1]!.bytes.length,
      width: photo.width,
      height: photo.height,
      phash: toSigned64(photo.phash),
      createdBy: member.userId,
    });
    await changed(tx, member, home, { added: 1, count: existing.length + 1 });
    // BA-10 (M29): a public home's new photo is checked against other listers' photos.
    if (home.kind === 'letting') {
      await queueListingCheck(tx, {
        organisationId: member.organisationId,
        lettingId: home.id,
        part: 'photos',
        photoIds: [id],
      });
    }
    return { ok: true as const, photo: homePhotoOf(row) };
  });
}

/**
 * Adds one photo to the end of the photos, sent through Gaff's own server. Each photo is sent
 * on its own, so one that fails doesn't stop the rest (section 4, "A photo fails to upload").
 */
export async function addPhoto(
  member: Member,
  homeId: string,
  file: Buffer,
  store: PhotoStore = photoStore(),
): Promise<Added> {
  if (file.length > MAX_PHOTO_BYTES) return { ok: false, problem: 'too_big' };
  return keepPhoto(member, homeId, file, store);
}

const declared = z.object({
  contentType: z.string().max(100),
  bytes: z.number().int(),
});

/**
 * M43: the first step of sending a photo straight to the store, where the store can sign an
 * upload (Supabase). The type and size the browser declares are checked, and the home: the
 * bytes are checked again when they've arrived. Where the store can't (the local store), the
 * answer is `server`, and the photo goes through `addPhoto` as before.
 */
export async function startPhotoUpload(
  member: Member,
  homeId: string,
  file: { contentType: string; bytes: number },
  store: PhotoStore = photoStore(),
): Promise<
  | { via: 'server' }
  | { via: 'store'; uploadId: string; target: UploadTarget }
  | { via: 'none'; problem: PhotoProblem }
> {
  if (!store.signedUpload) return { via: 'server' };
  const { contentType, bytes } = declared.parse(file);
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    return { via: 'none', problem: 'heic' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    return { via: 'none', problem: 'not_a_photo' };
  }
  if (bytes <= 0) return { via: 'none', problem: 'unreadable' };
  if (bytes > MAX_DIRECT_UPLOAD_BYTES) return { via: 'none', problem: 'too_big' };
  const problem = await withOrg(member.organisationId, async (tx) => {
    const home = await openHome(tx, member, homeId);
    if (typeof home === 'string') return home;
    return (await rowsOf(tx, home)).length >= MAX_HOME_PHOTOS ? ('full' as const) : null;
  });
  if (problem) return { via: 'none', problem };
  const uploadId = crypto.randomUUID();
  const target = await store.signedUpload(uploadKey(member.organisationId, uploadId), contentType);
  return { via: 'store', uploadId, target };
}

/**
 * M43: the browser has sent the photo to the store. Gaff reads it back, makes it again at its
 * fixed sizes, and deletes what was sent, whatever the outcome. The upload's key is under the
 * member's own organisation, so nobody can finish another organisation's.
 */
export async function finishPhotoUpload(
  member: Member,
  homeId: string,
  uploadId: string,
  store: PhotoStore = photoStore(),
): Promise<Added> {
  const key = uploadKey(member.organisationId, z.uuid().parse(uploadId));
  try {
    const sent = await store.get(key);
    if (!sent) return { ok: false, problem: 'unreadable' };
    if (sent.bytes.length > MAX_DIRECT_UPLOAD_BYTES) return { ok: false, problem: 'too_big' };
    return await keepPhoto(member, homeId, sent.bytes, store);
  } finally {
    await store.remove([key]);
  }
}

/** M43: whether photos go straight from the browser to the store (it can sign an upload). */
export function photosGoStraightToStore(store: PhotoStore = photoStore()): boolean {
  return typeof store.signedUpload === 'function';
}

/** M43: originals sent to the store and never finished, after a day. How many went. */
export async function sweepPhotoUploads(
  now: Date = new Date(),
  store: PhotoStore = photoStore(),
): Promise<number> {
  if (!store.removeUploadsBefore) return 0;
  return store.removeUploadsBefore(new Date(now.getTime() - 86_400_000));
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
  const keys = await withOrg(member.organisationId, async (tx) => {
    const home = await openHome(tx, member, homeId);
    if (typeof home === 'string') throw new UserFacingError(photoProblems[home]);
    const rows = await rowsOf(tx, home);
    const row = rows.find((photo) => photo.id === photoId);
    if (!row) return [];
    await tx.delete(lettingPhotos).where(eq(lettingPhotos.id, photoId));
    const rest = rows.filter((photo) => photo.id !== photoId).map((photo) => photo.id);
    await setOrder(tx, rest);
    await changed(tx, member, home, { removed: 1, count: rest.length });
    return storedPhotoKeys(row);
  });
  if (keys.length > 0) await store.remove(keys);
}

/**
 * Puts the photos in a new order: by dragging (`order`, every photo's ID), or one place at a
 * time from a photo's menu (`move`). The first is the cover. Floor plans stay after the photos
 * (M44), and one moves only among the floor plans.
 */
export async function reorderPhotos(
  member: Member,
  homeId: string,
  change: { order: readonly string[] } | { move: string; direction: 'earlier' | 'later' },
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const home = await openHome(tx, member, homeId);
    if (typeof home === 'string') throw new UserFacingError(photoProblems[home]);
    const rows = await rowsOf(tx, home);
    const kindOf = new Map(rows.map((row) => [row.id, row.kind]));
    const current = rows.map((photo) => photo.id);
    let next: string[] | null;
    if ('order' in change) {
      next = reorderedPhotos(current, change.order);
    } else {
      const kind = kindOf.get(change.move);
      const group = rows.filter((row) => row.kind === kind).map((row) => row.id);
      const moved = movedPhoto(group, change.move, change.direction);
      next = kind
        ? current.map((id) => (kindOf.get(id) === kind ? moved.shift()! : id))
        : [...current];
    }
    if (!next) throw new UserFacingError('Those aren’t this home’s photos. Refresh and try again.');
    next = photosThenPlans(next.map((id) => ({ id, kind: kindOf.get(id)! }))).map((r) => r.id);
    if (next.join() === current.join()) return;
    await setOrder(tx, next);
    await changed(tx, member, home, { reordered: true, count: next.length });
  });
}

/**
 * M44: marks a picture as a floor plan, or as a photo again. A floor plan goes after the photos
 * and is never the cover; a photo marked again goes to the end of the photos.
 */
export async function setPhotoKind(
  member: Member,
  homeId: string,
  photoId: string,
  kind: PhotoKind,
): Promise<HomePhoto> {
  return withOrg(member.organisationId, async (tx) => {
    const home = await openHome(tx, member, homeId);
    if (typeof home === 'string') throw new UserFacingError(photoProblems[home]);
    const rows = await rowsOf(tx, home);
    const row = rows.find((photo) => photo.id === photoId);
    if (!row) throw new UserFacingError('That photo isn’t there now. Refresh and try again.');
    const marked = { ...row, kind };
    if (row.kind === kind) return homePhotoOf(marked);
    await tx.update(lettingPhotos).set({ kind }).where(eq(lettingPhotos.id, photoId));
    const others = rows.filter((photo) => photo.id !== photoId);
    const order = photosThenPlans([...others, marked]).map((photo) => photo.id);
    await setOrder(tx, order);
    await changed(tx, member, home, {
      count: rows.length,
      floorPlan: kind === 'floor_plan' ? 'marked' : 'unmarked',
    });
    return homePhotoOf(marked);
  });
}

/**
 * UX-LT-23: gives a new draft its own copies of another letting's photos and floor plans, in the
 * same order. In the caller's transaction, which is already scoped to the organisation.
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
    .orderBy(...showingOrder, asc(lettingPhotos.id));
  let copied = 0;
  for (const row of rows) {
    const id = crypto.randomUUID();
    // A photo from before the pipeline is one file; one since, a folder of sizes.
    const key =
      row.widths.length === 0
        ? photoKey(member.organisationId, id, row.contentType as PhotoType)
        : photoFolder(member.organisationId, id);
    const sources = storedPhotoKeys(row);
    const copies = storedPhotoKeys({ storageKey: key, widths: row.widths });
    try {
      for (const [index, each] of sources.entries()) await store.copy(each, copies[index]!);
    } catch {
      // A picture that has gone missing isn't carried over. The rest still are.
      await store.remove(copies).catch(() => undefined);
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
      kind: row.kind,
      width: row.width,
      height: row.height,
      widths: row.widths,
      phash: row.phash,
      createdBy: member.userId,
    });
    copied += 1;
  }
  return copied;
}

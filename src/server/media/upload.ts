import { and, eq, inArray, sql } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { homes, media } from '@/db/schema';
import {
  MAX_PHOTOS_PER_HOME,
  mediaKeys,
  uploadProblem,
  type MediaKind,
} from '@/domain/media/photos';
import { objectStorage } from '@/adapters/storage';
import type { UploadTarget } from '@/ports/storage';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

export interface StartedUpload {
  mediaId: string;
  upload: UploadTarget;
}

/**
 * M43: the first step of adding a photo to a home. Gaff checks the declared type and size and
 * returns a short-lived URL the browser uploads the file to, straight to storage.
 */
export async function startHomePhotoUpload(
  member: Member,
  homeId: string,
  file: { contentType: string; bytes: number; kind?: Extract<MediaKind, 'photo' | 'floor_plan'> },
): Promise<StartedUpload> {
  const problem = uploadProblem(file);
  if (problem) throw new UserFacingError(problem);
  const kind = file.kind ?? 'photo';

  const mediaId = await withOrg(member.organisationId, async (tx) => {
    const [home] = await tx.select({ id: homes.id }).from(homes).where(eq(homes.id, homeId));
    if (!home) throw new UserFacingError('That home isn’t in your account');
    const [count] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        last: sql<number>`coalesce(max(${media.position}), 0)`,
      })
      .from(media)
      .where(
        and(eq(media.homeId, homeId), inArray(media.status, ['uploading', 'processing', 'ready'])),
      );
    if (count!.n >= MAX_PHOTOS_PER_HOME) {
      throw new UserFacingError(`A home can have up to ${MAX_PHOTOS_PER_HOME} photos`);
    }
    const [row] = await tx
      .insert(media)
      .values({
        organisationId: member.organisationId,
        homeId,
        kind,
        contentType: file.contentType,
        bytes: file.bytes,
        position: count!.last + 1,
        createdBy: member.userId,
      })
      .returning({ id: media.id });
    return row!.id;
  });

  const upload = await objectStorage().signedUpload(
    mediaKeys(member.organisationId, mediaId).upload,
    file.contentType,
  );
  return { mediaId, upload };
}

/** M43: the browser has uploaded the file. Gaff checks and resizes it in the background. */
export async function finishPhotoUpload(member: Member, mediaId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .update(media)
      .set({ status: 'processing' })
      .where(and(eq(media.id, mediaId), eq(media.status, 'uploading')))
      .returning({ id: media.id, kind: media.kind });
    if (!row) throw new UserFacingError('That photo has already been added');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'photo.added',
      subject: { type: 'media', id: mediaId },
      data: { mediaId, kind: row.kind },
    });
    await enqueue(tx, 'process_media', { organisationId: member.organisationId, mediaId });
  });
}

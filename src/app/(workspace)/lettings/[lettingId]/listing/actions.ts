'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import {
  describePhoto,
  movePhoto,
  removePhoto,
  saveDescription,
  saveHomeDetails,
  saveLettingDetails,
} from '@/server/listings/editor';
import { confirmAvailable } from '@/server/listings/freshness';
import { setPaused } from '@/server/listings/manage';
import { publishListing } from '@/server/listings/publish';
import { finishPhotoUpload, startHomePhotoUpload } from '@/server/media/upload';

const page = (lettingId: string) => `/lettings/${lettingId}/listing`;

export async function homeDetailsAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const saved = await saveHomeDetails(member, lettingId, values);
  if (!saved.ok) return invalid(saved.errors, values);
  revalidatePath(page(lettingId));
  return { message: 'saved', values };
}

export async function lettingDetailsAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const saved = await saveLettingDetails(member, lettingId, values);
  if (!saved.ok) return invalid(saved.errors, values);
  revalidatePath(page(lettingId));
  return { message: 'saved', values };
}

export async function descriptionAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const saved = await saveDescription(member, lettingId, values.description ?? '');
  if (!saved.ok) return invalid(saved.errors, values);
  revalidatePath(page(lettingId));
  return { message: 'saved', values };
}

/** M43: the first step of an upload: Gaff checks the file and returns where to send it. */
export async function startUploadAction(
  homeId: string,
  file: { contentType: string; bytes: number; kind: 'photo' | 'floor_plan' },
) {
  const member = await requireMember();
  try {
    const started = await startHomePhotoUpload(member, homeId, file);
    return { ok: true as const, mediaId: started.mediaId, upload: started.upload };
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return { ok: false as const, problem: error.message };
  }
}

export async function finishUploadAction(lettingId: string, mediaId: string) {
  const member = await requireMember();
  await finishPhotoUpload(member, mediaId);
  revalidatePath(page(lettingId));
}

export async function photoAction(lettingId: string, mediaId: string, formData: FormData) {
  const member = await requireMember();
  const what = String(formData.get('what') ?? '');
  try {
    if (what === 'earlier' || what === 'later') await movePhoto(member, lettingId, mediaId, what);
    else if (what === 'remove') await removePhoto(member, lettingId, mediaId);
    else if (what === 'describe') {
      await describePhoto(member, lettingId, mediaId, {
        altText: String(formData.get('altText') ?? ''),
        isCgi: formData.get('isCgi') === 'yes',
      });
    }
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`${page(lettingId)}?problem=${encodeURIComponent(error.message)}#photos`);
  }
  revalidatePath(page(lettingId));
  redirect(`${page(lettingId)}#photos`);
}

/** M48: publish, after every check. */
export async function publishAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const result = await publishListing(member, lettingId, {
    declare: formData.get('declare') === 'yes',
  });
  revalidatePath(page(lettingId));
  if (result.outcome === 'problems') {
    return { message: 'problems', values: { count: String(result.problems.length) } };
  }
  return { message: result.outcome };
}

export async function liveAction(lettingId: string, listingId: string, formData: FormData) {
  const member = await requireMember();
  const what = String(formData.get('what') ?? '');
  try {
    if (what === 'pause') await setPaused(member, lettingId, true);
    else if (what === 'resume') await setPaused(member, lettingId, false);
    else if (what === 'confirm') await confirmAvailable(member, listingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`${page(lettingId)}?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(page(lettingId));
  redirect(`${page(lettingId)}?saved=${what}`);
}

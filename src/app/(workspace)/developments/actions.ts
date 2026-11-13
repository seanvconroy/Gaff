'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import {
  addHomesLike,
  createDevelopment,
  publishDevelopment,
  publishReadyHomes,
  updateDevelopment,
} from '@/server/developments/developments';
import { UserFacingError } from '@/server/errors';
import { finishPhotoUpload, startDevelopmentPhotoUpload } from '@/server/media/upload';

const page = (id: string) => `/developments/${id}`;

export async function createDevelopmentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await createDevelopment(member, values);
  if (!result.ok) return invalid(result.errors, values, 'Some details need another look.');
  redirect(page(result.id));
}

export async function updateDevelopmentAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await updateDevelopment(member, id, values);
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath(page(id));
  return { values, message: 'saved' };
}

export async function publishDevelopmentAction(id: string): Promise<void> {
  const member = await requireMember();
  const result = await publishDevelopment(member, id);
  redirect(`${page(id)}?${result.ok ? 'published=1' : 'problems=1'}`);
}

/** M35: many homes like one already set up. */
export async function addHomesAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await addHomesLike(member, id, values.template ?? '', values.rows ?? '');
  if (!result.ok) return invalid({ rows: result.errors.join(' ') }, values);
  revalidatePath(page(id));
  return { message: `added:${result.added.length}` };
}

/** M35: publish every home that's ready, with one declaration (M25). */
export async function publishHomesAction(id: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  if (formData.get('declare') !== 'yes') redirect(`${page(id)}?declare=1`);
  const result = await publishReadyHomes(member, id);
  redirect(`${page(id)}?live=${result.published}&held=${result.held}&waiting=${result.notReady}`);
}

export async function startDevelopmentUploadAction(
  id: string,
  file: { contentType: string; bytes: number; kind: 'photo' | 'floor_plan' },
) {
  const member = await requireMember();
  try {
    const started = await startDevelopmentPhotoUpload(member, id, file);
    return { ok: true as const, mediaId: started.mediaId, upload: started.upload };
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return { ok: false as const, problem: error.message };
  }
}

export async function finishDevelopmentUploadAction(id: string, mediaId: string) {
  const member = await requireMember();
  await finishPhotoUpload(member, mediaId);
  revalidatePath(page(id));
}

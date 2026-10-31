'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { viewingSessionSchema } from '@/domain/viewings/viewing-session';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { addViewingSession, removeViewingSession } from '@/server/lettings/viewing-sessions';

export async function addSessionAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = viewingSessionSchema().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await addViewingSession(member, lettingId, parsed.data);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return invalid({ [error.field ?? 'form']: error.message }, values);
    }
    throw error;
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/viewings?added=1`);
}

export async function removeSessionAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const sessionId = String(formData.get('sessionId') ?? '');
  try {
    await removeViewingSession(member, lettingId, sessionId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { setSavedNote, unsaveHome } from '@/server/alerts/saved-homes';
import { requireRenter } from '../renter';

const id = z.uuid();

/** M85: a private note on a saved home. */
export async function saveNoteAction(listingId: string, formData: FormData): Promise<void> {
  const { user } = await requireRenter();
  if (!id.safeParse(listingId).success) return;
  await setSavedNote(user.id, listingId, String(formData.get('note') ?? ''));
  revalidatePath('/my/saved');
}

export async function removeSavedAction(listingId: string): Promise<void> {
  const { user } = await requireRenter();
  if (!id.safeParse(listingId).success) return;
  await unsaveHome(user.id, listingId);
  revalidatePath('/my/saved');
}

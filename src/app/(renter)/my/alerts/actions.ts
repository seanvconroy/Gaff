'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { alertFrequencies } from '@/domain/alerts/alerts';
import { deleteSearch, setFrequency } from '@/server/alerts/searches';
import { requireRenter } from '../renter';

const id = z.uuid();

/** M86: how often, or stop. */
export async function setFrequencyAction(searchId: string, formData: FormData): Promise<void> {
  const { user } = await requireRenter();
  const frequency = z.enum(alertFrequencies).safeParse(formData.get('frequency'));
  if (!id.safeParse(searchId).success || !frequency.success) return;
  await setFrequency(user.id, searchId, frequency.data);
  revalidatePath('/my/alerts');
}

export async function deleteSearchAction(searchId: string): Promise<void> {
  const { user } = await requireRenter();
  if (!id.safeParse(searchId).success) return;
  await deleteSearch(user.id, searchId);
  revalidatePath('/my/alerts');
}

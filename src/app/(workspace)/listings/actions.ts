'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { reassignListing, relistHome } from '@/server/listings/manage';

/** M94: lets a home again, from its last letting. */
export async function relistAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  let created: string;
  try {
    created = (await relistHome(member, lettingId)).lettingId;
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/listings?problem=${encodeURIComponent(error.message)}`);
  }
  redirect(`/lettings/${created}`);
}

/** M93: an admin gives a listing to another agent. */
export async function reassignAction(listingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await reassignListing(member, listingId, String(formData.get('userId') ?? ''));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/listings?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/listings');
  redirect('/listings?saved=1');
}

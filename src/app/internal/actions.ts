'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { hideListing, keepListingUp, unhideListing } from '@/server/trust/staff';

/**
 * UX-TS-4 (Q13): what Gaff's own team can do about a reported listing, and nothing more: hide
 * it, keep it up, or put a hidden one back. Each asks `requireStaff()` itself, so anyone else
 * gets "not found", signed in or not.
 */

async function then(done: string, act: () => Promise<unknown>): Promise<never> {
  try {
    await act();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/internal?problem=listing#reported');
  }
  revalidatePath('/', 'layout');
  redirect(`/internal?done=${done}#reported`);
}

/** "Hide this listing", with the reason chosen. */
export async function hideListingAction(lettingId: string, formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const reason = String(formData.get('reason') ?? '');
  await then('hidden', () => hideListing(staff, { lettingId, reason }));
}

/** "Keep it up": the reports are answered and the listing stays. */
export async function keepListingUpAction(lettingId: string): Promise<void> {
  const staff = await requireStaff();
  await then('kept', () => keepListingUp(staff, lettingId));
}

/** "Put it back on gaff.ie". */
export async function unhideListingAction(lettingId: string): Promise<void> {
  const staff = await requireStaff();
  await then('back', () => unhideListing(staff, lettingId));
}

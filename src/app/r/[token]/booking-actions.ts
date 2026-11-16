'use server';

import { redirect } from 'next/navigation';
import { bookViewing, cancelViewing } from '@/server/viewings/booking';

/**
 * R12, UX-RN-5 to UX-RN-7: the confirm step books (or moves) the viewing. A time that has just
 * gone sends the renter back to the list of the others; anything else is said at the confirm
 * step. Nothing personal goes in the address: a time's ID and a code for the problem.
 */
export async function bookAction(token: string, slotId: string, formData: FormData): Promise<void> {
  const result = await bookViewing(token, slotId, String(formData.get('mobile') ?? ''));
  if (result.ok) redirect(`/r/${token}`);
  if (result.reason === 'invalid_link') redirect(`/r/${token}`);
  if (result.reason === 'full') redirect(`/r/${token}/book?gone=1`);
  const problem = result.reason === 'invalid_phone' ? 'phone' : result.reason;
  redirect(`/r/${token}/book?slot=${slotId}&problem=${problem}`);
}

/** UX-RN-6: a place from the waiting list has no picker: the page's button takes it. */
export async function takePlaceAction(token: string, slotId: string): Promise<void> {
  await bookViewing(token, slotId);
  // Taken or gone, the page says where they stand now.
  redirect(`/r/${token}`);
}

export async function cancelAction(token: string): Promise<void> {
  await cancelViewing(token);
  redirect(`/r/${token}`);
}

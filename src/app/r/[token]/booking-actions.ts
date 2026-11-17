'use server';

import { bookViewing, cancelViewing } from '@/server/viewings/booking';
import { toRenterPage } from './back';
import { keepFromPage } from './keep';

/**
 * R12, UX-RN-5 to UX-RN-7: the confirm step books (or moves) the viewing. A time that has just
 * gone sends the renter back to the list of the others; anything else is said at the confirm
 * step. Nothing personal goes in the address: a time's ID and a code for the problem.
 */
export async function bookAction(token: string, slotId: string, formData: FormData): Promise<void> {
  const result = await bookViewing(token, slotId, String(formData.get('mobile') ?? ''));
  if (result.ok) {
    // UX-PF-2: a mobile number they gave for a text reminder is kept, for a renter whose
    // profile keeps what they enter. One that came with an enquiry never is (Q12).
    await keepFromPage(token, 'booking', (entered) => ({ mobile: entered.mobile }));
    toRenterPage(token);
  }
  if (result.reason === 'invalid_link') toRenterPage(token);
  if (result.reason === 'full') toRenterPage(token, `/book?gone=1`);
  const problem = result.reason === 'invalid_phone' ? 'phone' : result.reason;
  toRenterPage(token, `/book?slot=${slotId}&problem=${problem}`);
}

/** UX-RN-6: a place from the waiting list has no picker: the page's button takes it. */
export async function takePlaceAction(token: string, slotId: string): Promise<void> {
  await bookViewing(token, slotId);
  // Taken or gone, the page says where they stand now.
  toRenterPage(token);
}

export async function cancelAction(token: string): Promise<void> {
  await cancelViewing(token);
  toRenterPage(token);
}

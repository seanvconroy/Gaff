import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * UX-PP-7: after a renter's action, their page, drawn again as it stands now. Used by this
 * folder's server actions in place of a bare `redirect`.
 *
 * The page is marked as changed first. Without that, the browser can keep showing the page it
 * already holds for this address when the address differs from the one it's on only by the
 * screen of a flow (`?q=pets`, put there by the browser's history and never sent to the server),
 * and a renter who pressed "Send my answers" would see the first question again.
 */
export function toRenterPage(token: string, rest = ''): never {
  revalidatePath(`/r/${token}`);
  redirect(`/r/${token}${rest}`);
}

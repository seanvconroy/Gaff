'use server';

import { revalidatePath } from 'next/cache';
import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { confirmInventory, queryInventoryItem } from '@/server/tenancy/movein';
import { toRenterPage } from './back';

/** R25: the tenant confirms the inventory is a fair record. */
export async function confirmInventoryAction(token: string): Promise<void> {
  await confirmInventory(token);
  toRenterPage(token, `/inventory`);
}

/** UX-RN-25: "Something's not right": a short note to the lister about one item. */
export async function queryItemAction(
  token: string,
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await queryInventoryItem(token, itemId, values);
  if (!result) return invalid({ note: common.linkEnded }, values);
  if (!result.ok) {
    if ('closed' in result) toRenterPage(token);
    return invalid(result.errors, values);
  }
  // The sheet that sent it closes itself and the page is drawn again with the note on it.
  revalidatePath(`/r/${token}/inventory`);
  return { message: 'sent', attempt: Date.now() };
}

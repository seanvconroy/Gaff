'use server';

import { redirect } from 'next/navigation';
import { deleteRenterAccount } from '@/server/renters/account';
import { requireRenter } from '../renter';

/** M13: the renter deletes their account, after a deliberate second tap. */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const { user } = await requireRenter();
  if (formData.get('confirm') !== 'yes') redirect('/my/account?confirm=1');
  const result = await deleteRenterAccount(user.id);
  redirect(result === 'deleted' ? '/to-rent?deleted=1' : '/my/account?letter=1');
}

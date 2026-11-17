'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/server/auth/member';
import { removeSavedSearch, setSearchAlerts } from '@/server/saved/searches';

/** Saved and Profile: "Remove" on a saved search. It goes at once (UX-SR-10). */
export async function removeSearchAction(savedSearchId: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await removeSavedSearch(user.id, savedSearchId);
  revalidatePath('/saved');
  revalidatePath('/profile');
}

/** Profile: "Email me when a new home fits", on or off (UX-SR-10). */
export async function setAlertsAction(on: boolean): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await setSearchAlerts(user.id, on === true);
  revalidatePath('/saved');
  revalidatePath('/profile');
}

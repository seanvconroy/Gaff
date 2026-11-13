'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import { saveHome, unsaveHome } from '@/server/alerts/saved-homes';
import { saveSearch } from '@/server/alerts/searches';
import { currentUser } from '@/server/auth/member';

const path = z.string().regex(/^\/(?![/\\])[A-Za-z0-9/_.~,=&?%-]{0,300}$/);

function signInFirst(returnTo: string): never {
  redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
}

/** M85: save a home, or stop saving it. Signed-out renters sign in first, then come back. */
export async function toggleSaveAction(
  listingId: string,
  returnTo: string,
  formData: FormData,
): Promise<void> {
  if (!env().MARKETPLACE_PUBLIC) redirect('/');
  const back = path.safeParse(returnTo).success ? returnTo : '/to-rent';
  const user = await currentUser();
  if (!user) signInFirst(back);
  if (!z.uuid().safeParse(listingId).success) redirect(back);
  if (formData.get('save') === '1') await saveHome(user.id, listingId);
  else await unsaveHome(user.id, listingId);
  revalidatePath(back.split('?')[0]!);
}

/** M86: alerts for this search, as soon as a home is listed (the default). */
export async function saveSearchAction(areaPath: string, query: string): Promise<void> {
  if (!env().MARKETPLACE_PUBLIC) redirect('/');
  const back = `${areaPath}${query ? `?${query}` : ''}`;
  const user = await currentUser();
  if (!user) signInFirst(path.safeParse(back).success ? back : '/to-rent');
  const saved = await saveSearch(user.id, areaPath, query);
  if (!saved) redirect('/to-rent');
  redirect('tooMany' in saved ? '/my/alerts?full=1' : `/my/alerts?added=${saved.id}`);
}

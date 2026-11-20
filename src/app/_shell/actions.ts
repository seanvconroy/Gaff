'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { nameIsKnown } from '@/domain/accounts/first-run';
import { listAHomeHref } from '@/domain/navigation/context';
import { ensureOwnHomes, startRenting, switchContext } from '@/server/accounts/contexts';
import { auth } from '@/server/auth/auth';
import { currentUser } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';

export async function signOut(): Promise<void> {
  const requestHeaders = await headers();
  await auth().api.signOut({ headers: requestHeaders });
  redirect('/sign-in');
}

/** UX-AC-11: one tap in the account menu switches context, and the destinations change with it. */
export async function switchTo(key: string): Promise<void> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  let home: string;
  try {
    home = await switchContext(user, String(key).slice(0, 64));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    home = '/';
  }
  revalidatePath('/', 'layout');
  redirect(home);
}

/**
 * UX-AC-13: a new context from the account menu. "Find a home to rent" opens Search; "Let a home
 * I own" opens "Add your home". Each reuses the name already on the profile; only someone who
 * never gave one is asked for it first.
 */
export async function addContext(context: 'renting' | 'own_homes'): Promise<void> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (context === 'renting') {
    await startRenting(user);
    revalidatePath('/', 'layout');
    redirect('/');
  }
  if (!nameIsKnown(user.name)) {
    redirect(`/welcome?next=${encodeURIComponent(listAHomeHref)}`);
  }
  await ensureOwnHomes(user);
  revalidatePath('/', 'layout');
  redirect(listAHomeHref);
}

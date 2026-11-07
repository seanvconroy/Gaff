import { notFound, redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { currentUser } from '@/server/auth/member';
import { renterProfile } from '@/server/renters/profile';

/** For renters' own pages: signed in, with a renter profile, once the marketplace is open. */
export async function requireRenter() {
  if (!env().MARKETPLACE_PUBLIC) notFound();
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const profile = await renterProfile(user.id);
  if (!profile) redirect('/welcome');
  return { user, profile, renter: { userId: user.id, email: user.email } };
}

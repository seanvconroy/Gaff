'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth/auth';

export async function signOut(): Promise<void> {
  const requestHeaders = await headers();
  await auth().api.signOut({ headers: requestHeaders });
  redirect('/sign-in');
}

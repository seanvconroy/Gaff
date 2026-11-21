import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { emailNeededCopy } from '@/copy/sign-in';
import { signInPath } from '@/domain/auth/next-path';
import { currentUser } from '@/server/auth/member';
import { mobileWaitingForEmail } from '@/server/auth/sign-in';
import { EmailNeeded } from './EmailNeeded';

export const metadata: Metadata = { title: emailNeededCopy.title };
export const dynamic = 'force-dynamic';

/**
 * UX-SI-14: this browser has just proved a mobile number that gets nobody in by itself: nobody
 * has it, or its owner hasn't used it in 180 days. One question: the email that goes with it.
 * Which number comes from this browser's cookie, never from the address bar (rule 8).
 */
export default async function EmailNeededPage() {
  if (await currentUser()) redirect('/');
  const proven = await mobileWaitingForEmail();
  if (!proven) redirect('/sign-in');
  return <EmailNeeded differentHref={signInPath(proven.nextPath)} />;
}

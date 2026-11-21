import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { foundCopy } from '@/copy/sign-in';
import { joinedFrom } from '@/domain/auth/joining';
import { maskedMobile } from '@/domain/auth/mobile';
import { currentUser } from '@/server/auth/member';
import { signInOverview } from '@/server/auth/security';
import { afterSignIn } from '@/server/auth/sign-in';
import { ButtonLink } from '@/ui/Button';
import styles from '../sign-in.module.css';

export const metadata: Metadata = { title: foundCopy.title };
export const dynamic = 'force-dynamic';

/**
 * UX-SI-14, UX-SI-15: "We've found your account". Someone signed in with a mobile number, or
 * with Google or Apple, that Gaff hadn't seen, proved their email, and already had an account
 * under it. They're signed in to it, and what they came with is one of its ways in from now on.
 *
 * Shown only after the mailbox said yes with a code: the page reads who is signed in, so there
 * is nothing here for anyone else, and nothing about the person in the address bar. What it says
 * was joined is read from their account, never taken from the address: a link can't make this
 * page say something that isn't so.
 */
export default async function FoundPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; next?: string }>;
}) {
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  // On from here: the passkey offer if it's due, else where they were going.
  const onward = await afterSignIn('email_code', query.next ?? null);
  const joined = joinedFrom(query.joined);
  if (!joined) redirect(onward);
  const waysIn = await signInOverview(user.id, null);
  const mobile = joined === 'mobile' ? waysIn.mobile : null;
  const there = joined === 'mobile' ? Boolean(mobile) : Boolean(waysIn.providers[joined]);
  if (!there) redirect(onward);
  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">{foundCopy.title}</h1>
        <p className={styles.lead}>{foundCopy.signedInAs(user.email)}</p>
      </div>
      <div className={styles.actions}>
        <p>{foundCopy.joined(joined, mobile ? maskedMobile(mobile) : null)}</p>
        <p className={styles.quiet}>{foundCopy.change}</p>
      </div>
      <ButtonLink href={onward} variant="primary" fullWidth>
        {foundCopy.continue}
      </ButtonLink>
    </div>
  );
}

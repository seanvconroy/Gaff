import type { Metadata } from 'next';
import Link from 'next/link';
import { CODE_LASTS_MINUTES } from '@/domain/auth/codes';
import { NOT_NOW_DAYS } from '@/domain/auth/passkey-offer';
import { SESSION_LASTS_DAYS } from '@/domain/auth/session';
import styles from '../legal.module.css';

export const metadata: Metadata = { title: 'Privacy notice' };

/**
 * Gaff's own privacy notice, for people with an account: the one the sign-in screen links to
 * (UX-SI-1). DRAFT wording for the solicitor to review before launch (section 11). It covers
 * what signing in keeps, and names Google and Apple, as Q30 asks. A renter's notice for one
 * letting is the operator's, at /privacy/[slug], and is unchanged.
 */
export default function PrivacyNoticePage() {
  return (
    <div className={styles.legal}>
      <h1 className="type-display-mobile">Privacy notice</h1>
      <p>
        This is about your Gaff account. If you enquired about a home, the notice from the agent or
        landlord letting it is linked in their emails to you.
      </p>

      <h2 className="type-title">What signing in keeps</h2>
      <ul>
        <li>Your email address, and your name once you give it.</li>
        <li>Which ways you sign in: Google, Apple, an email code or a passkey.</li>
        <li>
          If you add a passkey: its public half. The private half stays on your device, and Gaff
          never sees your face or fingerprint.
        </li>
      </ul>
      <p>There are no passwords.</p>

      <h2 className="type-title">Google and Apple</h2>
      <p>
        If you continue with Google or Apple, they tell Gaff who you are: an ID for your account
        with them, your email address and your name. Gaff asks for nothing else and keeps nothing
        else from them. With Apple’s “Hide My Email”, Gaff gets the address Apple gives it, not your
        own.
      </p>

      <h2 className="type-title">Email codes</h2>
      <p>
        A sign-in code works once, for {CODE_LASTS_MINUTES} minutes, in the browser that asked for
        it. Gaff keeps a scrambled copy that can’t be read back, and deletes it within a day.
      </p>

      <h2 className="type-title">On your device</h2>
      <p>
        Gaff keeps a few small cookies, all needed for signing in: one that keeps you signed in for{' '}
        {SESSION_LASTS_DAYS} days from when you last used Gaff on that device; one that ties a code
        to your browser while you sign in; one that remembers which way you signed in last; and one
        that remembers “Not now” to a passkey for {NOT_NOW_DAYS} days. None is used for advertising
        or to follow you.
      </p>

      <h2 className="type-title">Your rights</h2>
      <p>
        You can ask to see, correct or delete what Gaff holds about you, and you can complain to the
        Data Protection Commission.
      </p>
      <Link href="/sign-in" className={styles.back}>
        Back to sign in
      </Link>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata: Metadata = { title: 'Terms' };

/**
 * The terms the sign-in screen links to (UX-SI-1). A STUB: the terms themselves are written
 * with the solicitor before the first real user (section 11, "Before real users"; OQ-8), and
 * replace everything below. It says only what is true of Gaff today.
 */
export default function TermsPage() {
  return (
    <div className={styles.legal}>
      <h1 className="type-heading">Terms</h1>
      <p>
        Gaff is software for letting a home in Ireland. Letting agents and landlords use it to run a
        letting. Renters use it free: Gaff never charges a renter, and never holds anyone’s money.
      </p>
      <p>
        An AI assistant does much of the work, and says so. A person makes every decision about who
        views a home, who is offered it, and what is signed.
      </p>
      <p>
        The full terms are being written with our solicitor, and will be on this page before Gaff
        opens to everyone.
      </p>
      <Link href="/sign-in" className={styles.back}>
        Back to sign in
      </Link>
    </div>
  );
}

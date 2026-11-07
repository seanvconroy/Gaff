import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../prose.module.css';

export const metadata: Metadata = {
  title: 'Listing policy',
  description: 'What can be listed on Gaff, and what can’t.',
  alternates: { canonical: '/listing-policy' },
};

/**
 * M101: the listing policy, in plain words. It states the rules Gaff's checks already enforce;
 * the solicitor reviews the wording before launch (launch checklist).
 */
export default function ListingPolicyPage() {
  return (
    <article className={styles.prose} aria-labelledby="policy-heading">
      <h1 id="policy-heading" className="type-display">
        Listing policy
      </h1>
      <p>
        Every home on Gaff is a whole home to rent on a tenancy, listed by a landlord letting their
        own home or a licensed letting agent. Gaff checks every letter before their first home goes
        live.
      </p>
      <h2 className="type-heading">A listing must</h2>
      <ul>
        <li>Be a real home that’s available, at the rent and on the terms shown.</li>
        <li>Use photos of the home itself, and say when an image is computer-generated.</li>
        <li>Show the home’s Building Energy Rating (BER), or say it’s exempt.</li>
        <li>Ask for a deposit of no more than one month’s rent.</li>
        <li>Be confirmed as still available every 14 days, or it’s paused.</li>
      </ul>
      <h2 className="type-heading">A listing must never</h2>
      <ul>
        <li>
          Exclude or prefer anyone on a ground the Equal Status Acts protect: gender, civil status,
          family status, sexual orientation, religion, age, disability, race, membership of the
          Traveller community, or receiving housing assistance (HAP).
        </li>
        <li>Charge renters any fee, or ask for money before a tenancy agreement is signed.</li>
        <li>Ask renters to contact the letter off Gaff, or include contact details or links.</li>
        <li>Copy another letter’s photos or words.</li>
        <li>Contain anything offensive.</li>
      </ul>
      <h2 className="type-heading">What happens if a listing breaks the policy</h2>
      <p>
        Gaff’s checks stop some listings going live until a person looks at them. Anyone can report
        a listing. A person at Gaff decides every removal, and the letter gets the reasons and can
        appeal to a different person at Gaff.
      </p>
      <p>
        <Link href="/contact">Contact Gaff</Link>
      </p>
    </article>
  );
}

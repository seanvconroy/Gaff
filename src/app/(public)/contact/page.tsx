import type { Metadata } from 'next';
import { env } from '@/lib/env';
import styles from '../prose.module.css';

export const metadata: Metadata = {
  title: 'Contact Gaff',
  alternates: { canonical: '/contact' },
};

/** M101 (Digital Services Act, Articles 11 and 12): a contact point for users and authorities. */
export default function ContactPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <article className={styles.prose} aria-labelledby="contact-heading">
      <h1 id="contact-heading" className="type-display">
        Contact Gaff
      </h1>
      <p>
        To report a listing, use “Report this listing” on its page: no account needed. A person at
        Gaff looks at every report.
      </p>
      {email ? (
        <p>
          For anything else, including requests from authorities, email{' '}
          <a href={`mailto:${email}`}>{email}</a>. We answer in English or Irish within 2 working
          days.
        </p>
      ) : (
        <p>Our email address for everything else will be here before launch.</p>
      )}
    </article>
  );
}

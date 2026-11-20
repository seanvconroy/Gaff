import type { Metadata } from 'next';
import Link from 'next/link';
import { resultsOrderCopy as copy } from '@/copy/place-pages';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import styles from './order.module.css';

export const metadata: Metadata = {
  title: copy.title,
  description: copy.description,
  alternates: { canonical: '/how-results-are-ordered' },
};

/**
 * M59 (BA-12): what order search puts homes in, in the site's own frame and voice, linked from
 * under the results. It says the redesign's order (UX-SR-7, src/domain/search/match.ts): what
 * fits everything asked first, then what is close, each newest first. Nobody can pay to be
 * higher, and Gaff never recommends a person (rule 1, rule 3, Q36).
 */
export default function HowResultsAreOrderedPage() {
  return (
    <Narrow>
      <Stack gap={6}>
        <PageHeader title={copy.title} />
        <p>{copy.intro}</p>
        <section className={styles.section} aria-labelledby="order-heading">
          <h2 id="order-heading" className="type-heading">
            {copy.order.heading}
          </h2>
          <p>{copy.order.fits}</p>
          <p>{copy.order.close}</p>
          <p>{copy.order.nothing}</p>
        </section>
        <section className={styles.section} aria-labelledby="never-heading">
          <h2 id="never-heading" className="type-heading">
            {copy.never.heading}
          </h2>
          <p>{copy.never.pay}</p>
          <p>{copy.never.you}</p>
        </section>
        <section className={styles.section} aria-labelledby="people-heading">
          <h2 id="people-heading" className="type-heading">
            {copy.people.heading}
          </h2>
          <p>{copy.people.text}</p>
        </section>
        <p className={styles.next}>
          {copy.next.text} <Link href="/">{copy.next.action}</Link>
        </p>
      </Stack>
    </Narrow>
  );
}

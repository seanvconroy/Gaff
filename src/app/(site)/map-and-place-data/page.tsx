import type { Metadata } from 'next';
import Link from 'next/link';
import { placeDataCopy as copy } from '@/copy/place-data';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import styles from './place-data.module.css';

export const metadata: Metadata = {
  title: copy.title,
  description: copy.description,
  alternates: { canonical: '/map-and-place-data' },
};

/**
 * M56 (ADR-0017): the credit for Gaff's place index. OpenStreetMap's licence (the ODbL) asks for
 * its credit wherever the data is used, and an offer of the data Gaff built from it. Linked from
 * under the search and from the place search's suggestions.
 */
export default function MapAndPlaceDataPage() {
  return (
    <Narrow>
      <Stack gap={6}>
        <PageHeader title={copy.title} />
        <section className={styles.section} aria-labelledby="places-heading">
          <h2 id="places-heading" className="type-heading">
            {copy.places.heading}
          </h2>
          <p>
            {copy.places.built} <a href={copy.places.creditHref}>{copy.places.credit}</a>.
          </p>
          <p>{copy.places.added}</p>
          <p>{copy.places.open}</p>
        </section>
        <section className={styles.section} aria-labelledby="typing-heading">
          <h2 id="typing-heading" className="type-heading">
            {copy.typing.heading}
          </h2>
          <p>{copy.typing.text}</p>
        </section>
        <p className={styles.next}>
          {copy.next.text} <Link href="/">{copy.next.action}</Link>
        </p>
      </Stack>
    </Narrow>
  );
}

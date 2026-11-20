import type { Metadata } from 'next';
import { savedCopy, searchWords } from '@/copy/saved';
import { filtersFromParams, searchHref } from '@/domain/search/filters';
import { resolveSearch } from '@/server/search/where';
import { ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import styles from '../alerts.module.css';

export const metadata: Metadata = { title: savedCopy.confirmed.title, robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

/**
 * UX-SR-10: the search is confirmed. What it is (its chips, from this page's address), what
 * happens next (an email as soon as a new home fits, or once a day), and how it stops.
 */
export default async function SearchConfirmed({ searchParams }: { searchParams: Promise<Query> }) {
  const { filters, placeName } = await resolveSearch(filtersFromParams(await searchParams));
  const words = searchWords(filters, new Date(), placeName);
  return (
    <div className={styles.page}>
      <Outcome tone="success" title={savedCopy.confirmed.title} headingLevel={1}>
        {words ? <p className={styles.search}>{words}</p> : null}
        <p>{savedCopy.confirmed.text}</p>
        <p>{savedCopy.confirmed.stop}</p>
        <div className={styles.action}>
          <ButtonLink href={searchHref(filters)} variant="primary">
            {savedCopy.confirmed.action}
          </ButtonLink>
        </div>
      </Outcome>
    </div>
  );
}

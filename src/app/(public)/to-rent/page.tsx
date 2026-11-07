import type { Metadata } from 'next';
import { Notice } from '@/ui/Notice';
import { readQuery, type SearchParams } from './query';
import { SearchPage } from './SearchPage';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { indexable } = await readQuery(searchParams);
  return {
    title: 'Homes to rent in Ireland',
    description:
      'Homes to rent across Ireland, from checked landlords and agents. Free for renters, and every enquiry gets an answer.',
    alternates: { canonical: '/to-rent' },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** M56: search all of Ireland. */
export default async function EverywherePage({ searchParams }: { searchParams: SearchParams }) {
  const { filters, unknownPlace } = await readQuery(searchParams);
  const { deleted } = await searchParams;
  return (
    <>
      {deleted ? (
        // M13: after deleting an account.
        <Notice tone="success" title="Your account is deleted" role="status">
          <p>Your profile, saved homes and alerts are gone, and you’re signed out.</p>
        </Notice>
      ) : null}
      <SearchPage area={{ kind: 'everywhere' }} filters={filters} unknownPlace={unknownPlace} />
    </>
  );
}

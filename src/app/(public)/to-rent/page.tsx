import type { Metadata } from 'next';
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
  return <SearchPage area={{ kind: 'everywhere' }} filters={filters} unknownPlace={unknownPlace} />;
}

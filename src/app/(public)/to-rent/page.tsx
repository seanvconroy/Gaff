import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Notice } from '@/ui/Notice';
import { readSearchRequest, type SearchParams } from './query';
import { SearchPage } from './SearchPage';

async function resolve(searchParams: SearchParams) {
  const request = await readSearchRequest([], searchParams);
  if (request.kind === 'not_found') notFound();
  if (request.kind === 'redirect') permanentRedirect(request.path);
  return request;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { indexable } = await resolve(searchParams);
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
  const request = await resolve(searchParams);
  const { deleted } = await searchParams;
  return (
    <>
      {deleted ? (
        // M13: after deleting an account.
        <Notice tone="success" title="Your account is deleted" role="status">
          <p>Your profile, saved homes and alerts are gone, and you’re signed out.</p>
        </Notice>
      ) : null}
      <SearchPage request={request} />
    </>
  );
}

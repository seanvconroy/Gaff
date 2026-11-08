import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { areaHeading } from '@/domain/search/places';
import { readSearchRequest, type SearchParams } from '../query';
import { SearchPage } from '../SearchPage';

type Params = Promise<{ place: string[] }>;

async function resolve(params: Params, searchParams: SearchParams) {
  const { place } = await params;
  const request = await readSearchRequest(place, searchParams);
  if (request.kind === 'not_found') notFound();
  if (request.kind === 'redirect') permanentRedirect(request.path);
  return request;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { search, path, indexable } = await resolve(params, searchParams);
  const heading = areaHeading(search.area);
  return {
    title: heading,
    description: `${heading}, from checked landlords and agents. Free for renters, and every enquiry gets an answer.`,
    alternates: { canonical: path },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** M62, M113: a place's page, such as "Homes to rent in Rathmines", or a search near a street. */
export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const request = await resolve(params, searchParams);
  return <SearchPage request={request} />;
}

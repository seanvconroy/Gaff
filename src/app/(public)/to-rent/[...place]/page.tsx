import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { areaHeading, resolvePlacePath } from '@/domain/search/places';
import { readQuery, type SearchParams } from '../query';
import { SearchPage } from '../SearchPage';

type Params = Promise<{ place: string[] }>;

async function resolve(params: Params, searchParams: SearchParams) {
  const { place } = await params;
  const resolved = resolvePlacePath(place);
  if (!resolved) notFound();
  const query = await readQuery(searchParams);
  if (resolved.kind === 'redirect') {
    permanentRedirect(query.query ? `${resolved.path}?${query.query}` : resolved.path);
  }
  return { ...resolved, ...query };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { area, path, indexable } = await resolve(params, searchParams);
  const heading = areaHeading(area);
  return {
    title: heading,
    description: `${heading}, from checked landlords and agents. Free for renters, and every enquiry gets an answer.`,
    alternates: { canonical: path },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** M62: a place's page, such as "Homes to rent in Rathmines". */
export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { area, filters, unknownPlace } = await resolve(params, searchParams);
  return <SearchPage area={area} filters={filters} unknownPlace={unknownPlace} />;
}

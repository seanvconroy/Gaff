import { NextResponse, type NextRequest } from 'next/server';
import { placeDescription } from '@/copy/search';
import { suggestPlaces } from '@/domain/search/places';
import { env } from '@/lib/env';

/** M56: place suggestions as a renter types. The same for everyone, so it can be cached. */
export function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const typed = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 60);
  const places = suggestPlaces(typed).map((place) => ({
    slug: place.slug,
    name: place.name,
    description: placeDescription(place),
  }));
  return NextResponse.json(
    { places },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
  );
}

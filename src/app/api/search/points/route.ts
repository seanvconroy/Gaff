import { NextResponse, type NextRequest } from 'next/server';
import { readBBox } from '@/domain/search/url';
import { env } from '@/lib/env';
import { mapPoints } from '@/server/search/search';
import { searchFromParams, SHORT_CACHE } from '../read';

/**
 * M57, M117: the pins for the map's view: every home the search finds inside `view` (west,
 * south, east, north), up to 2,000. No personal data: an id, a point and the rent.
 */
export async function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const view = readBBox(request.nextUrl.searchParams.get('view'));
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete('view');
  const search = await searchFromParams(params);
  if (!search || !view) return new Response(null, { status: 400 });
  return NextResponse.json(
    { points: await mapPoints(search.area, search.filters, view) },
    { headers: SHORT_CACHE },
  );
}

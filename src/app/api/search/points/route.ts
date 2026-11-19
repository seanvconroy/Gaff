import { NextResponse, type NextRequest } from 'next/server';
import { filtersFromParams, readBBox } from '@/domain/search/filters';
import { mapPins } from '@/server/search/map';

export const dynamic = 'force-dynamic';

/**
 * M57, M117: the pins for the map's view (`view`: west, south, east, north), for the search the
 * rest of the query holds, as a search's own address does (UX-SR-12). An id (the public
 * reference), a point and the rent of each home that fits, up to 2,000: no personal data. The
 * same answer for everyone, so the CDN may keep it for a moment.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = readBBox(params.get('view'));
  if (!view) return new Response(null, { status: 400 });
  const filters = filtersFromParams(Object.fromEntries(params));
  return NextResponse.json(await mapPins(filters, view), {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}

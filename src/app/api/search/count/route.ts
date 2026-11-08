import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { countListings } from '@/server/search/search';
import { searchFromParams, SHORT_CACHE } from '../read';

/** M116, M122: "Show 23 homes" for the Filters sheet, and the rents for its histogram. */
export async function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const search = await searchFromParams(request.nextUrl.searchParams);
  if (!search) return new Response(null, { status: 400 });
  return NextResponse.json(await countListings(search.area, search.filters), {
    headers: SHORT_CACHE,
  });
}

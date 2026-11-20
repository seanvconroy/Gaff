import { NextResponse } from 'next/server';
import { filtersToParams } from '@/domain/search/filters';
import { confirmSearch } from '@/server/saved/searches';

export const dynamic = 'force-dynamic';

/**
 * UX-SR-10: the link in the one email a signed-out person gets. Opening it confirms the address
 * is theirs and the search is kept from now. Then a page says so, with the search's own chips in
 * its address (UX-SR-12: the filters' values and nothing personal).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const result = await confirmSearch(token);
  if (result.state !== 'confirmed') {
    return NextResponse.redirect(new URL('/alerts/expired', request.url));
  }
  const query = new URLSearchParams(filtersToParams(result.filters)).toString();
  return NextResponse.redirect(
    new URL(`/alerts/confirmed${query ? `?${query}` : ''}`, request.url),
  );
}
